import { readCookie, resolveSession } from './sessions.js';
import { authenticationEnabled } from './config.js';

export function createTenantGate({ getPool, authEnabled = authenticationEnabled(), cookieName = 'vo_session', resourceQueriesScoped = false }) {
  return async (req, res, next) => {
    res.setHeader?.('Cache-Control', 'no-store');
    if (!authEnabled) return res.status(503).json({ error: 'Customer API requires configured authentication.' });
    const pool = getPool(); if (!pool) return res.status(503).json({ error: 'Authentication service unavailable.' });
    let connection;
    try {
      connection = await pool.getConnection();
      const principal = await resolveSession(connection, readCookie(req.headers.cookie, cookieName));
      if (!principal) return res.status(401).json({ error: 'Authentication required.' });
      if (!principal.activeWorkspaceId) return res.status(403).json({ error: 'Active workspace required.' });
      const [memberships] = await connection.execute(
        `SELECT w.organization_id AS organizationId, wm.role, om.role AS organizationRole
         FROM workspaces w JOIN organizations o ON o.id = w.organization_id AND o.status = 'active'
         LEFT JOIN workspace_memberships wm ON wm.workspace_id = w.id AND wm.user_id = ? AND wm.revoked_at IS NULL
         LEFT JOIN organization_memberships om ON om.organization_id = w.organization_id AND om.user_id = ? AND om.revoked_at IS NULL
         WHERE w.id = ? AND w.status = 'active'`,
        [principal.userId, principal.userId, principal.activeWorkspaceId],
      );
      const membership = memberships[0];
      if (!membership || (!['admin', 'member', 'viewer'].includes(membership.role) && membership.organizationRole !== 'owner')) return res.status(403).json({ error: 'Workspace membership required.' });
      req.authPrincipal = principal;
      req.tenantContext = { organizationId: membership.organizationId, workspaceId: principal.activeWorkspaceId, role: membership.organizationRole === 'owner' ? 'owner' : membership.role };
      // Existing queries are global and cannot safely serve a tenant even after membership succeeds.
      if (!resourceQueriesScoped) return res.status(503).json({ error: 'Tenant-scoped resource API is not available yet.' });
      next();
    } catch {
      res.status(503).json({ error: 'Authentication service unavailable.' });
    } finally { connection?.release(); }
  };
}
