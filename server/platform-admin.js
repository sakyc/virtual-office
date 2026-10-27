import { randomUUID } from 'node:crypto';
import { authenticationEnabled } from './auth/config.js';
import { requirePlatformAdmin } from './billing-catalog.js';
import { billingError } from './billing-policy.js';

const fail = (code, status = 400) => { throw billingError(code, status); };
export function adminId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) fail('ADMIN_ID_INVALID');
  return Number(value);
}
export function adminPage(query, { members = false } = {}) {
  if (Object.keys(query).some((k) => !['q', 'after', 'limit', ...(members ? ['offset'] : [])].includes(k))) fail('ADMIN_FILTER_INVALID');
  const q = query.q ?? '';
  if (typeof q !== 'string' || q.length > 120 || /[\x00-\x1f]/.test(q)) fail('ADMIN_SEARCH_INVALID');
  const number = (key, fallback, max) => {
    if (query[key] === undefined) return fallback;
    if (typeof query[key] !== 'string' || !/^(0|[1-9][0-9]*)$/.test(query[key]) || !Number.isSafeInteger(Number(query[key])) || Number(query[key]) > max) fail('ADMIN_PAGE_INVALID');
    return Number(query[key]);
  };
  const limit = number('limit', 25, 50);
  if (!limit) fail('ADMIN_PAGE_INVALID');
  if (members && query.after !== undefined) fail('ADMIN_FILTER_INVALID');
  return { q: q.trim(), after: number('after', 0, Number.MAX_SAFE_INTEGER), limit, offset: number('offset', 0, 100000) };
}
const nextPage = (rows, limit) => ({ rows: rows.slice(0, limit), nextAfter: rows.length > limit ? rows[limit - 1].id : null });

