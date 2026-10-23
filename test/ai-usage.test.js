import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createUsageStore, trackedClient, loadUsage, installUsageRoutes } from '../server/ai-usage.js';
import { createTenantGate } from '../server/auth/tenant-gate.js';
import { generate } from '../server/runner.js';
import { jobById } from '../shared/jobs.js';
import { inspectMigrationDirectory } from '../server/migrations/status.js';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';

const scope = { organizationId: 3, workspaceId: 8, userId: 9, operation: 'job', agentId: 'bagas', resourceId: 44 };
const message = { id: 'msg_test', model: 'test', usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 20, cache_creation_input_tokens: 10 }, content: [] };
function fixture({ startFail = false, finishFail = false } = {}) {
  const calls = [], rows = new Map();
  const pool = { async execute(sql, values) {
    calls.push({ sql, values });
    if (sql.startsWith('INSERT')) {
      if (startFail) throw new Error('mysql://secret@private');
      rows.set(values[0], { status: 'started' });
    } else {
      if (finishFail) throw new Error('mysql://secret@private');
      const row = rows.get(values.at(-1));
      if (row?.status === 'started') Object.assign(row, { status: values[0], input: values[2], output: values[3] });
    }
    return [{ affectedRows: 1 }];
  } };
  return { calls, rows, store: createUsageStore(() => pool) };
}

test('each provider call persists tenant identity first and final usage without prompt, output or secret', async () => {
  const f = fixture(); let options;
  const client = trackedClient({ messages: { async create(input, opts) {
    assert.equal(f.rows.size, 1); assert.equal([...f.rows.values()][0].status, 'started'); options = opts; return message;
  } } }, f.store, scope);
  assert.equal(await client.messages.create({ model: 'test', messages: [{ content: 'private prompt' }] }), message);
  assert.deepEqual(options, { maxRetries: 0 });
  assert.deepEqual(f.calls[0].values.slice(1), [3, 8, 9, 'job', 44, 'bagas', 'anthropic', 'test']);
  assert.deepEqual(f.calls[1].values.slice(0, 6), ['completed', 'msg_test', 120, 30, 20, 10]);
  assert.doesNotMatch(JSON.stringify(f.calls), /private prompt|secret/);
});

test('missing usage never becomes a zero-cost completed request; provider failure remains unknown', async () => {
  for (const result of [undefined, { usage: { input_tokens: -1, output_tokens: '3' } }]) {
    const f = fixture(); const client = trackedClient({ messages: { create: async () => result } }, f.store, scope);
    await client.messages.create({ model: 'test' });
    assert.equal([...f.rows.values()][0].status, 'unknown');
    assert.equal([...f.rows.values()][0].input, null);
  }
  const f = fixture(); const client = trackedClient({ messages: { create: async () => { throw new Error('provider failed'); } } }, f.store, scope);
  await assert.rejects(client.messages.create({ model: 'test' }), /provider failed/);
  assert.deepEqual([...f.rows.values()][0], { status: 'unknown', input: null, output: null });
});

test('ledger unavailable prevents provider calls; failed finalization leaves started row for reconciliation', async () => {
  let called = 0;
  const sdk = { messages: { create: async () => { called++; return message; } } };
  const unavailable = fixture({ startFail: true });
  await assert.rejects(trackedClient(sdk, unavailable.store, scope).messages.create({ model: 'test' }), { code: 'AI_USAGE_UNAVAILABLE' });
  assert.equal(called, 0);
  const failed = fixture({ finishFail: true });
  await assert.rejects(trackedClient(sdk, failed.store, scope).messages.create({ model: 'test' }), { code: 'AI_USAGE_UNAVAILABLE' });
  assert.equal(called, 1); assert.equal([...failed.rows.values()][0].status, 'started');
});

test('stream finalization is idempotent and aborted streams remain unknown, not free', async () => {
  for (const aborted of [false, true]) {
    const f = fixture(); let aborts = 0; let options;
    const sdk = { messages: { stream(input, opts) { options = opts; return { on() {}, abort() { aborts++; }, async finalMessage() { if (aborted) throw new Error('aborted'); return message; } }; } } };
    const stream = await trackedClient(sdk, f.store, { ...scope, operation: 'chat' }).messages.stream({ model: 'test' });
    if (aborted) stream.abort();
    const one = stream.finalMessage(), two = stream.finalMessage();
    assert.equal(one, two);
    if (aborted) await assert.rejects(one, /aborted/); else assert.equal(await one, message);
    assert.equal(f.calls.length, 2); assert.equal(aborts, aborted ? 1 : 0);
    assert.deepEqual(options, { maxRetries: 0 });
    assert.equal([...f.rows.values()][0].status, aborted ? 'unknown' : 'completed');
  }
});

