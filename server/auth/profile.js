// This projection exposes only the session user's identity and memberships; it never accepts tenant IDs from the client.
export async function loadSessionProfile(connection, principal) {
  const [users] = await connection.execute(
    'SELECT id, email, display_name FROM users WHERE id = ? AND status = \'active\' LIMIT 1',
    [principal.userId],
  );
  const user = users[0];
  if (!user) return null;

  const [rows] = await connection.execute(
    `SELECT w.id AS workspace_id, w.slug AS workspace_slug, w.name AS workspace_name,
            o.id AS organization_id, o.slug AS organization_slug, o.name AS organization_name,
            wm.role AS workspace_role, om.role AS organization_role
       FROM workspaces w
       JOIN organizations o ON o.id = w.organization_id AND o.status = 'active'
       LEFT JOIN workspace_memberships wm ON wm.workspace_id = w.id AND wm.user_id = ? AND wm.revoked_at IS NULL
       LEFT JOIN organization_memberships om ON om.organization_id = o.id AND om.user_id = ? AND om.revoked_at IS NULL
      WHERE w.status = 'active' AND (wm.user_id IS NOT NULL OR om.role = 'owner')
      ORDER BY o.name, w.name`,
    [principal.userId, principal.userId],
  );
  const workspaces = rows.filter(row => !principal.sharedDemo || row.workspace_id === principal.activeWorkspaceId).map((row) => ({
    id: row.workspace_id,
    slug: row.workspace_slug,
    name: row.workspace_name,
    role: row.organization_role === 'owner' ? 'owner' : row.workspace_role,
    organization: { id: row.organization_id, slug: row.organization_slug, name: row.organization_name },
  }));
  return {
    user: { id: user.id, email: user.email, displayName: user.display_name },
    activeWorkspace: workspaces.find((workspace) => workspace.id === principal.activeWorkspaceId) || null,
    workspaces,
    ...(principal.sharedDemo ? {sharedDemo:principal.sharedDemo} : {}),
  };
}

export async function selectActiveWorkspace(connection, principal, workspaceId) {
  if (principal.sharedDemo) return false;
  if (!Number.isSafeInteger(workspaceId) || workspaceId <= 0) return false;
  const [memberships] = await connection.execute(
    `SELECT w.id
       FROM workspaces w
       JOIN organizations o ON o.id = w.organization_id AND o.status = 'active'
       LEFT JOIN workspace_memberships wm ON wm.workspace_id = w.id AND wm.user_id = ? AND wm.revoked_at IS NULL
       LEFT JOIN organization_memberships om ON om.organization_id = o.id AND om.user_id = ? AND om.revoked_at IS NULL
      WHERE w.id = ? AND w.status = 'active' AND (wm.user_id IS NOT NULL OR om.role = 'owner')
      FOR UPDATE`,
    [principal.userId, principal.userId, workspaceId],
  );
  if (!memberships[0]) return false;
  const [result] = await connection.execute(
    'UPDATE sessions SET active_workspace_id = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
    [workspaceId, principal.sessionId, principal.userId],
  );
  return result.affectedRows === 1;
}
