import assert from 'node:assert/strict';
import test from 'node:test';
import { createTenantGate } from '../server/auth/tenant-gate.js';

function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
test('customer API fails closed while Auth0 is disabled', async () => {
  const req = { headers: {} }; const res = response(); await createTenantGate({ getPool: () => null, authEnabled: false })(req, res, () => { throw new Error('must not continue'); }); assert.equal(res.statusCode, 503);
});
test('unauthenticated or revoked sessions cannot supply a forged tenant scope', async () => {
  const req = { headers: { cookie: 'vo_session=short' }, query: { organizationId: 'forged', workspaceId: 'forged' } }; const res = response();
  await createTenantGate({ getPool: () => ({ getConnection: async () => ({ execute: async () => [[]], release() {} }) }), authEnabled: true })(req, res, () => { throw new Error('must not continue'); });
  assert.equal(res.statusCode, 401); assert.equal(req.tenantContext, undefined);
});
test('cross-workspace or cross-organization membership lookup denies access', async () => {
  const connection = { release() {}, execute: async (sql) => sql.startsWith('SELECT s.') ? [[{ id: 1, user_id: 1, active_workspace_id: 2, idle_expires_at: new Date(Date.now() + 10000), absolute_expires_at: new Date(Date.now() + 10000), revoked_at: null, user_status: 'active' }]] : sql.startsWith('UPDATE') ? [{}] : [[]] };
  const req = { headers: { cookie: `vo_session=${'a'.repeat(43)}` } }; const res = response();
  await createTenantGate({ getPool: () => ({ getConnection: async () => connection }), authEnabled: true })(req, res, () => { throw new Error('must not continue'); });
  assert.equal(res.statusCode, 403);
});
test('authenticated membership still cannot reach unscoped legacy queries', async () => {
  const connection = { execute: async () => [[{ id: 1, user_id: 1, active_workspace_id: 2, idle_expires_at: new Date(Date.now() + 10000), absolute_expires_at: new Date(Date.now() + 10000), revoked_at: null, user_status: 'active' }]], release() {} };
  let calls = 0; connection.execute = async (sql) => { calls += 1; if (calls === 1) return [[{ id: 1, user_id: 1, active_workspace_id: 2, idle_expires_at: new Date(Date.now() + 10000), absolute_expires_at: new Date(Date.now() + 10000), revoked_at: null, user_status: 'active' }]]; if (calls === 2) return [{}]; return [[{ organizationId: 3, role: 'member', organizationRole: null }]]; };
  const req = { headers: { cookie: `vo_session=${'a'.repeat(43)}` } }; const res = response(); await createTenantGate({ getPool: () => ({ getConnection: async () => connection }), authEnabled: true })(req, res, () => { throw new Error('must not continue'); }); assert.equal(res.statusCode, 503); assert.equal(req.tenantContext.workspaceId, 2);
});

test('tenant gate filters suspended organizations and rejects invalid/platform-only roles', async () => {
  for (const role of ['platform_admin', 'owner', 'unknown', null]) {
    let lookup;
    const connection = { release() {}, execute: async (sql, values) => {
      if (sql.startsWith('SELECT s.')) return [[{ id: 4, user_id: 7, active_workspace_id: 12, user_status: 'active', revoked_at: null, idle_expires_at: new Date(Date.now() + 60000), absolute_expires_at: new Date(Date.now() + 60000) }]];
      if (sql.startsWith('UPDATE sessions')) return [{}];
      lookup = { sql, values }; return [[{ organizationId: 11, role, organizationRole: null }]];
    } };
    const req = { headers: { cookie: `vo_session=${'a'.repeat(43)}` }, body: { workspaceId: 999, organizationId: 998, role: 'owner' } };
    const res = response();
    await createTenantGate({ getPool: () => ({ getConnection: async () => connection }), authEnabled: true, resourceQueriesScoped: true })(req, res, () => { throw new Error('must not proceed'); });
    assert.equal(res.statusCode, 403); assert.equal(req.tenantContext, undefined);
    assert.match(lookup.sql, /JOIN organizations o ON o.id = w.organization_id AND o.status = 'active'/);
    assert.deepEqual(lookup.values, [7, 7, 12]);
  }
});
