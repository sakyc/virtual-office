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
