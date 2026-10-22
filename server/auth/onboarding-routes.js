import { readCookie, resolveSession } from './sessions.js';

const TEAM_SIZES = new Set(['1-5', '6-20', '21-50', '50+']);

export function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export function validateOnboardingPayload(body) {
  const organizationName = String(body?.organizationName ?? '').trim().replace(/\s+/g, ' ').slice(0, 150);
  const workspaceName = String(body?.workspaceName ?? '').trim().replace(/\s+/g, ' ').slice(0, 150);
  const clientName = String(body?.clientName ?? '').trim().replace(/\s+/g, ' ').slice(0, 150);
  const clientBrief = String(body?.clientBrief ?? '').trim().slice(0, 4000);
  const teamSize = String(body?.teamSize ?? '');
  if (!organizationName) throw Object.assign(new Error('Nama organisasi wajib diisi.'), { status: 400 });
  if (!workspaceName) throw Object.assign(new Error('Nama workspace wajib diisi.'), { status: 400 });
  if (teamSize && !TEAM_SIZES.has(teamSize)) throw Object.assign(new Error('Ukuran tim tidak valid.'), { status: 400 });
  const organizationSlug = slugify(organizationName);
  if (!organizationSlug) throw Object.assign(new Error('Nama organisasi harus memuat huruf atau angka Latin.'), { status: 400 });
  return { organizationName, organizationSlug, workspaceName, clientName, clientBrief, teamSize: teamSize || null };
}

function publicResult({ organizationId, organizationName, workspaceId, workspaceName, clientId = null }) {
  return {
    organization: { id: organizationId, name: organizationName },
    workspace: { id: workspaceId, name: workspaceName },
    clientId,
  };
}

export function installOnboardingRoutes(app, { getPool, authEnabled = process.env.AUTH0_ENABLED === '1' } = {}) {
  app.post('/api/onboarding', async (req, res) => {
    if (!authEnabled) return res.status(503).json({ error: 'Onboarding requires configured authentication.' });
    const pool = getPool?.();
    if (!pool) return res.status(503).json({ error: 'Authentication service unavailable.' });

    let input;
    try { input = validateOnboardingPayload(req.body); } catch (error) { return res.status(error.status || 400).json({ error: error.message }); }

    let connection;
    try {
      connection = await pool.getConnection();
      const principal = await resolveSession(connection, readCookie(req.headers.cookie, 'vo_session'));
      if (!principal) return res.status(401).json({ error: 'Authentication required.' });

      await connection.beginTransaction();
      // Serializes first-time provisioning per user without trusting any client-supplied tenant ID.
      const [userRows] = await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [principal.userId]);
      if (!userRows[0]) throw Object.assign(new Error('Authenticated user no longer exists.'), { status: 401 });

      const [existingRows] = await connection.execute(
        `SELECT o.id AS organization_id, o.name AS organization_name, w.id AS workspace_id, w.name AS workspace_name
         FROM organizations o JOIN organization_memberships om ON om.organization_id = o.id
         JOIN workspaces w ON w.organization_id = o.id AND w.status = 'active'
         WHERE om.user_id = ? AND om.role = 'owner' AND om.revoked_at IS NULL AND o.status = 'active'
         ORDER BY o.id, w.id LIMIT 1`,
        [principal.userId],
      );
      const existing = existingRows[0];
      if (existing) {
        await connection.execute('UPDATE sessions SET active_workspace_id = ? WHERE id = ? AND user_id = ?', [existing.workspace_id, principal.sessionId, principal.userId]);
        await connection.commit();
        return res.status(200).json({ ...publicResult({ organizationId: existing.organization_id, organizationName: existing.organization_name, workspaceId: existing.workspace_id, workspaceName: existing.workspace_name }), existing: true });
      }

      const [slugRows] = await connection.execute('SELECT id FROM organizations WHERE slug = ? LIMIT 1', [input.organizationSlug]);
      if (slugRows[0]) throw Object.assign(new Error('Slug organisasi sudah digunakan. Gunakan nama organisasi yang berbeda.'), { status: 409, code: 'ORGANIZATION_SLUG_CONFLICT' });

      const [organization] = await connection.execute('INSERT INTO organizations (slug, name, created_by_user_id) VALUES (?, ?, ?)', [input.organizationSlug, input.organizationName, principal.userId]);
      const organizationId = organization.insertId;
      await connection.execute('INSERT INTO organization_memberships (organization_id, user_id, role, created_by_user_id) VALUES (?, ?, \'owner\', ?)', [organizationId, principal.userId, principal.userId]);
      const [workspace] = await connection.execute('INSERT INTO workspaces (organization_id, slug, name, created_by_user_id) VALUES (?, \'main\', \'Main workspace\', ?)', [organizationId, principal.userId]);
      const workspaceId = workspace.insertId;
      await connection.execute('INSERT INTO workspace_memberships (workspace_id, user_id, role, created_by_user_id) VALUES (?, ?, \'admin\', ?)', [workspaceId, principal.userId, principal.userId]);

      let clientId = null;
      if (input.clientName) {
        const [client] = await connection.execute(
          'INSERT INTO clients (name, brief, organization_id, workspace_id, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?)',
          [input.clientName, input.clientBrief || null, organizationId, workspaceId, principal.userId, principal.userId],
        );
        clientId = client.insertId;
      }
      await connection.execute('UPDATE sessions SET active_workspace_id = ? WHERE id = ? AND user_id = ?', [workspaceId, principal.sessionId, principal.userId]);
      await connection.commit();
      res.status(201).json({ ...publicResult({ organizationId, organizationName: input.organizationName, workspaceId, workspaceName: 'Main workspace', clientId }), existing: false });
    } catch (error) {
      await connection?.rollback().catch(() => {});
      if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Data onboarding sudah ada atau slug organisasi digunakan.' });
      if (error?.status && error.status < 500) return res.status(error.status).json({ error: error.message, code: error.code });
      console.error('[onboarding error]', error?.message || error);
      res.status(503).json({ error: 'Onboarding belum dapat diselesaikan. Coba lagi.' });
    } finally { connection?.release(); }
  });
}
