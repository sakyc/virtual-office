import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { memberError, memberInput, exactMemberKeys, isManager, uuid } from '../shared/tenant-members.js';
import { normalizeEmail } from '../shared/auth-validation.js';
import { readCookie, resolveSession } from './auth/sessions.js';
import { enforceCapacity, lockBillingEntitlements } from './billing-enforcement.js';
import { loadTeam } from './workspace-team.js';
import { currentMember } from './member-context.js';

const scope = t => [t.organizationId, t.workspaceId];
export const invitationHash = token => createHash('sha256').update(token).digest();
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;

async function lockWorkspace(c, tenant) {
  const [[org]] = await c.execute("SELECT id FROM organizations WHERE id=? AND status='active' FOR UPDATE", [tenant.organizationId]);
  const [[workspace]] = await c.execute("SELECT id FROM workspaces WHERE organization_id=? AND id=? AND status='active' FOR UPDATE", scope(tenant));
  if (!org || !workspace) throw memberError('Workspace tidak aktif.', 403);
}
async function manager(c, tenant, principal) {
  const actor = await currentMember(c, tenant, principal.userId);
  if (!isManager(actor.role)) throw memberError('Hanya owner atau admin tenant yang dapat mengelola anggota.', 403);
  return actor;
}
async function audit(c, tenant, actor, action, details) {
  await c.execute('INSERT INTO workspace_member_audit (organization_id, workspace_id, actor_user_id, action, details) VALUES (?, ?, ?, ?, ?)', [...scope(tenant), actor, action, JSON.stringify(details)]);
}
async function validateAssignments(c, tenant, input) {
  const team = await loadTeam(c, tenant);
  if (input.divisionIds.some(id => !team.divisions.some(d => d.id === id)) || input.agentIds.some(id => !team.agents.some(a => a.id === id))) throw memberError('Divisi atau agen tidak aktif pada workspace ini.', 404);
}
async function saveAssignments(c, tenant, userId, input) {
  for (const [table, field, ids] of [['workspace_member_divisions', 'division_id', input.divisionIds], ['workspace_member_agents', 'agent_id', input.agentIds]]) {
    await c.execute(`DELETE FROM ${table} WHERE organization_id=? AND workspace_id=? AND user_id=?`, [...scope(tenant), userId]);
    for (const id of ids) await c.execute(`INSERT INTO ${table} (organization_id, workspace_id, user_id, ${field}) VALUES (?, ?, ?, ?)`, [...scope(tenant), userId, id]);
  }
  // A demoted viewer or unassigned member cannot remain approval PIC.
  await c.execute(`DELETE r FROM workspace_division_reviewers r WHERE r.organization_id=? AND r.workspace_id=? AND r.user_id=?
    AND (?='viewer' OR (?='member' AND NOT EXISTS (SELECT 1 FROM workspace_member_divisions d WHERE d.workspace_id=r.workspace_id AND d.user_id=r.user_id AND d.division_id=r.division_id)))`, [...scope(tenant), userId, input.role, input.role]);
}
export async function listTenantMembers(c, tenant, principal) {
  const actor = await currentMember(c, tenant, principal.userId);
  const [members] = await c.execute(`SELECT u.id, u.email, u.display_name AS displayName, wm.role, wm.membership_version AS version, om.role AS organizationRole
    FROM workspace_memberships wm JOIN users u ON u.id=wm.user_id AND u.status='active'
    JOIN workspaces w ON w.id=wm.workspace_id AND w.organization_id=?
    LEFT JOIN organization_memberships om ON om.organization_id=w.organization_id AND om.user_id=u.id AND om.revoked_at IS NULL
    WHERE wm.workspace_id=? AND wm.revoked_at IS NULL ORDER BY u.display_name, u.email`, scope(tenant));
  const [divisions] = await c.execute('SELECT user_id AS userId, division_id AS divisionId FROM workspace_member_divisions WHERE organization_id=? AND workspace_id=?', scope(tenant));
  const [agents] = await c.execute('SELECT user_id AS userId, agent_id AS agentId FROM workspace_member_agents WHERE organization_id=? AND workspace_id=?', scope(tenant));
  const [reviewers] = await c.execute('SELECT division_id AS divisionId, user_id AS userId FROM workspace_division_reviewers WHERE organization_id=? AND workspace_id=?', scope(tenant));
  const canManage = isManager(actor.role);
  const [invitations] = canManage ? await c.execute(`SELECT id, email_normalized AS email, role, expires_at AS expiresAt FROM workspace_invitations
    WHERE organization_id=? AND workspace_id=? AND revoked_at IS NULL AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP() ORDER BY created_at DESC LIMIT 100`, scope(tenant)) : [[]];
  return { canManage, actorRole: actor.role, members: members.map(m => ({ ...m, role: m.organizationRole === 'owner' ? 'owner' : m.role,
    divisionIds: divisions.filter(d => d.userId === m.id).map(d => d.divisionId), agentIds: agents.filter(a => a.userId === m.id).map(a => a.agentId) })),
    reviewers, invitations, ...await loadTeam(c, tenant) };
}
export async function inviteTenantMember(c, tenant, principal, body) {
  const input = memberInput(body, true);
  const actor = await manager(c, tenant, principal);
  if (input.role === 'admin' && actor.role !== 'owner') throw memberError('Hanya owner yang dapat memberi role admin.', 403);
  const [[alreadyJoined]] = await c.execute(`SELECT wm.user_id FROM workspace_memberships wm JOIN users u ON u.id=wm.user_id
    WHERE wm.workspace_id=? AND LOWER(u.email)=? AND wm.revoked_at IS NULL LIMIT 1`, [tenant.workspaceId, input.email]);
  if (alreadyJoined) throw memberError('Email ini sudah menjadi anggota aktif. Gunakan Edit akses untuk mengubah role.', 409);
  const entitlements = await lockBillingEntitlements(c, tenant.organizationId);
  const [[existingSeat]] = await c.execute(`SELECT u.id FROM users u WHERE LOWER(u.email)=? AND u.status='active'
    AND (EXISTS (SELECT 1 FROM organization_memberships om WHERE om.organization_id=? AND om.user_id=u.id AND om.revoked_at IS NULL)
      OR EXISTS (SELECT 1 FROM workspace_memberships wm JOIN workspaces w ON w.id=wm.workspace_id AND w.status='active' WHERE w.organization_id=? AND wm.user_id=u.id AND wm.revoked_at IS NULL)) LIMIT 1`, [input.email, tenant.organizationId, tenant.organizationId]);
  enforceCapacity(entitlements, { addMembers: existingSeat ? 0 : 1 });
  await validateAssignments(c, tenant, input);
  const [[pending]] = await c.execute(`SELECT COUNT(*) AS count FROM workspace_invitations WHERE organization_id=? AND workspace_id=?
    AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP()`, scope(tenant));
  if (Number(pending.count) >= 100) throw memberError('Terlalu banyak undangan tertunda.', 409);
  const [duplicate] = await c.execute(`SELECT id FROM workspace_invitations WHERE workspace_id=? AND email_normalized=?
    AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP()`, [tenant.workspaceId, input.email]);
  if (duplicate.length) throw memberError('Undangan email ini masih aktif. Cabut dahulu jika perlu membuat tautan baru.', 409);
  const id = randomUUID(), token = randomBytes(32).toString('base64url');
  await c.execute(`INSERT INTO workspace_invitations (id, organization_id, workspace_id, email_normalized, role, assignments, token_hash, created_by_user_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 3 DAY))`, [id, ...scope(tenant), input.email, input.role, JSON.stringify({ divisionIds: input.divisionIds, agentIds: input.agentIds }), invitationHash(token), principal.userId]);
  await audit(c, tenant, principal.userId, 'invite', { invitationId: id, email: input.email, role: input.role });
  return { id, token, expiresInHours: 72 };
}
export async function updateTenantMember(c, tenant, principal, userId, body, revoke = false) {
  const actor = await manager(c, tenant, principal);
  if (!Number.isSafeInteger(userId) || userId < 1 || userId === principal.userId) throw memberError('Tidak dapat mengubah akses sendiri di sini.', 403);
  const target = await currentMember(c, tenant, userId);
  const input = revoke ? (exactMemberKeys(body, ['version']), { version: body.version }) : memberInput(body);
  if (target.role === 'owner' || (actor.role !== 'owner' && (target.role === 'admin' || input.role === 'admin'))) throw memberError('Hanya owner dapat mengelola admin; role owner dilindungi.', 403);
  if (!Number.isSafeInteger(input.version) || input.version !== target.version) throw memberError('Akses anggota telah berubah. Muat ulang.', 409);
  if (!revoke) await validateAssignments(c, tenant, input);
  await c.execute(`UPDATE workspace_memberships SET ${revoke ? 'revoked_at=UTC_TIMESTAMP()' : 'role=?'}, membership_version=membership_version+1 WHERE workspace_id=? AND user_id=? AND membership_version=? AND revoked_at IS NULL`, [...(revoke ? [] : [input.role]), tenant.workspaceId, userId, input.version]);
  await saveAssignments(c, tenant, userId, revoke ? { role: 'viewer', divisionIds: [], agentIds: [] } : input);
  if (revoke) await c.execute(`UPDATE workspace_invitations SET revoked_at=UTC_TIMESTAMP() WHERE organization_id=? AND workspace_id=?
    AND email_normalized=(SELECT LOWER(email) FROM users WHERE id=?) AND consumed_at IS NULL AND revoked_at IS NULL`, [...scope(tenant), userId]);
  await audit(c, tenant, principal.userId, revoke ? 'revoke_member' : 'update_member', { userId, previousRole: target.role, ...input });
  return { saved: true };
}
export async function setDivisionReviewer(c, tenant, principal, divisionId, body) {
  await manager(c, tenant, principal); exactMemberKeys(body, ['userId']);
  if (!uuid(divisionId) || (body.userId !== null && (!Number.isSafeInteger(body.userId) || body.userId < 1))) throw memberError('PIC tidak valid.');
  await validateAssignments(c, tenant, { divisionIds: [divisionId], agentIds: [] });
  if (body.userId !== null) {
    const target = await currentMember(c, tenant, body.userId);
    if (target.role === 'viewer') throw memberError('Viewer tidak dapat menjadi PIC persetujuan.', 403);
    if (target.role === 'member') {
      const [[assigned]] = await c.execute('SELECT user_id FROM workspace_member_divisions WHERE organization_id=? AND workspace_id=? AND user_id=? AND division_id=?', [...scope(tenant), body.userId, divisionId]);
      if (!assigned) throw memberError('PIC member harus ditugaskan ke seluruh divisi tersebut.', 403);
    }
  }
  await c.execute('DELETE FROM workspace_division_reviewers WHERE organization_id=? AND workspace_id=? AND division_id=?', [...scope(tenant), divisionId]);
  if (body.userId !== null) await c.execute('INSERT INTO workspace_division_reviewers (division_id, organization_id, workspace_id, user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?)', [divisionId, ...scope(tenant), body.userId, principal.userId]);
  await audit(c, tenant, principal.userId, 'set_reviewer', { divisionId, userId: body.userId });
  return { saved: true };
}
export async function acceptTenantInvitation(c, principal, token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw memberError('Undangan tidak valid.', 404);
  const hash = invitationHash(token);
  const [[scopeRow]] = await c.execute('SELECT organization_id AS organizationId, workspace_id AS workspaceId FROM workspace_invitations WHERE token_hash=?', [hash]);
  if (!scopeRow) throw memberError('Undangan tidak valid.', 404);
  await lockWorkspace(c, scopeRow);
  const [[invite]] = await c.execute(`SELECT *, expires_at>UTC_TIMESTAMP() AS live FROM workspace_invitations WHERE token_hash=? FOR UPDATE`, [hash]);
  if (!invite || !invite.live || invite.revoked_at || invite.consumed_at) throw memberError('Undangan kedaluwarsa, dicabut, atau sudah digunakan.', 410);
  const [[user]] = await c.execute("SELECT email FROM users WHERE id=? AND status='active' FOR UPDATE", [principal.userId]);
  if (!user || normalizeEmail(user.email) !== invite.email_normalized) throw memberError('Masuk dengan email yang menerima undangan.', 403);
  const inviter = await manager(c, scopeRow, { userId: invite.created_by_user_id });
  if (invite.role === 'admin' && inviter.role !== 'owner') throw memberError('Pemberi undangan tidak lagi berwenang.', 403);
  const entitlements = await lockBillingEntitlements(c, scopeRow.organizationId);
  const [[existing]] = await c.execute(`SELECT 1 AS present FROM organization_memberships WHERE organization_id=? AND user_id=? AND revoked_at IS NULL
    UNION ALL SELECT 1 FROM workspace_memberships wm JOIN workspaces w ON w.id=wm.workspace_id AND w.status='active'
    WHERE w.organization_id=? AND wm.user_id=? AND wm.revoked_at IS NULL LIMIT 1`, [scopeRow.organizationId, principal.userId, scopeRow.organizationId, principal.userId]);
  enforceCapacity(entitlements, { addMembers: existing ? 0 : 1 });
  const [[joined]] = await c.execute('SELECT revoked_at FROM workspace_memberships WHERE workspace_id=? AND user_id=? FOR UPDATE', [scopeRow.workspaceId, principal.userId]);
  if (joined && !joined.revoked_at) throw memberError('Anda sudah menjadi anggota workspace ini. Undangan tidak mengubah role yang ada.', 409);
  const input = memberInput({ role: invite.role, ...parse(invite.assignments), version: 1 });
  await validateAssignments(c, scopeRow, input);
  await c.execute(`INSERT INTO workspace_memberships (workspace_id, user_id, role, created_by_user_id) VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE role=VALUES(role), revoked_at=NULL, membership_version=membership_version+1`, [scopeRow.workspaceId, principal.userId, input.role, invite.created_by_user_id]);
  await saveAssignments(c, scopeRow, principal.userId, input);
  const [[session]] = await c.execute(`SELECT id FROM sessions WHERE id=? AND user_id=? AND revoked_at IS NULL
    AND idle_expires_at>UTC_TIMESTAMP() AND absolute_expires_at>UTC_TIMESTAMP() FOR UPDATE`, [principal.sessionId, principal.userId]);
  if (!session) throw memberError('Sesi berakhir. Silakan masuk kembali.', 401);
  await c.execute('UPDATE workspace_invitations SET consumed_at=UTC_TIMESTAMP() WHERE id=?', [invite.id]);
  // The accepted workspace comes from the hashed invitation, not request identity fields.
  await c.execute('UPDATE sessions SET active_workspace_id=? WHERE id=? AND user_id=? AND revoked_at IS NULL', [scopeRow.workspaceId, principal.sessionId, principal.userId]);
  await audit(c, scopeRow, principal.userId, 'accept_invitation', { invitationId: invite.id, role: input.role });
  return { joined: true };
}