test('runner retries create separate ledger entries even if job ultimately has no usable output', async () => {
  const f = fixture(); let attempts = 0;
  const sdk = { messages: { create: async () => { attempts++; return { ...message, id: `msg_${attempts}`, stop_reason: 'end_turn' }; } } };
  await assert.rejects(generate({ apiClient: trackedClient(sdk, f.store, scope), DEMO: false, models: { leader: 'test', team: 'test' }, def: jobById('brief_analysis'), params: { brief: 'A brief', industri: '' } }), /Agent tidak/);
  assert.equal(attempts, 2); assert.equal(f.rows.size, 2);
  assert.ok([...f.rows.values()].every((row) => row.status === 'completed'));
});

test('invalid server context fails before SQL or provider; demo does not create usage', async () => {
  const f = fixture();
  assert.throws(() => trackedClient({}, f.store, { ...scope, userId: undefined }), { code: 'AI_USAGE_UNAVAILABLE' });
  assert.equal(trackedClient(null, f.store, scope), null); assert.equal(f.calls.length, 0);
});

test('usage aggregation scopes both queries by tenant and limits non-admins to themselves', async () => {
  for (const role of ['owner', 'admin', 'member', 'viewer']) {
    const calls = [];
    const connection = { execute: async (sql, values) => { calls.push({ sql, values }); return [[{ requests: 0 }]]; } };
    const result = await loadUsage(connection, { ...scope, role }, { userId: 9 });
    const team = ['owner', 'admin'].includes(role);
    assert.equal(result.scope, team ? 'workspace' : 'self');
    for (const call of calls) {
      assert.match(call.sql, /organization_id = \? AND workspace_id = \?/);
      assert.deepEqual(call.values, team ? [3, 8] : [3, 8, 9]);
      assert.match(call.sql, /INTERVAL 30 DAY/);
    }
    assert.equal(result.costAvailable, false);
  }
});

test('usage route uses real session gate; denies forged scope, revoked sessions and platform-only users', async (t) => {
  const state = { revoked: false, role: 'member', fail: false };
  const reads = [];
  const connection = { release() {}, async execute(sql, values) {
    if (sql.startsWith('SELECT s.')) return [[{ id: 4, user_id: 9, active_workspace_id: 8, user_status: 'active', revoked_at: state.revoked ? new Date() : null, idle_expires_at: new Date(Date.now() + 60000), absolute_expires_at: new Date(Date.now() + 60000) }]];
    if (sql.startsWith('UPDATE sessions')) return [{}];
    if (sql.includes('LEFT JOIN organization_memberships')) return [[{ organizationId: 3, role: state.role === 'owner' ? 'admin' : state.role, organizationRole: state.role === 'owner' ? 'owner' : null }]];
    if (state.fail) throw new Error('mysql://private-secret@internal');
    reads.push({ sql, values });
    return sql.includes('COUNT(*)') ? [[{ requests: 0, completed: 0, unresolved: 0, inputTokens: 0, outputTokens: 0 }]] : [[]];
  } };
  const getPool = () => ({ getConnection: async () => connection });
  const app = express(); installUsageRoutes(app, { getPool, requireTenant: createTenantGate({ getPool, authEnabled: true, resourceQueriesScoped: true }) });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const request = (query = '', cookie = `vo_session=${'a'.repeat(43)}`) => fetch(`http://127.0.0.1:${server.address().port}/api/dashboard/usage${query}`, { headers: { Cookie: cookie } });
  assert.equal((await request('', '')).status, 401);
  assert.equal((await request('?organizationId=999')).status, 400); assert.equal(reads.length, 0);
  assert.equal((await request()).status, 200); assert.deepEqual(reads[0].values, [3, 8, 9]);
  state.revoked = true; assert.equal((await request()).status, 401);
  state.revoked = false; state.role = 'platform_admin'; assert.equal((await request()).status, 403);
  state.role = 'owner'; state.fail = true;
  const response = await request(); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private-secret|mysql|internal/);
});

test('migration 004 is registered and additive; validator detects missing ledger contract', async () => {
  const report = await inspectMigrationDirectory(fileURLToPath(new URL('../migrations/', import.meta.url)));
  assert.equal(report.diagnostics.length, 0);
  const migration = report.migrations.find((row) => row.id === '004_ai_usage');
  assert.match(migration.checksum, /^[a-f0-9]{64}$/);
  assert.match(migration.source, /input_tokens BIGINT UNSIGNED NULL/);
  assert.doesNotMatch(migration.source, /^\s*(DROP|DELETE|UPDATE|ALTER|INSERT)\b/im);
  const result = await validateCurrentSchema({ execute: async () => [[]] }, { requireAiUsage: true });
  assert.ok(result.differences.some((row) => row.table === 'ai_usage' && row.column === 'id'));
  assert.ok(result.differences.some((row) => row.reason === 'unknown_usage_must_be_nullable'));
  assert.ok(result.differences.some((row) => row.constraint === 'fk_ai_usage_workspace'));
});
