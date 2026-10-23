import { readCookie, resolveSession } from './sessions.js';
import { loadSessionProfile } from './profile.js';

const publicFailure = (message, status) => Object.assign(new Error(message), { status, expose: true });

function name(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 150) throw publicFailure(`${label} wajib diisi, maksimal 150 karakter.`, 400);
  return value.trim().replace(/\s+/g, ' ');
}

export function installAccountRoutes(app, { getPool, appOrigin }) {
  for (const action of ['profile', 'workspace']) app.post(`/api/account/${action}`, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!appOrigin || req.headers.origin !== appOrigin || !req.is('application/json')) return res.status(403).json({ error: 'Permintaan pengaturan tidak valid.' });
    const allowed = action === 'profile' ? ['displayName'] : ['workspaceName', 'organizationName'];
    if (!req.body || Array.isArray(req.body) || Object.keys(req.body).some((key) => !allowed.includes(key))) return res.status(400).json({ error: 'Isian pengaturan tidak valid.' });
    let connection;
    try {
      const displayName = action === 'profile' ? name(req.body.displayName, 'Nama akun') : null;
      const workspaceName = action === 'workspace' ? name(req.body.workspaceName, 'Nama workspace') : null;
      const organizationName = action === 'workspace' && req.body.organizationName !== undefined ? name(req.body.organizationName, 'Nama organisasi') : null;
      connection = await getPool()?.getConnection();
      if (!connection) throw new Error();
      const principal = await resolveSession(connection, readCookie(req.headers.cookie, 'vo_session'));
      if (!principal) return res.status(401).json({ error: 'Sesi berakhir. Silakan masuk kembali.' });
      await connection.beginTransaction();
      if (action === 'profile') {
        await connection.execute("UPDATE users SET display_name = ? WHERE id = ? AND status = 'active'", [displayName, principal.userId]);
      } else {
        const [rows] = await connection.execute(
          `SELECT w.id, w.organization_id, wm.role, om.role AS organization_role
           FROM workspaces w JOIN organizations o ON o.id = w.organization_id AND o.status = 'active'
           LEFT JOIN workspace_memberships wm ON wm.workspace_id = w.id AND wm.user_id = ? AND wm.revoked_at IS NULL
           LEFT JOIN organization_memberships om ON om.organization_id = o.id AND om.user_id = ? AND om.revoked_at IS NULL
           WHERE w.id = ? AND w.status = 'active' FOR UPDATE`,
          [principal.userId, principal.userId, principal.activeWorkspaceId ?? null],
        );
        const membership = rows[0];
        const owner = membership?.organization_role === 'owner';
        if (!membership || (!owner && membership.role !== 'admin') || (organizationName !== null && !owner)) throw publicFailure('Anda tidak memiliki izin mengubah pengaturan ini.', 403);
        await connection.execute("UPDATE workspaces SET name = ? WHERE id = ? AND organization_id = ? AND status = 'active'", [workspaceName, membership.id, membership.organization_id]);
        if (organizationName !== null) await connection.execute("UPDATE organizations SET name = ? WHERE id = ? AND status = 'active'", [organizationName, membership.organization_id]);
      }
      const profile = await loadSessionProfile(connection, principal);
      if (!profile) throw publicFailure('Sesi berakhir. Silakan masuk kembali.', 401);
      await connection.commit(); res.json(profile);
    } catch (error) {
      await connection?.rollback().catch(() => {});
      const expose = error.expose === true && [400, 401, 403].includes(error.status);
      res.status(expose ? error.status : 503).json({ error: expose ? error.message : 'Pengaturan belum dapat disimpan. Coba lagi.' });
    } finally { connection?.release(); }
  });
}