export function installTenantMemberRoutes(app, { getPool, requireTenant, appOrigin }) {
  function handler(write, action) { return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (Object.keys(req.query).length) return res.status(400).json({ error: 'Parameter identitas atau cakupan tidak diterima.' });
    if (write && (!appOrigin || req.headers.origin !== appOrigin || !req.is('application/json'))) return res.status(403).json({ error: 'Permintaan anggota harus berasal dari aplikasi ini.' });
    let c;
    try {
      c = await getPool().getConnection();
      if (write) { await c.beginTransaction(); if (req.tenantContext) await lockWorkspace(c, req.tenantContext); }
      const result = await action(c, req);
      if (write) await c.commit();
      res.json(result);
    } catch (error) {
      if (write) await c?.rollback().catch(() => {});
      const exposed = [400, 401, 402, 403, 404, 409, 410].includes(error.status);
      res.status(exposed ? error.status : 503).json({ error: exposed ? error.message : 'Pengelolaan anggota belum tersedia. Periksa migration 016.' });
    } finally { c?.release(); }
  }; }
  const base = '/api/workspace/members';
  app.get(base, requireTenant, handler(false, (c, req) => listTenantMembers(c, req.tenantContext, req.authPrincipal)));
  app.post(`${base}/invitations`, requireTenant, handler(true, async (c, req) => {
    const result = await inviteTenantMember(c, req.tenantContext, req.authPrincipal, req.body);
    return { id: result.id, inviteUrl: `${appOrigin}/join#token=${result.token}`, expiresInHours: result.expiresInHours };
  }));
  app.post(`${base}/invitations/:id/revoke`, requireTenant, handler(true, async (c, req) => {
    await manager(c, req.tenantContext, req.authPrincipal); exactMemberKeys(req.body, []);
    if (!uuid(req.params.id)) throw memberError('Undangan tidak valid.');
    const [changed] = await c.execute('UPDATE workspace_invitations SET revoked_at=UTC_TIMESTAMP() WHERE organization_id=? AND workspace_id=? AND id=? AND consumed_at IS NULL AND revoked_at IS NULL', [...scope(req.tenantContext), req.params.id]);
    if (!changed.affectedRows) throw memberError('Undangan tidak ditemukan.', 404);
    await audit(c, req.tenantContext, req.authPrincipal.userId, 'revoke_invitation', { invitationId: req.params.id });
    return { saved: true };
  }));
  app.patch(`${base}/:id`, requireTenant, handler(true, (c, req) => updateTenantMember(c, req.tenantContext, req.authPrincipal, Number(req.params.id), req.body)));
  app.post(`${base}/:id/revoke`, requireTenant, handler(true, (c, req) => updateTenantMember(c, req.tenantContext, req.authPrincipal, Number(req.params.id), req.body, true)));
  app.put(`${base}/reviewers/:id`, requireTenant, handler(true, (c, req) => setDivisionReviewer(c, req.tenantContext, req.authPrincipal, req.params.id, req.body)));
  app.post('/api/workspace/invitations/accept', handler(true, async (c, req) => {
    exactMemberKeys(req.body, ['token']);
    const principal = await resolveSession(c, readCookie(req.headers.cookie, 'vo_session'));
    if (!principal) throw memberError('Masuk atau daftar dahulu, lalu buka kembali tautan undangan.', 401);
    return acceptTenantInvitation(c, principal, req.body.token);
  }));
}
