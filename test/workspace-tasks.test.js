import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createWorkspaceTask, generateWorkspaceTask, workspaceTaskDefinition } from '../server/workspace-tasks.js';
import { createTenantJob, processTenantJob } from '../server/tenant-jobs.js';
import { processTenantRevision, reserveTenantRevision } from '../server/tenant-review.js';
import { reservationInputTokens } from '../server/ai-billing.js';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { inspectMigrationDirectory } from '../server/migrations/status.js';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { installDashboardRoutes } from '../server/dashboard-routes.js';
import { readTaskFailure } from '../shared/task-failures.js';

const tenantContext = { organizationId: 3, workspaceId: 8, role: 'admin' }, principal = { userId: 9, sessionId: 4 };
const agentId = randomUUID(), templateId = randomUUID();
const input = () => ({ mode: 'workspace', agentId, requestKey: randomUUID(), title: 'Carousel promosi', instructions: 'Buat promosi barista.', values: {}, clientId: null, modelId: 'test-model' });
const catalog = { async refresh() {}, resolve(id) { if (id !== 'test-model') throw Object.assign(Error('Disabled'), { status: 400 }); return id; }, async resolveTariff() { return { maxOutputTokens: 2000 }; } };
const template = { id: templateId, name: 'My template', version: 2, definition: { instructions: 'Buat 3 slide.', outputFormat: 'Carousel', fields: [{ name: 'topik', label: 'Topik', type: 'text', required: true }] } };
function fixture() {
  const calls = [], jobs = [], items = [], revisions = [];
  const state = { access: true, agent: true, template: true, locked: true, client: true, failProvider: false };
  const scoped = (values, a, b) => values[a] === 3 && values[b] === 8;
  const c = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}, destroy() {},
    async execute(sql, values = []) {
      if(sql.includes('FROM managed_demo_accounts'))return [[]];
      calls.push({ sql, values });
      if (sql.includes('GET_LOCK')) return [[{ acquired: state.locked ? 1 : 0 }]];
      if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
      if (sql.startsWith('SELECT s.id FROM sessions')) return [state.access ? [{ id: 4 }] : []];
      if (sql.startsWith('SELECT id FROM workspaces')) return [scoped(values, 0, 1) ? [{ id: 8 }] : []];
      if (sql.startsWith('SELECT a.id, a.name')) return [state.agent && scoped(values, 0, 1) && values[2] === agentId ? [{ id: agentId, name: 'Sua', role: 'Penulis', instructions: 'Jangan mengarang fakta.', modelTier: 'team', divisionName: 'Konten' }] : []];
      if (sql.includes('FROM workspace_task_templates')) return [state.template && scoped(values, 0, 1) && values[2] === templateId ? [structuredClone(template)] : []];
      if (sql.startsWith('SELECT id FROM clients')) return [state.client && scoped(values, 1, 2) ? [{ id: 1 }] : []];
      if (sql.startsWith('SELECT name, brief FROM clients')) return [[{ name: 'Client', brief: 'Context' }]];
      if (sql.startsWith('SELECT id, params FROM jobs')) return [jobs.filter(j => scoped(values, 0, 1) && j.created_by_user_id === values[2] && j.request_key === values[3])];
      if (sql.startsWith('INSERT INTO jobs')) { const [agent_id, job_type, client_id, params, organization_id, workspace_id, created_by_user_id, request_key] = values; const job = { id: jobs.length + 1, agent_id, job_type, client_id, params: JSON.parse(params), organization_id, workspace_id, created_by_user_id, request_key, status: 'generating' }; jobs.push(job); return [{ insertId: job.id }]; }
      if (sql.startsWith('SELECT * FROM jobs')) return [jobs.filter(j => j.id === values[0] && scoped(values, 1, 2))];
      if (sql.startsWith('INSERT INTO items')) { const [job_id, parent_item_id, client_id, agent_id, type, title, tag, content, organization_id, workspace_id] = values; items.push({ id: items.length + 1, job_id, parent_item_id, client_id, agent_id, type, title, content: JSON.parse(content), organization_id, workspace_id, version: 1, status: 'draft' }); return [{ insertId: items.length }]; }
      if (sql.startsWith('UPDATE jobs SET status')) { const done = sql.includes("status = 'done'"); const id = done ? values[3] : sql.includes('error = ?') ? values[1] : values[0]; const job = jobs.find(j => j.id === id); if (job) { job.status = done ? 'done' : 'failed'; if (!done && sql.includes('error = ?')) job.error = values[0]; } return [{ affectedRows: 1 }]; }
      if (sql.includes('FROM items i JOIN jobs j')) return [items.filter(i => i.id === values[0] && scoped(values, 1, 2)).map(i => ({ ...i, job_type: jobs[0].job_type, params: jobs[0].params, job_client_id: null }))];
      if (sql.startsWith("UPDATE items SET status = 'revising'")) { items[0].status = 'revising'; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('INSERT INTO revisions')) { revisions.push(values); return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE items SET title')) { Object.assign(items[0], { title: values[0], content: JSON.parse(values[1]), status: 'draft', version: items[0].version + 1 }); return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE items SET status = ?')) { items[0].status = values[0]; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE jobs SET tokens')) return [{ affectedRows: 1 }];
      throw Error('Unexpected SQL: ' + sql);
    },
  };
  const scopeCalls = [], requests = [];
  const pool = { execute: (...args) => c.execute(...args), getConnection: async () => c };
  const usageStore = { async start(scope, model, request) { scopeCalls.push(scope); requests.push(request); return randomUUID(); }, async dispatched() {}, async finish() {} };
  const client = { messages: { async create() { if (state.failProvider) throw Error('secret provider error'); return { id: 'provider-id', model: 'test-model', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ title: 'Draft carousel', fields: [{ label: 'Slide 1', kind: 'text', value: 'Isi draft.' }] }) }], usage: { input_tokens: 20, output_tokens: 30 } }; } } };
  const create = body => createTenantJob(c, { tenantContext, principal, body, modelCatalog: catalog });
  const run = id => processTenantJob({ pool, client, jobId: id, tenantContext, userId: 9, sessionId: 4, usageStore });
  return { c, pool, calls, jobs, items, revisions, state, usageStore, client, scopeCalls, requests, create, run };
}

