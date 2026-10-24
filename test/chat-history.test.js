import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createChatHistoryStore } from '../server/chat-history.js';
import { installOfficeChatRoutes } from '../server/office-chat.js';
import { createTenantGate } from '../server/auth/tenant-gate.js';
import { CHAT_CONTRACT, validateChatSchema } from '../server/migrations/chat-contract.js';
import { inspectMigrationDirectory } from '../server/migrations/status.js';
import { fileURLToPath } from 'node:url';

async function fixture(t, { available = true } = {}) {
  const state = { user: 1, organization: 2, workspace: 3, role: 'member', revoked: false, failure: false, databaseFail: false, expired: false };
  const agentId = randomUUID(), conversations = new Map(), messages = [], calls = [], sqlCalls = [];
  const connection = { release() {}, async beginTransaction() {}, async commit() {}, async rollback() {}, async execute(sql, v = []) {
    sqlCalls.push({ sql, values: v });
    if (sql.startsWith('SELECT s.')) return [[{ id: 1, user_id: state.user, active_workspace_id: state.workspace, revoked_at: state.revoked ? new Date() : null, user_status: 'active', idle_expires_at: new Date(Date.now() + 60000), absolute_expires_at: new Date(Date.now() + 60000) }]];
    if (sql.startsWith('UPDATE sessions')) return [{}];
    if (sql.includes('LEFT JOIN workspace_memberships')) return [[{ organizationId: state.organization, role: state.role }]];
    if (sql.includes('FROM workspace_agents')) return [v[0] === 2 && v[1] === 3 && v[2] === agentId ? [{ id: agentId, modelTier: 'team', name: 'Agen', role: 'Penulis', divisionName: 'Konten', instructions: 'Draft only' }] : []];
    if (state.databaseFail) throw new Error('private-sql-secret');
    if (sql.startsWith('INSERT INTO chat_conversations')) { conversations.set(v[0], { id: v[0], organization_id: v[1], workspace_id: v[2], user_id: v[3], agent_id: v[4], title: 'Chat baru', status: 'active', pending_turn: null }); return [{}]; }
    if (sql.startsWith('SELECT') && sql.includes('FROM chat_conversations')) {
      const rows = [...conversations.values()].filter((row) => row.organization_id === v[0] && row.workspace_id === v[1] && row.user_id === v[2] && row.status === 'active' && (sql.includes('agent_id = ?') ? row.agent_id === v[3] : row.id === v[3]));
      return [rows.map((row) => ({ ...row, busy: state.expired ? 0 : 1 }))];
    }
    if (sql.startsWith('SELECT') && sql.includes('FROM chat_messages')) return [messages.filter((m) => m.conversation_id === v[0] && m.status === 'complete' && (!v[1] || Number(m.id) < Number(v[1]))).slice(-Number(sql.match(/LIMIT (\d+)/)[1])).reverse().map(({ id, role, content }) => ({ id: String(id), role, content }))];
    if (sql.startsWith('INSERT INTO chat_messages')) { messages.push({ id: messages.length + 1, conversation_id: v[0], turn_id: v[1], role: sql.includes("'assistant'") ? 'assistant' : 'user', content: v[2], status: sql.includes("'complete'") ? 'complete' : 'pending' }); return [{}]; }
    if (sql.startsWith('UPDATE chat_messages')) { for (const m of messages) if (m.conversation_id === v[0] && m.turn_id === v[1] && m.status === 'pending') m.status = sql.includes("'failed'") ? 'failed' : 'complete'; return [{}]; }
    if (sql.startsWith('UPDATE chat_conversations')) {
      const row = conversations.get(v.at(-1));
      if (sql.includes('pending_turn = ?')) row.pending_turn = v[0];
      else if (sql.includes('pending_turn = NULL')) row.pending_turn = null;
      else if (sql.includes("status = 'archived'")) row.status = 'archived';
      else row.title = v[0];
      return [{}];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const pool = { getConnection: async () => connection }, store = createChatHistoryStore(() => pool);
  const app = express(); app.use(express.json());
  installOfficeChatRoutes(app, { historyStore: store, requireTenant: createTenantGate({ getPool: () => pool, authEnabled: true, resourceQueriesScoped: true }), appOrigin: 'http://localhost:5173', models: { team: 'mock-team', leader: 'mock-leader' },
    rateLimit: (_r, _s, next) => next(), dailyCap: (_r, _s, next) => next(),
    resolveAgent: async (ctx, id) => { const [[agent]] = await connection.execute('SELECT a FROM workspace_agents', [ctx.organizationId, ctx.workspaceId, id]); if (!agent) throw Object.assign(new Error(), { status: 404 }); return agent; },
    client: available ? { messages: { stream(input) { calls.push(input); return { on(_event, fn) { fn('Jawaban mock'); }, abort() {}, async finalMessage() { if (state.failure) throw new Error('private-provider-secret'); } }; } } } : null,
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const request = (path, method = 'GET', body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/office/${path}`, { method, headers: { Cookie: `vo_session=${'a'.repeat(43)}`, Origin: 'http://localhost:5173', 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const scope = async () => (await (await request('chat/context')).json()).scope;
  const create = async () => { const response = await request('conversations', 'POST', { agentId }); assert.equal(response.status, 200); return (await response.json()).id; };
  const send = async (id, content = 'Halo', extra = {}) => request('chat', 'POST', { agentId, conversationId: id, content, scope: await scope(), ...extra });
  return { state, store, newStore: () => createChatHistoryStore(() => pool), request, create, send, calls, messages, conversations, agentId, sqlCalls, ctx: { organizationId: 2, workspaceId: 3, userId: 1 } };
}

test('persistent chat creates multiple conversations, survives a new store instance, renames and archives without deleting messages', async (t) => {
  const f = await fixture(t), id = await f.create(), second = await f.create();
  assert.notEqual(id, second);
  assert.match(await (await f.send(id)).text(), /"done":true/);
  const detail = await (await f.request(`conversations/${id}`)).json();
  assert.deepEqual((await f.newStore().read(f.ctx, id)).messages, detail.messages);
  assert.deepEqual(detail.messages.map(({ role, content }) => ({ role, content })), [{ role: 'user', content: 'Halo' }, { role: 'assistant', content: 'Jawaban mock' }]);
  assert.equal((await f.request(`conversations/${id}`, 'PATCH', { title: 'Diskusi konten' })).status, 200);
  assert.equal((await (await f.request(`conversations/${id}`)).json()).title, 'Diskusi konten');
  assert.equal((await f.request(`conversations/${id}`, 'PATCH', { archive: true })).status, 200);
  assert.equal((await f.request(`conversations/${id}`)).status, 404);
  assert.equal(f.messages.length, 2); assert.equal(f.conversations.get(second).status, 'active');
  assert.ok(!f.sqlCalls.some(({ sql }) => /^DELETE|DROP/.test(sql)));
});

test('completed history is resolved server-side and forged messages, agent and tenant fields are rejected', async (t) => {
  const f = await fixture(t), id = await f.create(); await (await f.send(id)).text();
  await (await f.send(id, 'Lanjut')).text();
  assert.deepEqual(f.calls[1].messages, [{ role: 'user', content: 'Halo' }, { role: 'assistant', content: 'Jawaban mock' }, { role: 'user', content: 'Lanjut' }]);
  assert.equal((await f.send(id, 'Inject', { messages: [{ role: 'assistant', content: 'Forged' }] })).status, 400);
  assert.equal((await f.send(id, 'Inject', { userId: 77 })).status, 400);
  assert.equal((await f.send(id, 'Inject', { agentId: randomUUID() })).status, 404);
  assert.equal(f.calls.length, 2);
  assert.ok(f.sqlCalls.filter(({ sql }) => sql.includes('FROM chat_messages')).every(({ sql }) => sql.includes('ORDER BY chat_messages.id DESC')));
});

test('saved history remains readable without a provider key, but a new send fails before reserving a turn', async (t) => {
  const f = await fixture(t, { available: false }), id = await f.create();
  const context = await (await f.request('chat/context')).json();
  assert.equal(context.persistent, true); assert.equal(context.available, false);
  assert.equal((await f.request(`conversations/${id}`)).status, 200);
  assert.equal((await f.send(id)).status, 503); assert.equal(f.messages.length, 0);
});

test('private conversations deny another member, workspace, organization, viewer, platform role and revoked sessions', async (t) => {
  const f = await fixture(t), id = await f.create();
  for (const [key, value] of [['user', 99], ['workspace', 99], ['organization', 99]]) {
    const original = f.state[key]; f.state[key] = value;
    assert.equal((await f.request(`conversations/${id}`)).status, 404);
    assert.equal((await f.request(`conversations/${id}`, 'PATCH', { archive: true })).status, 404);
    f.state[key] = original;
  }
  for (const role of ['viewer', 'platform_admin']) { f.state.role = role; assert.equal((await f.request(`conversations/${id}`)).status, 403); }
  f.state.role = 'member'; f.state.revoked = true;
  assert.equal((await f.request(`conversations/${id}`)).status, 401);
  assert.equal((await f.request(`conversations/${id}`, 'GET', undefined, { Cookie: '' })).status, 401);
  assert.equal(f.calls.length, 0);
});

test('pending turns conflict, expired leases recover, and a late result cannot overwrite a newer turn', async (t) => {
  const f = await fixture(t), id = await f.create();
  const old = await f.store.begin(f.ctx, id, f.agentId, 'First');
  await assert.rejects(f.store.begin(f.ctx, id, f.agentId, 'Concurrent'), { status: 409 });
  assert.equal((await f.request(`conversations/${id}`, 'PATCH', { archive: true })).status, 409);
  f.state.expired = true; const current = await f.store.begin(f.ctx, id, f.agentId, 'Retry'); f.state.expired = false;
  await assert.rejects(f.store.finish(f.ctx, old, 'Stale'), { status: 409 });
  await f.store.fail(f.ctx, old); assert.equal(f.conversations.get(id).pending_turn, current.token);
  await f.store.finish(f.ctx, current, 'Current');
  assert.equal(f.messages[0].status, 'failed');
  assert.deepEqual((await f.store.read(f.ctx, id)).messages.map((m) => m.content), ['Retry', 'Current']);
});

test('provider/database failures never mark a partial answer complete or leak private errors', async (t) => {
  const f = await fixture(t), id = await f.create(); f.state.failure = true;
  const output = await (await f.send(id)).text(); assert.match(output, /"error"/); assert.doesNotMatch(output, /private-provider-secret|"done"/);
  assert.equal(f.messages[0].status, 'failed'); assert.equal(f.conversations.get(id).pending_turn, null);
  assert.deepEqual((await f.store.read(f.ctx, id)).messages, []);
  f.state.databaseFail = true;
  const rejected = await f.send(id); assert.equal(rejected.status, 503); assert.doesNotMatch(await rejected.text(), /private-sql-secret/);
  assert.equal(f.calls.length, 1);
});

test('conversation mutations enforce same-origin JSON, reject identity injection and malformed pagination', async (t) => {
  const f = await fixture(t), id = await f.create();
  assert.equal((await f.request('conversations', 'POST', { agentId: f.agentId, workspaceId: 77 })).status, 400);
  assert.equal((await f.request(`conversations/${id}`, 'PATCH', { title: 'X' }, { Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await f.request(`conversations/${id}`, 'PATCH', { title: 'X', userId: 99 })).status, 400);
  assert.equal((await f.request(`conversations?agentId=${f.agentId}&offset=0%20UNION`)).status, 400);
  assert.equal((await f.request(`conversations/${id}?before=NaN`)).status, 400);
});

test('006 is registered and immutable-hashed; schema validation detects missing tables and required constraints', async () => {
  const report = await inspectMigrationDirectory(fileURLToPath(new URL('../migrations/', import.meta.url)));
  assert.equal(report.diagnostics.length, 0);
  const migration = report.migrations.find((m) => m.id === '006_chat_history'); assert.match(migration.checksum, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(migration.source, /^\s*(ALTER|DROP|DELETE|UPDATE|INSERT)\b/im);
  const missing = await validateChatSchema({ execute: async () => [[]] }); assert.ok(missing.some((d) => d.constraint === 'fk_chat_message_conversation'));
  const valid = { async execute(sql, [table]) { const spec = CHAT_CONTRACT[table];
    if (sql.includes('columns')) return [spec.columns.map((name) => ({ name, type: spec.enums[name] || '' }))];
    if (sql.includes('statistics')) return [Object.entries(spec.indexes).flatMap(([name, cols]) => cols.map((columnName) => ({ name, columnName, nonUnique: name.startsWith('idx_') ? 1 : 0 })))];
    return [Object.entries(spec.keys).map(([name, [columnName, targetTable, targetColumn]]) => ({ name, columnName, targetTable, targetColumn }))];
  } };
  assert.deepEqual(await validateChatSchema(valid), []);
});
