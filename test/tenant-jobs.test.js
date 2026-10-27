import assert from 'node:assert/strict';
import test from 'node:test';
import { createTenantJob, saveTenantJobOutput, processTenantJob } from '../server/tenant-jobs.js';

const context = { organizationId: 3, workspaceId: 8, role: 'admin' };
const principal = { userId: 9 };
const body = { jobType: 'brief_analysis', params: { brief: 'Need a launch plan.', industri: 'Retail' } };

test('tenant job assigns server context ownership at creation', async () => {
  const calls = [];
  const connection = { execute: async (sql, values) => { calls.push({ sql, values }); return [{ insertId: 44 }]; } };
  const result = await createTenantJob(connection, { tenantContext: context, principal, body });
  assert.deepEqual(result, { jobId: 44, jobType: 'brief_analysis' });
  assert.match(calls[0].sql, /organization_id, workspace_id, created_by_user_id/);
  assert.deepEqual(calls[0].values.slice(-3), [3, 8, 9]);
  assert.doesNotMatch(calls[0].sql, /body\.organization/);
});

test('viewer cannot create a tenant job', async () => {
  await assert.rejects(() => createTenantJob({ execute: async () => { throw new Error('must not execute'); } }, { tenantContext: { ...context, role: 'viewer' }, principal, body }), { status: 403 });
});

test('client and parent references are looked up in the active tenant scope', async () => {
  const calls = [];
  const connection = { execute: async (sql, values) => { calls.push({ sql, values }); if (sql.startsWith('SELECT id')) return [[{ id: values[0] }]]; return [{ insertId: 45 }]; } };
  await createTenantJob(connection, { tenantContext: context, principal, body: { jobType: 'carousel', clientId: 4, params: { ide: 5, slide: 5, gaya: 'Edukasi', platform: 'Instagram' } } });
  assert.match(calls[0].sql, /organization_id = \? AND workspace_id = \?/);
  assert.deepEqual(calls[0].values, [4, 3, 8]);
  assert.deepEqual(calls[1].values, [5, 3, 8]);
});

test('tenant job output assigns tenant ownership to every generated item', async () => {
  const calls = [];
  const connection = { beginTransaction: async () => calls.push({ type: 'begin' }), commit: async () => calls.push({ type: 'commit' }), rollback: async () => calls.push({ type: 'rollback' }), execute: async (sql, values) => { calls.push({ sql, values }); return [{}]; } };
  await saveTenantJobOutput({ connection, job: { id: 44, parent_item_id: null, client_id: null, params: { brief: 'Launch', industri: '' } }, output: { model: 'demo', usage: { in: 0, out: 0 }, items: [{ title: 'Result', content: { fields: [{ label: 'Note', kind: 'text', value: 'Done' }] } }] }, definition: { id: 'brief_analysis', agent: 'bagas', type: 'brief' }, tenantContext: context, userId: 9 });
  const insert = calls.find((call) => call.sql?.startsWith('INSERT INTO items'));
  assert.deepEqual(insert.values.slice(-4), [3, 8, 9, 9]);
  const update = calls.find((call) => call.sql?.startsWith('UPDATE jobs'));
  assert.deepEqual(update.values.slice(-3), [44, 3, 8]);
  assert.equal(calls.at(-1).type, 'commit');
});

test('job runner tracks every provider attempt with server-derived scope even when output is invalid', async () => {
  const entries = [];
  const pool = { async execute(sql) {
    if (sql.startsWith('SELECT * FROM jobs')) return [[{ id: 44, status: 'generating', job_type: 'brief_analysis', params: body.params }]];
    return [{}];
  } };
  const usageStore = { async start(scope) { entries.push(scope); return `usage-${entries.length}`; }, async finish() {} };
  const client = { messages: { create: async () => ({ content: [], stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 7 } }) } };
  await processTenantJob({ pool, client, DEMO: false, models: { leader: 'fixture', team: 'fixture' }, jobId: 44, tenantContext: context, userId: 9, sessionId: 2, usageStore });
  assert.equal(entries.length, 2);
  for (const entry of entries) assert.deepEqual(entry, { ...context, userId: 9, sessionId: 2, operation: 'job', resourceId: 44, agentId: 'bagas' });
});
