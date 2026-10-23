import { jobById } from '../shared/jobs.js';
import { SPEC } from './jobSpecs.js';
import { generate } from './runner.js';
import { trackedClient } from './ai-usage.js';

const TEAM_ROLES = new Set(['owner', 'admin']);
const userError = (message, status = 400) => Object.assign(new Error(message), { status });

function cleanParams(definition, raw = {}) {
  const result = {};
  for (const field of definition.fields) {
    let value = raw[field.name];
    if (field.type === 'multi') value = (Array.isArray(value) ? value : []).filter((entry) => field.options.includes(entry));
    else if (field.type === 'number') value = Math.min(field.max ?? 100, Math.max(field.min ?? 1, Math.round(Number(value)) || field.default || field.min || 1));
    else if (field.type === 'select') value = field.options.includes(value) ? value : (field.default ?? field.options[0]);
    else if (field.type === 'month') value = /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : '';
    else if (field.type === 'item') value = Number(value) > 0 ? Number(value) : null;
    else value = String(value ?? '').trim().slice(0, field.type === 'textarea' ? field.limit || 8000 : 300);
    if (field.required && (value === '' || value == null || (Array.isArray(value) && !value.length))) throw userError(`${field.label} wajib diisi.`);
    result[field.name] = value;
  }
  if (definition.anyOf && !definition.anyOf.some((name) => result[name])) throw userError(`Isi salah satu input yang diperlukan.`);
  return result;
}

export async function createTenantJob(connection, { tenantContext, principal, body }) {
  if (!TEAM_ROLES.has(tenantContext?.role)) throw userError('Workspace admin permission required.', 403);
  const definition = jobById(body?.jobType);
  if (!definition) throw userError('Jenis perintah tidak dikenal.');
  const params = cleanParams(definition, body?.params);
  const clientId = Number(body?.clientId) || null;
  if (clientId) {
    const [clients] = await connection.execute('SELECT id FROM clients WHERE id = ? AND organization_id = ? AND workspace_id = ?', [clientId, tenantContext.organizationId, tenantContext.workspaceId]);
    if (!clients[0]) throw userError('Klien tidak ditemukan pada workspace aktif.', 404);
  }
  const itemField = definition.fields.find((field) => field.type === 'item');
  const parentItemId = itemField ? params[itemField.name] : null;
  if (parentItemId) {
    const [parents] = await connection.execute('SELECT id FROM items WHERE id = ? AND organization_id = ? AND workspace_id = ? AND deleted_at IS NULL', [parentItemId, tenantContext.organizationId, tenantContext.workspaceId]);
    if (!parents[0]) throw userError('Item bahan dasar tidak ditemukan pada workspace aktif.', 404);
  }
  const [result] = await connection.execute(
    `INSERT INTO jobs (agent_id, job_type, client_id, parent_item_id, params, organization_id, workspace_id, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [definition.agent, definition.id, clientId, parentItemId, JSON.stringify(params), tenantContext.organizationId, tenantContext.workspaceId, principal.userId],
  );
  return { jobId: result.insertId, jobType: definition.id };
}

export async function saveTenantJobOutput({ connection, job, output, definition, tenantContext, userId }) {
  const params = typeof job.params === 'string' ? JSON.parse(job.params) : job.params;
  const tag = SPEC[definition.id].tag?.(params)?.slice(0, 120) ?? null;
  await connection.beginTransaction();
  try {
    for (const item of output.items) {
      await connection.execute(
        `INSERT INTO items (job_id, parent_id, client_id, agent_id, type, title, tag, content, organization_id, workspace_id, created_by_user_id, updated_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [job.id, job.parent_item_id, job.client_id, definition.agent, definition.type, item.title, tag, JSON.stringify(item.content), tenantContext.organizationId, tenantContext.workspaceId, userId, userId],
      );
    }
    await connection.execute("UPDATE jobs SET status = 'done', model = ?, tokens_in = ?, tokens_out = ?, finished_at = NOW() WHERE id = ? AND organization_id = ? AND workspace_id = ?", [output.model, output.usage.in, output.usage.out, job.id, tenantContext.organizationId, tenantContext.workspaceId]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
}

export async function processTenantJob({ pool, client, DEMO, models, jobId, tenantContext, userId, usageStore }) {
  try {
    const [jobs] = await pool.execute('SELECT * FROM jobs WHERE id = ? AND organization_id = ? AND workspace_id = ? LIMIT 1', [jobId, tenantContext.organizationId, tenantContext.workspaceId]);
    const job = jobs[0];
    if (!job || job.status !== 'generating') return;
    const definition = jobById(job.job_type);
    if (!definition) throw new Error('Unknown tenant job definition.');
    const [clients] = job.client_id ? await pool.execute('SELECT name, brief FROM clients WHERE id = ? AND organization_id = ? AND workspace_id = ? LIMIT 1', [job.client_id, tenantContext.organizationId, tenantContext.workspaceId]) : [[]];
    const [parents] = job.parent_item_id ? await pool.execute('SELECT id, type, title, content FROM items WHERE id = ? AND organization_id = ? AND workspace_id = ? AND deleted_at IS NULL LIMIT 1', [job.parent_item_id, tenantContext.organizationId, tenantContext.workspaceId]) : [[]];
    const parent = parents[0] ? { ...parents[0], content: typeof parents[0].content === 'string' ? JSON.parse(parents[0].content) : parents[0].content } : null;
    const apiClient = trackedClient(client, usageStore, { ...tenantContext, userId, operation: 'job', resourceId: job.id, agentId: definition.agent });
    const output = await generate({ apiClient, DEMO, models, def: definition, params: typeof job.params === 'string' ? JSON.parse(job.params) : job.params, clientRow: clients[0] || null, parent });
    const connection = await pool.getConnection();
    try { await saveTenantJobOutput({ connection, job, output, definition, tenantContext, userId }); } finally { connection.release(); }
  } catch {
    // The client receives only job status, never provider or prompt details.
    await pool.execute("UPDATE jobs SET status = 'failed', error = 'Job tidak dapat diselesaikan.', finished_at = NOW() WHERE id = ? AND organization_id = ? AND workspace_id = ? AND status = 'generating'", [jobId, tenantContext.organizationId, tenantContext.workspaceId]).catch(() => {});
  }
}
