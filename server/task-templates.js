import { randomUUID } from 'node:crypto';
import { builtinTaskTemplates, exactKeys, templateError, templateInput } from '../shared/task-templates.js';

const scope = tenant => [tenant.organizationId, tenant.workspaceId];
const columns = 'id, name, description, definition, version, updated_at AS updatedAt';
const decode = row => { const { definition, ...rest } = row; return { ...rest, ...(typeof definition === 'string' ? JSON.parse(definition) : definition) }; };
export async function loadTaskTemplates(c, tenant) {
  const [rows] = await c.execute(`SELECT ${columns} FROM workspace_task_templates WHERE organization_id = ? AND workspace_id = ? AND status = 'active' ORDER BY updated_at DESC, id LIMIT 200`, scope(tenant));
  return rows.map(decode);
}
export async function saveTaskTemplate(c, tenant, userId, body, id) {
  const input = templateInput(body, !!id);
  const definition = JSON.stringify({ instructions: input.instructions, outputFormat: input.outputFormat, fields: input.fields });
  if (id) {
    const [result] = await c.execute("UPDATE workspace_task_templates SET name = ?, description = ?, definition = ?, version = version + 1, updated_by_user_id = ? WHERE organization_id = ? AND workspace_id = ? AND id = ? AND status = 'active' AND version = ?", [input.name, input.description, definition, userId, ...scope(tenant), id, body.version]);
    if (!result.affectedRows) await missingOrConflict(c, tenant, id);
  } else {
    const [[{ count }]] = await c.execute("SELECT COUNT(*) AS count FROM workspace_task_templates WHERE organization_id = ? AND workspace_id = ? AND status = 'active'", scope(tenant));
    if (count >= 200) throw templateError('Maksimal 200 template aktif per workspace.', 409);
    id = randomUUID();
    await c.execute('INSERT INTO workspace_task_templates (id, organization_id, workspace_id, name, description, definition, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, ...scope(tenant), input.name, input.description, definition, userId, userId]);
  }
  return { id };
}
async function missingOrConflict(c, tenant, id) {
  const [rows] = await c.execute("SELECT id FROM workspace_task_templates WHERE organization_id = ? AND workspace_id = ? AND id = ? AND status = 'active'", [...scope(tenant), id]);
  throw templateError(rows.length ? 'Template berubah. Muat ulang sebelum menyimpan.' : 'Template tidak ditemukan.', rows.length ? 409 : 404);
}
export function installTaskTemplateRoutes(app, { getPool, requireTenant, appOrigin }) {
  const handle = (write, action) => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (Object.keys(req.query).length) return res.status(400).json({ error: 'Parameter tenant atau pencarian tidak diterima oleh endpoint ini.' });
    if (write && (!appOrigin || req.get('origin') !== appOrigin || !req.is('application/json'))) return res.status(403).json({ error: 'Origin atau format permintaan tidak valid.' });
    if (write && !['owner', 'admin'].includes(req.tenantContext.role)) return res.status(403).json({ error: 'Hanya owner/admin yang boleh mengelola template.' });
    if (req.params.id && !/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: 'Template tidak ditemukan.' });
    let c;
    try {
      c = await getPool().getConnection();
      if (write) {
        await c.beginTransaction();
        const [rows] = await c.execute("SELECT id FROM workspaces WHERE organization_id = ? AND id = ? AND status = 'active' FOR UPDATE", scope(req.tenantContext));
        if (!rows.length) throw templateError('Workspace tidak tersedia.', 403);
      }
      const result = await action(c, req);
      if (write) await c.commit();
      res.json(result);
    } catch (error) {
      if (write) await c?.rollback().catch(() => {});
      const known = error.status >= 400 && error.status < 500;
      res.status(known ? error.status : 503).json({ error: known ? error.message : 'Template belum tersedia. Operator perlu memeriksa migration 014.' });
    } finally { c?.release(); }
  };
  app.get('/api/task-templates', requireTenant, handle(false, async (c, req) => ({ templates: await loadTaskTemplates(c, req.tenantContext), builtins: builtinTaskTemplates, canManage: !req.authPrincipal?.sharedDemo && !req.authPrincipal?.managedDemo && ['owner', 'admin'].includes(req.tenantContext.role), executionReady: true })));
  app.post('/api/task-templates', requireTenant, handle(true, (c, req) => saveTaskTemplate(c, req.tenantContext, req.authPrincipal.userId, req.body)));
  app.patch('/api/task-templates/:id', requireTenant, handle(true, (c, req) => saveTaskTemplate(c, req.tenantContext, req.authPrincipal.userId, req.body, req.params.id)));
  app.post('/api/task-templates/:id/archive', requireTenant, handle(true, async (c, req) => {
    exactKeys(req.body, ['version']);
    if (!Number.isSafeInteger(req.body.version) || req.body.version < 1) throw templateError('Versi template tidak valid.');
    const [result] = await c.execute("UPDATE workspace_task_templates SET status = 'archived', archived_at = CURRENT_TIMESTAMP, version = version + 1, updated_by_user_id = ? WHERE organization_id = ? AND workspace_id = ? AND id = ? AND status = 'active' AND version = ?", [req.authPrincipal.userId, ...scope(req.tenantContext), req.params.id, req.body.version]);
    if (!result.affectedRows) await missingOrConflict(c, req.tenantContext, req.params.id);
    return { archived: true };
  }));
}