test('workspace tasks resolve agent/template/model server-side and snapshot instructions; duplicate submission inserts once', async () => {
  const f = fixture(), body = { ...input(), templateId, values: { topik: 'Barista' } };
  const first = await f.create(body); assert.equal(first.jobId, 1);
  assert.equal(f.jobs[0].agent_id, agentId); assert.equal(f.jobs[0].params.task.template.version, 2); assert.equal(f.jobs[0].params.task.agent.name, 'Sua');
  assert.equal((await f.create(body)).duplicate, true); assert.equal(f.jobs.length, 1);
  await assert.rejects(f.create({ ...body, title: 'Different task' }), { status: 409 });
  template.definition.instructions = 'Changed after submit'; assert.equal(f.jobs[0].params.task.template.instructions, 'Buat 3 slide.'); template.definition.instructions = 'Buat 3 slide.';
});
test('forged identities, invalid inputs, disabled models, foreign/archived agents, templates and clients are denied', async () => {
  const f = fixture();
  for (const role of ['member', 'viewer', 'platform_admin']) await assert.rejects(createTenantJob(f.c, { tenantContext: { ...tenantContext, role }, principal, body: input(), modelCatalog: catalog }), { status: 403 });
  for (const patch of [{ workspaceId: 999 }, { userId: 4 }, { modelId: 'disabled-model' }, { title: '' }, { instructions: '' }, { values: { forged: 'x' } }]) await assert.rejects(f.create({ ...input(), ...patch }));
  f.state.agent = false; await assert.rejects(f.create(input()), { status: 404 }); f.state.agent = true;
  f.state.template = false; await assert.rejects(f.create({ ...input(), templateId }), { status: 404 }); f.state.template = true;
  f.state.client = false; await assert.rejects(f.create({ ...input(), clientId: 1 }), { status: 404 });
  await assert.rejects(createWorkspaceTask(f.c, { tenantContext: { ...tenantContext, workspaceId: 99 }, principal, body: input(), modelCatalog: catalog }), { status: 403 });
  assert.equal(f.jobs.length, 0);
});
test('free task generates a scoped Board draft with paid text-only tracking; rerunning a completed job makes no provider call', async () => {
  const f = fixture(), { jobId } = await f.create(input()); await f.run(jobId); await f.run(jobId);
  assert.equal(f.jobs[0].status, 'done'); assert.equal(f.items.length, 1); assert.equal(f.items[0].agent_id, agentId); assert.equal(f.items[0].organization_id, 3);
  assert.equal(f.scopeCalls.length, 1); assert.deepEqual(f.scopeCalls[0], { ...tenantContext, userId: 9, sessionId: 4, operation: 'job', resourceId: 1, agentId });
  assert.ok(reservationInputTokens(f.requests[0], 20000) > 0); assert.equal(f.requests[0].tools, undefined); assert.equal(f.requests[0].model, 'test-model');
});
test('runner lock, revoked sessions and provider failures fail closed without fabricated results or automatic paid retries', async () => {
  for (const failure of ['locked', 'access', 'failProvider']) {
    const f = fixture(), { jobId } = await f.create(input()); f.state[failure] = failure === 'failProvider';
    await f.run(jobId); assert.equal(f.items.length, 0); assert.ok(f.scopeCalls.length <= 1);
  }
});
test('billing preparation failures persist a safe task reason before any provider dispatch without retry', async () => {
  for (const [code, expected] of [['AI_BILLING_FX_UNAVAILABLE', 'FX_UNAVAILABLE'], ['INSUFFICIENT_AI_BALANCE', 'BALANCE_INSUFFICIENT']]) {
    const f = fixture(), { jobId } = await f.create(input()); let calls = 0;
    f.usageStore.start = async () => { throw Object.assign(Error('PRIVATE payment or database information'), { code, status: 503 }); };
    f.client.messages.create = async () => { calls++; throw Error('must not dispatch'); };
    await f.run(jobId);
    assert.equal(f.jobs[0].status, 'failed'); assert.equal(readTaskFailure(f.jobs[0].error).code, expected);
    assert.doesNotMatch(f.jobs[0].error, /PRIVATE|payment|database/); assert.equal(calls, 0);
    await f.run(jobId); assert.equal(calls, 0);
  }
});

