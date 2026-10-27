// Explicit local rollback-only integration verification. Provider/billing dispatch mocked; no paid calls.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { connectApprovedNonProduction, migrationConnectionOptions } from '../server/migrations/database.js';
import { inspectMigrationDirectory, inspectDatabaseHistory } from '../server/migrations/status.js';
import { applyMigrations, acquireMigrationLock, releaseMigrationLock } from '../server/migrations/framework.js';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';
import { issueSession } from '../server/auth/sessions.js';
import { createTenantJob, processTenantJob } from '../server/tenant-jobs.js';
import { reserveTenantRevision, processTenantRevision, rejectTenantItem } from '../server/tenant-review.js';
import { approveTenantItem, loadTenantItemDetail } from '../server/tenant-items.js';

const flags = { requireTenantFoundation: true, requireNativeCredentials: true, requireAiUsage: true, requireWorkspaceTeam: true, requireChatHistory: true, requireChatModelSelection: true, requireBilling: true, requireAdminCatalog: true, requirePlatformAdminAudit: true, requireAiBilling: true, requireBillingAdmin: true, requireModelCatalog: true, requireTaskTemplates: true, requireWorkspaceTasks: true };
let c, locked = false, transaction = false, stage = 'target';
try {
  assert.equal(process.argv[2], '--confirm-non-production');
  const options = migrationConnectionOptions(); assert.equal(options.database, 'virtual_office'); assert.equal(options.port, 3306); assert.notEqual(process.env.NODE_ENV, 'production'); assert(['127.0.0.1','localhost','::1'].includes(options.host));
  c = await connectApprovedNonProduction();
  const [[target]] = await c.execute('SELECT DATABASE() AS db, @@datadir AS datadir'); assert.equal(target.db, 'virtual_office'); assert.match(target.datadir.replaceAll('\\', '/'), /^C:\/laragon\/data\/mysql-8\//i);
  await acquireMigrationLock(c); locked = true;
  const manifest = await inspectMigrationDirectory(fileURLToPath(new URL('../migrations', import.meta.url))); assert.deepEqual(manifest.diagnostics, []);
  assert.deepEqual((await inspectDatabaseHistory(c, manifest.migrations)).diagnostics, []);
  const validation = await validateCurrentSchema(c, flags); assert.deepEqual(validation, { valid: true, differences: [] });
  assert.deepEqual(await applyMigrations(c, manifest.migrations), []);
  console.log(JSON.stringify({ check: '015-schema-checksums-and-duplicate-migration-prevention', validation, passed: true }));
  const [tables] = await c.execute('SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name');
  async function fingerprint() {
    const result = {};
    for (const { name } of tables) { assert(/^[a-z0-9_]+$/.test(name)); const [rows] = await c.query('SELECT * FROM `' + name + '`'); result[name] = createHash('sha256').update(JSON.stringify(rows.map(row => JSON.stringify(row)).sort())).digest('hex'); }
    return result;
  }
  const before = await fingerprint(); stage = 'rollback-only-task-flow';
  await c.beginTransaction(); transaction = true;
  const [[workspace]] = await c.execute("SELECT w.id, w.organization_id AS organizationId, om.user_id AS userId FROM workspaces w JOIN organizations o ON o.id = w.organization_id AND o.status = 'active' JOIN organization_memberships om ON om.organization_id = o.id AND om.role = 'owner' AND om.revoked_at IS NULL JOIN users u ON u.id = om.user_id AND u.status = 'active' WHERE w.status = 'active' ORDER BY w.id LIMIT 1");
  assert(workspace, 'ACTIVE_OWNER_WORKSPACE_REQUIRED');
  const tenantContext = { organizationId: workspace.organizationId, workspaceId: workspace.id, role: 'owner' };
  const divisionId = randomUUID(), agentId = randomUUID(), templateId = randomUUID();
  await c.execute('INSERT INTO workspace_divisions (id, organization_id, workspace_id, name, slot, created_by_user_id) VALUES (?, ?, ?, ?, NULL, ?)', [divisionId, workspace.organizationId, workspace.id, 'Rollback-only task QA', workspace.userId]);
  await c.execute("INSERT INTO workspace_agents (id, organization_id, workspace_id, division_id, name, role, instructions, model_tier, created_by_user_id) VALUES (?, ?, ?, ?, 'QA agent', 'Writer', 'Write drafts only.', 'team', ?)", [agentId, workspace.organizationId, workspace.id, divisionId, workspace.userId]);
  await c.execute('INSERT INTO workspace_task_templates (id, organization_id, workspace_id, name, description, definition, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [templateId, workspace.organizationId, workspace.id, 'QA template', 'Rollback fixture', JSON.stringify({ instructions: 'Draft only', outputFormat: 'Document', fields: [] }), workspace.userId, workspace.userId]);
  const session = await issueSession(c, { userId: workspace.userId, activeWorkspaceId: workspace.id });
  const principal = { userId: workspace.userId, sessionId: session.id };
  let nesting = 0;
  const connection = {
    execute: (...args) => c.execute(...args), query: (...args) => c.query(...args), release() {}, destroy() { throw Error('FIXTURE_CONNECTION_LOST'); },
    async beginTransaction() { await c.query(`SAVEPOINT qa_${++nesting}`); },
    async commit() { await c.query(`RELEASE SAVEPOINT qa_${nesting--}`); },
    async rollback() { await c.query(`ROLLBACK TO SAVEPOINT qa_${nesting}`); await c.query(`RELEASE SAVEPOINT qa_${nesting--}`); },
  };
  const pool = { execute: (...args) => c.execute(...args), getConnection: async () => connection };
  const modelCatalog = { async refresh() {}, resolve: () => 'qa-no-provider', resolveTariff: async () => ({ maxOutputTokens: 1500 }) };
  const body = { mode: 'workspace', agentId, requestKey: randomUUID(), title: 'Rollback-only task', instructions: 'Create draft', templateId, values: {}, clientId: null, modelId: 'qa-no-provider' };
  const create = (value = body, tenant = tenantContext) => createTenantJob(connection, { tenantContext: tenant, principal, body: value, modelCatalog });
  const { jobId } = await create(); assert.equal((await create()).duplicate, true);
  await assert.rejects(create({ ...body, title: 'Different' }), { status: 409 });
  await assert.rejects(create({ ...body, requestKey: randomUUID(), workspaceId: 0 }), { status: 400 });
  await assert.rejects(create({ ...body, requestKey: randomUUID() }, { ...tenantContext, role: 'viewer' }), { status: 403 });
  await assert.rejects(create(body, { ...tenantContext, workspaceId: 0 }), { status: 403 });
  let calls = 0;
  const client = { messages: { async create() { calls++; return { id: 'qa-response', model: 'qa-no-provider', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 20 }, content: [{ type: 'text', text: JSON.stringify({ title: 'QA result', fields: [{ label: 'Result', kind: 'text', value: 'Rollback-only draft' }] }) }] }; } } };
  const usageStore = { start: async () => randomUUID(), dispatched: async () => {}, finish: async () => {} };
  const run = () => processTenantJob({ pool, client, jobId, tenantContext, userId: principal.userId, sessionId: principal.sessionId, usageStore });
  await run(); await run(); assert.equal(calls, 1);
  const [[item]] = await c.execute('SELECT id, agent_id, status FROM items WHERE job_id = ?', [jobId]); assert(item); assert.equal(item.agent_id, agentId); assert.equal(item.status, 'draft');
  await assert.rejects(loadTenantItemDetail(connection, { tenantContext: { ...tenantContext, organizationId: 0 }, itemId: item.id }), { status: 404 });
  await assert.rejects(loadTenantItemDetail(connection, { tenantContext: { ...tenantContext, workspaceId: 0 }, itemId: item.id }), { status: 404 });
  await approveTenantItem(connection, { tenantContext, principal, itemId: item.id });
  await rejectTenantItem(connection, { tenantContext, principal, itemId: item.id, body: { reason: 'Needs improvement', version: 1 } });
  const reservation = await reserveTenantRevision(connection, { tenantContext, principal, itemId: item.id, body: { reason: 'Make concise', version: 1 } });
  assert.equal((await processTenantRevision({ pool, client, reservation, usageStore })).status, 'completed');
  const detail = await loadTenantItemDetail(connection, { tenantContext, itemId: item.id }); assert.equal(detail.version, 2); assert.equal(detail.status, 'draft');
  await c.execute('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?', [session.id]);
  const second = await create({ ...body, requestKey: randomUUID() }); await processTenantJob({ pool, client, jobId: second.jobId, tenantContext, userId: principal.userId, sessionId: principal.sessionId, usageStore }); assert.equal(calls, 2);
  await c.rollback(); transaction = false;
  assert.deepEqual(await fingerprint(), before, 'EXISTING_ROWS_CHANGED');
  console.log(JSON.stringify({ check: 'real-mysql-create-template-agent-idempotency-board-approve-reject-revise-cross-tenant-revocation', passed: true, fixtureRowsRetained: 0, existingRowsUnchanged: true, provider: 'mock', billingDispatch: 'mock', paidProviderCalls: 0 }));
} catch (error) { console.error(JSON.stringify({ failed: true, stage, code: error.code || 'LOCAL_WORKSPACE_TASK_VERIFICATION_FAILED' })); process.exitCode = 1; }
finally { if (transaction) await c.rollback().catch(() => {}); if (locked) await releaseMigrationLock(c).catch(() => {}); await c?.end(); }
