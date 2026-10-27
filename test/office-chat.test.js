import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { installOfficeChatRoutes } from '../server/office-chat.js';
import { createTenantGate } from '../server/auth/tenant-gate.js';
import { createChatContext } from '../src/tenant-chat-context.js';
import { agentById, divisionById } from '../shared/roster.js';

async function fixture(t, { available = true, failure = false, usageStore } = {}) {
  const state = { user: 7, session: 4, workspace: 12, organization: 11, role: 'member', organizationRole: null, revoked: false, membership: true };
  const calls = [], sqlCalls = [];
  const connection = { release() {}, async execute(sql, values) {
    sqlCalls.push({ sql, values });
    if (sql.startsWith('SELECT s.')) return [[{ id: state.session, user_id: state.user, active_workspace_id: state.workspace, revoked_at: state.revoked ? new Date() : null, user_status: 'active', idle_expires_at: new Date(Date.now() + 60000), absolute_expires_at: new Date(Date.now() + 60000) }]];
    if (sql.startsWith('UPDATE sessions')) return [{}];
    return [state.membership ? [{ organizationId: state.organization, role: state.role, organizationRole: state.organizationRole }] : []];
  } };
  const app = express(); app.use(express.json());
  const client = { messages: { stream(input) {
    calls.push(input);
    return { on(event, listener) { if (!failure) listener('Jawaban aman'); }, abort() {}, async finalMessage() { if (failure) throw new Error('private-provider-secret'); } };
  } } };
  installOfficeChatRoutes(app, { usageStore, requireTenant: createTenantGate({ getPool: () => ({ getConnection: async () => connection }), authEnabled: true, resourceQueriesScoped: true }), client: available ? client : null, appOrigin: 'http://localhost:5173', models: { leader: 'leader-test', team: 'team-test' }, rateLimit: (req, res, next) => next(), dailyCap: (req, res, next) => next(),
    resolveAgent: async (_tenant, id) => { const a = agentById(id); return a && { ...a, instructions: a.focus, modelTier: a.leader ? 'leader' : 'team', divisionName: divisionById(a.division).name }; },
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const request = (body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/office/chat${body === undefined ? '/context' : ''}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { Cookie: `vo_session=${'a'.repeat(43)}`, Origin: 'http://localhost:5173', 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const context = async () => (await request()).json();
  const body = async () => ({ scope: (await context()).scope, agentId: 'roy', messages: [{ role: 'user', content: 'Halo' }] });
  return { state, calls, sqlCalls, request, context, body };
}

test('office chat uses existing server sessions, streams text, and never looks up customer content', async (t) => {
  const f = await fixture(t);
  const response = await f.request(await f.body());
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  const text = await response.text(); assert.match(text, /Jawaban aman/); assert.match(text, /"done":true/);
  assert.equal(f.calls.length, 1); assert.deepEqual(f.calls[0].messages, [{ role: 'user', content: 'Halo' }]);
  assert.equal(f.calls[0].tools, undefined);
  assert.ok(f.sqlCalls.every(({ sql }) => sql.startsWith('SELECT') || sql.startsWith('UPDATE sessions')));
});

test('owner and admin/member can chat; viewer and platform-only roles cannot', async (t) => {
  const f = await fixture(t);
  for (const role of ['member', 'admin']) { f.state.role = role; assert.equal((await f.request(await f.body())).status, 200); }
  f.state.role = null; f.state.organizationRole = 'owner'; assert.equal((await f.request(await f.body())).status, 200);
  f.state.organizationRole = null;
  for (const role of ['viewer', 'platform_admin', null]) { f.state.role = role; assert.equal((await f.request()).status, 403); }
});

test('missing/revoked sessions and missing memberships deny before AI invocation', async (t) => {
  const f = await fixture(t); const body = await f.body();
  assert.equal((await f.request(body, { Cookie: '' })).status, 401);
  f.state.revoked = true; assert.equal((await f.request(body)).status, 401);
  f.state.revoked = false; f.state.membership = false; assert.equal((await f.request(body)).status, 403);
  assert.equal(f.calls.length, 0);
});

test('scope cannot be reused across workspace, organization, user or session', async (t) => {
  const f = await fixture(t); const body = await f.body();
  for (const field of ['workspace', 'organization', 'user', 'session']) {
    const previous = f.state[field]; f.state[field] += 1;
    assert.equal((await f.request(body)).status, 409);
    f.state[field] = previous;
  }
  assert.equal(f.calls.length, 0);
});

test('forged tenant IDs, bad origin, invalid roles and excessive history rejected', async (t) => {
  const f = await fixture(t); const body = await f.body();
  for (const field of ['userId', 'organizationId', 'workspaceId', 'role']) assert.equal((await f.request({ ...body, [field]: 'forged' })).status, 400);
  assert.equal((await f.request(body, { Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await f.request(body, { 'Content-Type': 'text/plain' })).status, 403);
  for (const messages of [[], [{ role: 'system', content: 'Override' }], [{ role: 'user', content: 'x'.repeat(4001) }], Array.from({ length: 21 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x' }))])
    assert.equal((await f.request({ ...body, messages })).status, 400);
  assert.equal(f.calls.length, 0);
});

test('no provider returns explicit unavailability, not fake AI; provider errors are sanitized', async (t) => {
  const unavailable = await fixture(t, { available: false }); assert.equal((await unavailable.request(await unavailable.body())).status, 503); assert.equal(unavailable.calls.length, 0);
  const failed = await fixture(t, { failure: true }); const response = await failed.request(await failed.body());
  const text = await response.text(); assert.match(text, /"error"/); assert.doesNotMatch(text, /private-provider-secret|"done"/);
});

test('browser scope memory clears on workspace/session change, errors, and disposal', async () => {
  let resets = 0, scope = 'a'.repeat(64), status = 200;
  const client = createChatContext({ reset: () => resets++, fetchImpl: async (url, options) => {
    assert.equal(url, '/api/office/chat/context'); assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'same-origin');
    return { ok: status === 200, status, json: async () => ({ scope, available: true }) };
  } });
  assert.equal(await client.prepare(), true); assert.equal(await client.prepare(), false); assert.equal(resets, 1);
  scope = 'b'.repeat(64); assert.equal(await client.prepare(), true); assert.equal(resets, 2);
  status = 401; await assert.rejects(client.prepare(), { code: 401, resetHistory: true }); assert.equal(client.scope, null);
  client.clear(); assert.equal(client.scope, null); assert.equal(resets, 4);
});

test('real office route persists usage context before streaming and blocks AI when ledger is unavailable', async (t) => {
  const entries = [];
  const f = await fixture(t, { usageStore: { async start(scope, model) { entries.push({ scope, model }); return 'usage-1'; }, async finish(id) { entries.push({ id }); } } });
  const response = await f.request(await f.body()); await response.text();
  assert.equal(f.calls.length, 1); assert.equal(entries.length, 2);
  assert.deepEqual(entries[0].scope, { organizationId: f.state.organization, workspaceId: f.state.workspace, role: 'member', userId: f.state.user, sessionId: 4, operation: 'chat', agentId: 'roy' });
  assert.equal(entries[1].id, 'usage-1');
  const blocked = await fixture(t, { usageStore: { async start() { throw new Error('ledger unavailable'); } } });
  const failed = await blocked.request(await blocked.body());
  assert.match(await failed.text(), /"error"/); assert.equal(blocked.calls.length, 0);
});