test('custom revision preserves previous draft as history and returns a new draft version through existing review flow', async () => {
  const f = fixture(), { jobId } = await f.create(input()); await f.run(jobId);
  const reservation = await reserveTenantRevision(f.c, { tenantContext, principal, itemId: 1, body: { version: 1, reason: 'Buat lebih ringkas' } });
  const result = await processTenantRevision({ pool: f.pool, client: f.client, reservation, usageStore: f.usageStore });
  assert.equal(result.status, 'completed'); assert.equal(f.items[0].version, 2); assert.equal(f.items[0].status, 'draft'); assert.equal(f.revisions.length, 1);
  assert.equal(f.scopeCalls.at(-1).operation, 'revision'); assert.match(f.requests.at(-1).messages[0].content, /Buat lebih ringkas/);
});
test('task JSON must contain useful fields and may not fabricate tool execution', async () => {
  const task = { title: 'Task', model: 'test-model', maxTokens: 1000, instructions: 'Write', values: {}, agent: { name: 'Sua', role: 'Writer', instructions: '', divisionName: 'Team' } };
  const client = { messages: { create: async () => ({ content: [{ type: 'text', text: 'Not valid JSON' }], usage: {} }) } };
  await assert.rejects(generateWorkspaceTask({ apiClient: client, task }));
  await assert.rejects(generateWorkspaceTask({ apiClient: null, task }), { status: 503 });
  assert.throws(() => workspaceTaskDefinition({ agent_id: 'forged', params: { task } }));
});
test('HTTP task submission uses server identity, rejects forgery, schedules once and denies viewers', async t => {
  const f = fixture(), scheduled = []; let role = 'admin';
  const app = express(); app.use(express.json());
  installDashboardRoutes(app, { getPool: () => f.pool, modelCatalog: catalog,
    requireTenant(req, _res, next) { req.tenantContext = { ...tenantContext, role }; req.authPrincipal = principal; next(); },
    runTenantJob: async (...args) => scheduled.push(args) });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const post = body => fetch(`http://127.0.0.1:${server.address().port}/api/dashboard/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const body = input();
  assert.equal((await post(body)).status, 202);
  assert.equal((await (await post(body)).json()).duplicate, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(scheduled.length, 1); assert.deepEqual(scheduled[0], [1, tenantContext, 9, 4]);
  assert.equal((await post({ ...input(), workspaceId: 999 })).status, 400);
  assert.equal((await post({ jobType: 'brief_analysis', params: { brief: 'Bypass' } })).status, 400);
  role = 'viewer'; assert.equal((await post(input())).status, 403); assert.equal(f.jobs.length, 1);
});

test('builtin defaults, multi selections and financial calculations remain server-controlled', async () => {
  const f = fixture();
  await f.create({ ...input(), builtinId: 'content_planner', values: { bulan: '2026-11' } });
  assert.equal(f.jobs[0].params.task.values.jumlah, '12');
  assert.deepEqual(f.jobs[0].params.task.values.platform, ['Instagram']);
  await assert.rejects(f.create({ ...input(), builtinId: 'content_planner', values: { bulan: '2026-11', platform: ['forged'] } }), { status: 400 });
  const task = { ...f.jobs[0].params.task, template: { builtin: true, id: 'billing_recap' }, values: { data: 'A | 1000 | lunas\nB | 2000 | belum lunas' } };
  const output = await generateWorkspaceTask({ apiClient: f.client, task });
  const computed = output.items[0].content.fields.find(field => field.label.includes('dihitung sistem'));
  assert.ok(computed); assert.match(computed.value.join(' '), /3[.,]000/);
});

test('015 is expand-only and preserves nullable legacy idempotency; workspace composer and admin editor render actual controls', async () => {
  const manifest = await inspectMigrationDirectory(fileURLToPath(new URL('../migrations', import.meta.url))); assert.deepEqual(manifest.diagnostics, []);
  const migration = manifest.migrations.find(m => m.id === '015_workspace_task_execution'); assert.match(migration.source, /VARCHAR\(64\)/); assert.match(migration.source, /request_key CHAR\(36\) NULL/); assert.doesNotMatch(migration.source, /\b(?:DROP|DELETE|TRUNCATE)\b/);
  const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { WorkspaceTaskFields } = await vite.ssrLoadModule('/src/react/workspace-task-composer.jsx');
    const html = renderToStaticMarkup(React.createElement(WorkspaceTaskFields, { data: { agents: [{ id: agentId, name: 'Sua', role: 'Writer' }], models: [{ id: 'test-model', label: 'Economy', costLabel: 'Hemat' }], templates: [], builtins: [], clients: [] }, form: { agentId, template: '', title: '', instructions: '', values: {}, clientId: '', modelId: '' }, setForm() {} }));
    for (const text of ['Agen pelaksana', 'Sua', 'Tugas bebas', 'Instruksi tugas', 'Model AI', 'Hemat', 'Saldo AI']) assert.ok(html.includes(text), text);
    const { AdminPlanCatalog } = await vite.ssrLoadModule('/src/react/admin-billing.jsx');
    const admin = renderToStaticMarkup(React.createElement(AdminPlanCatalog, { plans: [{ code: 'starter', name: 'Starter', monthlyPriceIdr: '149000', includedCreditIdr: '50000', maxDivisions: 1, maxMembers: 2, version: 1 }, { code: 'pro', name: 'Pro', monthlyPriceIdr: '399000', includedCreditIdr: '150000', maxDivisions: 3, maxMembers: 6, version: 1 }] }));
    assert.equal((admin.match(/<form/g) || []).length, 1); assert.match(admin, /Pilih paket untuk diedit/);
  } finally { await vite.close(); }
});
