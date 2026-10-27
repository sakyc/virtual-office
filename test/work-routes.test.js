import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { installDashboardRoutes } from '../server/dashboard-routes.js';
import { createTenantGate } from '../server/auth/tenant-gate.js';

// Real Express + session gate + resource handlers, with SQL fixtures only. No database/provider.
async function fixture(t, { role = 'admin', revoked = false, membership = true, target = 'owned', databaseError = false, revisionEnabled = true } = {}) {
  const queries = [];
  const review = { status: 'draft', version: 1 };
  const reservations = [];
  const connection = {
    release() {},
    async beginTransaction() { queries.push({ transaction: 'begin' }); },
    async commit() { queries.push({ transaction: 'commit' }); },
    async rollback() { queries.push({ transaction: 'rollback' }); },
    async execute(sql, values) {
      queries.push({ sql, values });
      if (sql.startsWith('SELECT s.')) return [[{ id: 1, user_id: 9, active_workspace_id: 8, idle_expires_at: new Date(Date.now() + 60000), absolute_expires_at: new Date(Date.now() + 60000), revoked_at: revoked ? new Date() : null, user_status: 'active' }]];
      if (sql.startsWith('UPDATE sessions')) return [{ affectedRows: 1 }];
      if (sql.includes('AS organizationId')) return [membership ? [{ organizationId: 3, role, organizationRole: null }] : []];
      if (databaseError) throw new Error('mysql://private-password@internal');
      if (sql.includes('FROM items i JOIN jobs')) return [target === 'owned' && values[1] === 3 && values[2] === 8 ? [{ id: values[0], type: 'brief', title: 'Fixture output', agent_id: 'bagas', ...review, content: { fields: [] } }] : []];
      if (sql.startsWith('UPDATE items')) {
        if (sql.includes("status = 'revising'")) review.status = 'revising';
        if (sql.includes("status = 'rejected'")) review.status = 'rejected';
        return [{ affectedRows: target === 'owned' ? 1 : 0 }];
      }
      if (sql.includes('FROM revisions')) return [[{ id: 2, version: 1, reason: 'Fixture feedback' }]];
      if (sql.startsWith('INSERT INTO jobs')) return [{ insertId: 45 }];
      return [[]];
    },
  };
  const pool = { getConnection: async () => connection };
  const app = express(); app.use(express.json());
  installDashboardRoutes(app, { getPool: () => pool, requireTenant: createTenantGate({ getPool: () => pool, authEnabled: true, resourceQueriesScoped: true }),
    ...(revisionEnabled ? { runTenantRevision: async (reservation) => { reservations.push(reservation); } } : {}),
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise((done) => server.once('listening', done));
  t.after(() => new Promise((done) => { server.close(done); server.closeAllConnections(); }));
  return {
    queries, reservations,
    request: (path, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { ...options, headers: { Cookie: `vo_session=${'a'.repeat(43)}`, ...options.headers } }),
  };
}

test('real session gate protects detail and returns owned item', async (t) => {
  const f = await fixture(t);
  const response = await f.request('/api/dashboard/items/4');
  assert.equal(response.status, 200); assert.equal((await response.json()).item.title, 'Fixture output');
  const query = f.queries.find(({ sql }) => sql.includes('FROM items i JOIN jobs'));
  assert.deepEqual(query.values, [4, 3, 8, 3, 8]);
});
test('unauthenticated and revoked sessions never query output content', async (t) => {
  for (const revoked of [false, true]) {
    const f = await fixture(t, { revoked });
    const response = await f.request('/api/dashboard/items/4', revoked ? {} : { headers: { Cookie: '' } });
    assert.equal(response.status, 401); assert.ok(!f.queries.some(({ sql }) => sql.includes('FROM items')));
  }
});
test('membership denial stops detail lookup', async (t) => {
  const f = await fixture(t, { membership: false });
  assert.equal((await f.request('/api/dashboard/items/4?workspaceId=999')).status, 403);
  assert.ok(!f.queries.some(({ sql }) => sql.includes('FROM items')));
});
test('cross-organization, cross-workspace and legacy targets cannot return item content', async (t) => {
  for (const target of ['cross-organization', 'cross-workspace', 'legacy']) {
    const f = await fixture(t, { target });
    const response = await f.request('/api/dashboard/items/4?organizationId=999&workspaceId=999&role=owner');
    assert.equal(response.status, 404);
    assert.deepEqual(f.queries.find(({ sql }) => sql.includes('FROM items i JOIN jobs')).values, [4, 3, 8, 3, 8]);
  }
});
test('viewer cannot approve or submit and forged role does not elevate privileges', async (t) => {
  const f = await fixture(t, { role: 'viewer' });
  assert.equal((await f.request('/api/dashboard/items/4/approve?role=owner', { method: 'POST' })).status, 403);
  assert.equal((await f.request('/api/dashboard/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'owner', jobType: 'brief_analysis', params: { brief: 'Fixture' } }) })).status, 403);
  assert.ok(!f.queries.some(({ sql }) => /^(INSERT INTO jobs|UPDATE items)/.test(sql)));
});
test('approve keeps server ownership and legacy static jobs cannot bypass workspace agents', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/dashboard/items/4/approve', { method: 'POST' })).status, 204);
  const response = await f.request('/api/dashboard/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId: 999, workspaceId: 999, userId: 999, jobType: 'brief_analysis', params: { brief: 'Fixture' } }) });
  assert.equal(response.status, 400); assert.equal((await response.json()).code, 'WORKSPACE_AGENT_REQUIRED');
  assert.deepEqual(f.queries.find(({ sql }) => sql.startsWith('UPDATE items')).values, [9, 4, 3, 8]);
  assert.ok(!f.queries.some(({ sql }) => sql.startsWith('INSERT INTO jobs')));
});
test('unexpected item detail error is sanitized', async (t) => {
  const f = await fixture(t, { databaseError: true });
  const response = await f.request('/api/dashboard/items/4');
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'Item service unavailable.' });
});

const reviewRequest = (body = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Fixture feedback', version: 1, ...body }) });

test('revision and rejection require authentication and member+ privileges', async (t) => {
  for (const action of ['revise', 'reject']) {
    for (const role of ['viewer', 'platform_admin']) {
      const f = await fixture(t, { role });
      assert.equal((await f.request(`/api/dashboard/items/4/${action}?role=owner`, reviewRequest({ role: 'owner' }))).status, 403);
      assert.ok(!f.queries.some(({ sql }) => sql?.startsWith('UPDATE items')));
    }
    const f = await fixture(t, { revoked: true });
    assert.equal((await f.request(`/api/dashboard/items/4/${action}`, reviewRequest())).status, 401);
  }
});

test('revision uses server scope and actor and duplicate submissions do not schedule a second worker', async (t) => {
  const f = await fixture(t, { role: 'member' });
  const response = await f.request('/api/dashboard/items/4/revise', reviewRequest({ organizationId: 999, workspaceId: 999, userId: 999 }));
  assert.equal(response.status, 202); assert.deepEqual(await response.json(), { itemId: 4, status: 'revising' });
  await new Promise((done) => setImmediate(done));
  assert.equal(f.reservations.length, 1);
  assert.deepEqual(f.reservations[0].tenantContext, { organizationId: 3, workspaceId: 8, role: 'member' });
  assert.equal(f.reservations[0].principal.userId, 9); assert.equal(f.reservations[0].principal.sessionId, 1);
  assert.equal((await f.request('/api/dashboard/items/4/revise', reviewRequest())).status, 409);
  assert.equal((await f.request('/api/dashboard/items/4/reject', reviewRequest())).status, 409);
  assert.equal(f.reservations.length, 1);
});

test('cross-tenant and unowned items deny revision/rejection despite forged IDs', async (t) => {
  for (const target of ['cross-organization', 'cross-workspace', 'legacy']) for (const action of ['revise', 'reject']) {
    const f = await fixture(t, { target });
    assert.equal((await f.request(`/api/dashboard/items/4/${action}`, reviewRequest({ workspaceId: 999, organizationId: 999 }))).status, 404);
    assert.ok(!f.queries.some(({ sql }) => sql?.startsWith('UPDATE items'))); assert.equal(f.reservations.length, 0);
  }
});

test('rejection stores a reason; stale review and duplicate rejection are conflicts', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/dashboard/items/4/reject', reviewRequest({ version: 2 }))).status, 409);
  assert.equal((await f.request('/api/dashboard/items/4/reject', reviewRequest())).status, 204);
  assert.equal((await f.request('/api/dashboard/items/4/reject', reviewRequest())).status, 409);
  assert.deepEqual(f.queries.find(({ sql }) => sql?.startsWith('UPDATE items')).values, ['Fixture feedback', 9, 4, 3, 8, 1]);
});

test('missing runner fails before reserving, invalid input is 400 and DB errors are sanitized', async (t) => {
  const unavailable = await fixture(t, { revisionEnabled: false });
  assert.equal((await unavailable.request('/api/dashboard/items/4/revise', reviewRequest())).status, 503);
  assert.ok(!unavailable.queries.some(({ sql }) => sql?.startsWith('UPDATE items')));
  const invalid = await fixture(t);
  assert.equal((await invalid.request('/api/dashboard/items/4/revise', reviewRequest({ reason: '' }))).status, 400);
  assert.ok(!invalid.queries.some(({ transaction }) => transaction === 'begin'));
  const failing = await fixture(t, { databaseError: true });
  const response = await failing.request('/api/dashboard/items/4/revise', reviewRequest());
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'Item revision service unavailable.' });
});