export async function readAdminUsers(c, page) {
  const { q, after, limit } = page;
  const [rows] = await c.execute(`SELECT u.id, u.email, u.display_name AS displayName, u.status,
    u.created_at AS createdAt, u.last_login_at AS lastLoginAt,
    EXISTS(SELECT 1 FROM platform_admins pa WHERE pa.user_id=u.id AND pa.revoked_at IS NULL) AS platformAdmin,
    (SELECT COUNT(*) FROM sessions s WHERE s.user_id=u.id AND s.revoked_at IS NULL
      AND s.idle_expires_at>CURRENT_TIMESTAMP AND s.absolute_expires_at>CURRENT_TIMESTAMP) AS activeSessions
    FROM users u WHERE u.id > ? AND (? = '' OR INSTR(LOWER(CONCAT(u.email,' ',COALESCE(u.display_name,''))),LOWER(?))>0)
    ORDER BY u.id LIMIT ${limit + 1}`, [after, q, q]);
  return nextPage(rows, limit);
}
export async function readAdminOrganizations(c, page) {
  const { q, after, limit } = page;
  const [rows] = await c.execute(`SELECT o.id, o.name, o.slug, o.status, o.created_at AS createdAt,
    (SELECT COUNT(*) FROM workspaces w WHERE w.organization_id=o.id AND w.status='active') AS activeWorkspaces,
    (SELECT COUNT(*) FROM organization_memberships om WHERE om.organization_id=o.id AND om.revoked_at IS NULL) AS owners,
    (SELECT COUNT(DISTINCT wm.user_id) FROM workspace_memberships wm JOIN workspaces w ON w.id=wm.workspace_id
      WHERE w.organization_id=o.id AND wm.revoked_at IS NULL AND w.status='active') AS workspaceMembers
    FROM organizations o WHERE o.id > ? AND (? = '' OR INSTR(LOWER(CONCAT(o.name,' ',o.slug)),LOWER(?))>0)
    ORDER BY o.id LIMIT ${limit + 1}`, [after, q, q]);
  return nextPage(rows, limit);
}
export async function readAdminMembers(c, id, { q, offset, limit }) {
  const [[organization]] = await c.execute('SELECT id, name, status FROM organizations WHERE id = ?', [id]);
  if (!organization) fail('ADMIN_ORGANIZATION_NOT_FOUND', 404);
  const [rows] = await c.execute(`SELECT * FROM (
    SELECT u.id AS userId, u.email, u.display_name AS displayName, u.status AS userStatus, om.role,
      'organization' AS scope, NULL AS workspaceId, NULL AS workspaceName, NULL AS workspaceStatus
    FROM organization_memberships om JOIN users u ON u.id=om.user_id
    WHERE om.organization_id=? AND om.revoked_at IS NULL
    UNION ALL
    SELECT u.id, u.email, u.display_name, u.status, wm.role, 'workspace', w.id, w.name, w.status
    FROM workspace_memberships wm JOIN workspaces w ON w.id=wm.workspace_id JOIN users u ON u.id=wm.user_id
    WHERE w.organization_id=? AND wm.revoked_at IS NULL
    ) AS memberships WHERE (? = '' OR INSTR(LOWER(CONCAT(email,' ',COALESCE(displayName,''))),LOWER(?))>0)
    ORDER BY userId, scope, workspaceId LIMIT ${limit + 1} OFFSET ${offset}`, [id, id, q, q]);
  return { organization, rows: rows.slice(0, limit), nextOffset: rows.length > limit ? offset + limit : null };
}
export async function readAdminSubscriptions(c, { q, after, limit }) {
  const [rows] = await c.execute(`SELECT o.id, o.name AS organizationName, o.status AS organizationStatus,
    s.id AS subscriptionId, s.plan_code AS planCode, s.plan_version AS planVersion, s.status,
    CAST(s.monthly_price_idr AS CHAR) AS monthlyPriceIdr, CAST(s.included_credit_idr AS CHAR) AS includedCreditIdr,
    s.max_divisions AS maxDivisions, s.max_members AS maxMembers, s.whatsapp_enabled AS whatsapp,
    s.period_start AS periodStart, s.period_end AS periodEnd,
    CASE WHEN s.id IS NULL THEN 'none' WHEN s.status <> 'active' THEN s.status
      WHEN s.period_start > CURRENT_TIMESTAMP THEN 'scheduled' WHEN s.period_end <= CURRENT_TIMESTAMP THEN 'expired'
      WHEN o.status <> 'active' THEN 'organization_inactive' ELSE 'active' END AS effectiveStatus
    FROM organizations o LEFT JOIN billing_subscriptions s ON s.organization_id=o.id
    WHERE o.id > ? AND (? = '' OR INSTR(LOWER(CONCAT(o.name,' ',o.slug)),LOWER(?))>0)
    ORDER BY o.id LIMIT ${limit + 1}`, [after, q, q]);
  return nextPage(rows, limit);
}

