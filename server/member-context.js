import { memberError } from '../shared/tenant-members.js';

// Read persisted membership, not the role snapshot supplied by the request's earlier gate.
export async function currentMember(c, tenant, userId) {
  const [[row]] = await c.execute(`SELECT wm.role, wm.membership_version AS version, om.role AS organizationRole
    FROM workspaces w JOIN organizations o ON o.id=w.organization_id AND o.status='active'
    JOIN users u ON u.id=? AND u.status='active'
    LEFT JOIN workspace_memberships wm ON wm.workspace_id=w.id AND wm.user_id=u.id AND wm.revoked_at IS NULL
    LEFT JOIN organization_memberships om ON om.organization_id=w.organization_id AND om.user_id=u.id AND om.revoked_at IS NULL
    WHERE w.organization_id=? AND w.id=? AND w.status='active'`, [userId, tenant.organizationId, tenant.workspaceId]);
  if (!row || (!row.role && row.organizationRole !== 'owner')) throw memberError('Keanggotaan workspace tidak aktif.', 403);
  return { ...row, role: row.organizationRole === 'owner' ? 'owner' : row.role };
}
