export const SHARED_DEMO_ISSUER = 'karyora:shared-demo';
export const sharedDemoEnabled = (env = process.env) => env.SHARED_DEMO_ENABLED === '1';

// Used again when reserving AI credit: an expired/paused visit cannot start paid work.
export async function activeSharedDemo(c, org, env = process.env) {
  if (!sharedDemoEnabled(env)) return null;
  const [[row]] = await c.execute(`SELECT b.organization_id,b.workspace_id,b.credit_idr,
    DATE_FORMAT(b.starts_at,'%Y-%m-%dT%H:%i:%s.000Z') AS activatedAt,
    DATE_FORMAT(b.ends_at,'%Y-%m-%dT%H:%i:%s.000Z') AS expiresAt
    FROM shared_demo_bookings b JOIN shared_demo_control d ON d.id=1 AND d.enabled=1
    JOIN sessions s ON s.id=b.session_id AND s.user_id=d.user_id AND s.active_workspace_id=b.workspace_id AND s.revoked_at IS NULL
    JOIN users u ON u.id=s.user_id AND u.status='active'
    WHERE b.organization_id=? AND b.status='active' AND b.enabled=1
      AND b.starts_at<=UTC_TIMESTAMP() AND b.ends_at>UTC_TIMESTAMP()
      AND s.idle_expires_at>UTC_TIMESTAMP() AND s.absolute_expires_at>UTC_TIMESTAMP()`, [org]);
  return row ? {...row, active: true, shared: true, status: 'demo'} : null;
}

// Default-deny protects the internal shared identity from changing its account,
// viewing applicants, billing purchases, invitations, or switching workspaces.
export function sharedDemoRouteAllowed(method, path) {
  if (method === 'GET') return ['/auth/me','/auth/status','/api/config','/api/billing','/api/plans','/api/team','/api/task-templates'].includes(path)
    || /^\/api\/office\/(chat\/context|conversations(?:\/[a-f0-9-]{36})?)$/.test(path)
    || /^\/api\/dashboard\/(overview|usage|task-options|jobs|clients|workers|items(?:\/\d+(?:\/revisions)?)?)$/.test(path);
  if (method === 'POST') return ['/auth/logout','/api/office/chat','/api/office/conversations','/api/dashboard/jobs','/api/dashboard/clients'].includes(path)
    || /^\/api\/dashboard\/items\/\d+\/(approve|reject|revise)$/.test(path);
  return ['PATCH','DELETE'].includes(method) && /^\/api\/office\/conversations\/[a-f0-9-]{36}$/.test(path);
}