export function validateUserAction(input) {
  if (!input || Array.isArray(input) || Object.keys(input).sort().join(',') !== 'action,expectedStatus,reason' ||
    !['suspend', 'activate', 'revoke_sessions'].includes(input.action) || !['active','suspended'].includes(input.expectedStatus) ||
    typeof input.reason !== 'string' || input.reason.trim().length < 5 || input.reason.trim().length > 500 || /[\x00-\x1f]/.test(input.reason)) fail('ADMIN_ACTION_INVALID');
  return { ...input, reason: input.reason.trim() };
}
export async function administerUser(c, actor, targetId, input) {
  const { action, reason, expectedStatus } = validateUserAction(input);
  if (actor.userId === targetId) fail('ADMIN_SELF_CHANGE_DENIED', 403);
  const [[user]] = await c.execute('SELECT id, status FROM users WHERE id = ? FOR UPDATE', [targetId]);
  if (!user) fail('ADMIN_USER_NOT_FOUND', 404);
  const [[grant]] = await c.execute('SELECT user_id FROM platform_admins WHERE user_id = ? AND revoked_at IS NULL FOR UPDATE', [targetId]);
  if (grant) fail('ADMIN_ACCOUNT_PROTECTED', 403);
  if (user.status !== expectedStatus) fail('ADMIN_USER_STATUS_CONFLICT', 409);
  const status = action === 'suspend' ? 'suspended' : action === 'activate' ? 'active' : user.status;
  if (action !== 'revoke_sessions' && status === user.status) fail('ADMIN_USER_STATUS_CONFLICT', 409);
  // Audit insertion and the account/session changes share the caller's transaction.
  // Missing migration 010 or any audit error rolls ALL changes back, never unaudited writes.
  await c.execute('UPDATE users SET status = ? WHERE id = ? AND status = ?', [status, targetId, expectedStatus]);
  let revokedSessions = 0;
  if (action !== 'activate') {
    const [result] = await c.execute("UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP, revoked_reason=? WHERE user_id=? AND revoked_at IS NULL", [`platform_admin:${actor.userId}:${action}`, targetId]);
    revokedSessions = result.affectedRows;
  }
  await c.execute(`INSERT INTO platform_admin_audit (id, actor_user_id, target_user_id, action, reason, before_snapshot, after_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [randomUUID(), actor.userId, targetId, action, reason,
    JSON.stringify({ status: user.status }), JSON.stringify({ status, revokedSessions })]);
  return { userId: targetId, status, revokedSessions };
}

export function installPlatformAdminRoutes(app, { getPool, env = process.env }) {
  async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (!authenticationEnabled(env)) return res.status(503).json({ code: 'AUTH_UNAVAILABLE' });
    const write = req.method === 'POST';
    const origin = env.APP_ORIGIN || (env.NODE_ENV === 'production' ? null : 'http://localhost:5173');
    if (write && (!origin || req.headers.origin !== origin || !req.is('application/json'))) return res.status(403).json({ code: 'ADMIN_ORIGIN_REQUIRED' });
    let c;
    try {
      c = await getPool().getConnection(); await c.beginTransaction();
      const actor = await requirePlatformAdmin(c, req);
      let result;
      if (write) {
        if (Object.keys(req.query).length) fail('ADMIN_FILTER_INVALID');
        result = await administerUser(c, actor, adminId(req.params.id), req.body);
      } else if (req.path.endsWith('/members')) result = await readAdminMembers(c, adminId(req.params.id), adminPage(req.query, { members: true }));
      else if (req.path === '/api/admin/users') result = await readAdminUsers(c, adminPage(req.query));
      else if (req.path === '/api/admin/organizations') result = await readAdminOrganizations(c, adminPage(req.query));
      else if (req.path === '/api/admin/subscriptions') result = await readAdminSubscriptions(c, adminPage(req.query));
      else {
        if (Object.keys(req.query).length) fail('ADMIN_FILTER_INVALID');
        const [rows] = await c.execute(`SELECT id, actor_user_id AS actorUserId, target_user_id AS targetUserId, action, reason,
          before_snapshot AS beforeSnapshot, after_snapshot AS afterSnapshot, created_at AS createdAt
          FROM platform_admin_audit ORDER BY created_at DESC, id DESC LIMIT 50`);
        result = { rows };
      }
      await c.commit(); res.json(result);
    } catch (e) {
      await c?.rollback().catch(() => {});
      const safe = [400,401,403,404,409].includes(e.status);
      res.status(safe ? e.status : 503).json({ code: safe ? e.code : e.code === 'ER_NO_SUCH_TABLE' ? 'ADMIN_SCHEMA_REQUIRED' : 'ADMIN_UNAVAILABLE' });
    } finally { c?.release(); }
  }
  app.get('/api/admin/users', handle);
  app.post('/api/admin/users/:id/actions', handle);
  app.get('/api/admin/organizations', handle);
  app.get('/api/admin/organizations/:id/members', handle);
  app.get('/api/admin/subscriptions', handle);
  app.get('/api/admin/activity', handle);
}
