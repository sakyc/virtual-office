import { memberError, isManager } from '../shared/tenant-members.js';
import { currentMember } from './member-context.js';

export async function lockMemberPolicy(c, tenant) {
  if (!tenant.memberPolicy) return;
  const [[org]] = await c.execute("SELECT id FROM organizations WHERE id=? AND status='active' FOR UPDATE", [tenant.organizationId]);
  const [[workspace]] = await c.execute("SELECT id FROM workspaces WHERE organization_id=? AND id=? AND status='active' FOR UPDATE", [tenant.organizationId, tenant.workspaceId]);
  if (!org || !workspace) throw memberError('Workspace tidak aktif.', 403);
}

// Enabled explicitly by the production tenant gate; identity is never taken from a body/query.
export async function assertTenantAgentAccess(c, tenant, agentId) {
  if (!tenant.memberPolicy) return;
  const actor = await currentMember(c, tenant, tenant.userId);
  if (isManager(actor.role)) return;
  if (actor.role !== 'member') throw memberError('Viewer tidak dapat menggunakan agen AI.', 403);
  const [[assigned]] = await c.execute(`SELECT a.id FROM workspace_agents a
    JOIN workspace_divisions d ON d.id=a.division_id AND d.organization_id=a.organization_id AND d.workspace_id=a.workspace_id AND d.status='active'
    WHERE a.organization_id=? AND a.workspace_id=? AND a.id=? AND a.status='active'
      AND (EXISTS (SELECT 1 FROM workspace_member_divisions md WHERE md.organization_id=a.organization_id AND md.workspace_id=a.workspace_id AND md.division_id=a.division_id AND md.user_id=?)
        OR EXISTS (SELECT 1 FROM workspace_member_agents ma WHERE ma.organization_id=a.organization_id AND ma.workspace_id=a.workspace_id AND ma.agent_id=a.id AND ma.user_id=?))`,
  [tenant.organizationId, tenant.workspaceId, agentId, tenant.userId, tenant.userId]);
  if (!assigned) throw memberError('Agen ini belum ditugaskan kepada Anda. Hubungi admin tenant.', 403);
}
export async function itemReviewAccess(c, tenant, itemId) {
  const [[row]] = await c.execute(`SELECT i.id, r.user_id AS reviewerUserId, COALESCE(u.display_name, u.email) AS reviewerName, d.name AS divisionName
    FROM items i JOIN jobs j ON j.id=i.job_id AND j.organization_id=i.organization_id AND j.workspace_id=i.workspace_id
    LEFT JOIN workspace_agents a ON a.id=i.agent_id AND a.organization_id=i.organization_id AND a.workspace_id=i.workspace_id AND a.status='active'
    LEFT JOIN workspace_divisions d ON d.id=a.division_id AND d.organization_id=a.organization_id AND d.workspace_id=a.workspace_id AND d.status='active'
    LEFT JOIN workspace_division_reviewers r ON r.division_id=d.id AND r.organization_id=i.organization_id AND r.workspace_id=i.workspace_id
    LEFT JOIN workspace_memberships wm ON wm.workspace_id=r.workspace_id AND wm.user_id=r.user_id AND wm.revoked_at IS NULL AND wm.role IN ('admin','member')
    LEFT JOIN users u ON u.id=wm.user_id AND u.status='active'
    WHERE i.organization_id=? AND i.workspace_id=? AND i.id=? AND i.deleted_at IS NULL`, [tenant.organizationId, tenant.workspaceId, itemId]);
  if (!row) throw memberError('Item tidak ditemukan pada workspace aktif.', 404);
  const actor = await currentMember(c, tenant, tenant.userId);
  const canReview = isManager(actor.role) || (actor.role === 'member' && row.reviewerName !== null && Number(row.reviewerUserId) === tenant.userId);
  return { canReview, reviewer: row.reviewerName ? { userId: row.reviewerUserId, name: row.reviewerName } : null, divisionName: row.divisionName };
}
export async function assertTenantItemReview(c, tenant, itemId) {
  if (!tenant.memberPolicy) return;
  if (!(await itemReviewAccess(c, tenant, itemId)).canReview) throw memberError('Persetujuan, penolakan, dan revisi hanya untuk PIC divisi atau owner/admin tenant.', 403);
}

export async function reviewRoutingForItems(c, tenant, ids) {
  if (!ids.length) return new Map();
  const actor = await currentMember(c, tenant, tenant.userId);
  const [rows] = await c.execute(`SELECT i.id, r.user_id AS reviewerUserId, COALESCE(u.display_name,u.email) AS reviewerName
    FROM items i JOIN jobs j ON j.id=i.job_id AND j.organization_id=i.organization_id AND j.workspace_id=i.workspace_id
    LEFT JOIN workspace_agents a ON a.id=i.agent_id AND a.organization_id=i.organization_id AND a.workspace_id=i.workspace_id AND a.status='active'
    LEFT JOIN workspace_divisions d ON d.id=a.division_id AND d.organization_id=a.organization_id AND d.workspace_id=a.workspace_id AND d.status='active'
    LEFT JOIN workspace_division_reviewers r ON r.division_id=d.id AND r.organization_id=i.organization_id AND r.workspace_id=i.workspace_id
    LEFT JOIN workspace_memberships wm ON wm.workspace_id=r.workspace_id AND wm.user_id=r.user_id AND wm.revoked_at IS NULL AND wm.role IN ('admin','member')
    LEFT JOIN users u ON u.id=wm.user_id AND u.status='active'
    WHERE i.organization_id=? AND i.workspace_id=? AND i.deleted_at IS NULL AND i.id IN (${ids.map(() => '?').join(',')})`, [tenant.organizationId, tenant.workspaceId, ...ids]);
  return new Map(rows.map(row => [row.id, { canReview: isManager(actor.role) || (actor.role === 'member' && Boolean(row.reviewerName) && Number(row.reviewerUserId) === tenant.userId),
    reviewer: row.reviewerName ? { userId: row.reviewerUserId, name: row.reviewerName } : null }]));
}
