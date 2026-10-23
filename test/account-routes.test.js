import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { installAccountRoutes } from '../server/auth/account-routes.js';

async function fixture(t, { role = 'owner', revoked = false, failed = false } = {}) {
  const calls = [];
  const state = { displayName: 'Original', workspaceName: 'Workspace', organizationName: 'Organization' };
  let snapshot;
  const connection = {
    release() {},
    async beginTransaction() { snapshot = { ...state }; calls.push({ type: 'begin' }); },
    async commit() { calls.push({ type: 'commit' }); },
    async rollback() { Object.assign(state, snapshot); calls.push({ type: 'rollback' }); },
    async execute(sql, values) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT s.')) return [[{ id: 4, user_id: 7, active_workspace_id: 12, revoked_at: revoked ? new Date() : null, user_status: 'active', idle_expires_at: new Date(Date.now() + 60000), absolute_expires_at: new Date(Date.now() + 60000) }]];
      if (sql.startsWith('UPDATE sessions')) return [{ affectedRows: 1 }];
      if (failed) throw new Error('mysql://private-secret@internal');
      if (sql.startsWith('SELECT w.id,')) return [role ? [{ id: 12, organization_id: 11, role: role === 'owner' ? 'admin' : role, organization_role: role === 'owner' ? 'owner' : null }] : []];
      if (sql.startsWith('UPDATE users')) state.displayName = values[0];
      if (sql.startsWith('UPDATE workspaces')) state.workspaceName = values[0];
      if (sql.startsWith('UPDATE organizations')) state.organizationName = values[0];
      if (sql.startsWith('SELECT id, email')) return [[{ id: 7, email: 'user@example.test', display_name: state.displayName }]];
      if (sql.includes('AS workspace_slug')) return [[{ workspace_id: 12, workspace_name: state.workspaceName, workspace_slug: 'main', organization_id: 11, organization_name: state.organizationName, organization_role: role === 'owner' ? 'owner' : null, workspace_role: role }]];
      return [{ affectedRows: 1 }];
    },
  };
  const app = express(); app.use(express.json());
  installAccountRoutes(app, { getPool: () => ({ getConnection: async () => connection }), appOrigin: 'http://localhost:5173' });
  const server = app.listen(0, '127.0.0.1'); await new Promise((done) => server.once('listening', done));
  t.after(() => new Promise((done) => { server.close(done); server.closeAllConnections(); }));
  return { calls, state, request: (action, body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/account/${action}`, { method: 'POST', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', Cookie: `vo_session=${'a'.repeat(43)}`, ...headers }, body: JSON.stringify(body) }) };
}

test('profile save changes only the server session user and returns the persisted profile', async (t) => {
  const f = await fixture(t);
  const response = await f.request('profile', { displayName: '  Nama  Baru ' });
  assert.equal(response.status, 200); assert.equal((await response.json()).user.displayName, 'Nama Baru');
  assert.deepEqual(f.calls.find(({ sql }) => sql?.startsWith('UPDATE users')).values, ['Nama Baru', 7]);
  assert.ok(!f.calls.some(({ sql }) => sql?.startsWith('UPDATE organizations')));
});

test('owner can rename only the active server-resolved workspace and organization', async (t) => {
  const f = await fixture(t);
  const response = await f.request('workspace', { workspaceName: 'Tim Baru', organizationName: 'Studio Baru' });
  assert.equal(response.status, 200);
  const profile = await response.json();
  assert.equal(profile.activeWorkspace.name, 'Tim Baru'); assert.equal(profile.activeWorkspace.organization.name, 'Studio Baru');
  assert.deepEqual(f.calls.find(({ sql }) => sql?.startsWith('UPDATE workspaces')).values, ['Tim Baru', 12, 11]);
  assert.deepEqual(f.calls.find(({ sql }) => sql?.startsWith('UPDATE organizations')).values, ['Studio Baru', 11]);
  const lookup = f.calls.find(({ sql }) => sql?.startsWith('SELECT w.id,'));
  assert.deepEqual(lookup.values, [7, 7, 12]); assert.match(lookup.sql, /o.status = 'active'/); assert.match(lookup.sql, /FOR UPDATE/);
});

test('admin can rename workspace but not organization; member/viewer/platform admin/no grant cannot rename either', async (t) => {
  const admin = await fixture(t, { role: 'admin' });
  assert.equal((await admin.request('workspace', { workspaceName: 'Admin Workspace' })).status, 200);
  assert.equal((await admin.request('workspace', { workspaceName: 'Another', organizationName: 'Forbidden' })).status, 403);
  assert.equal(admin.state.workspaceName, 'Admin Workspace'); assert.equal(admin.state.organizationName, 'Organization');
  for (const role of ['member', 'viewer', 'platform_admin', null]) {
    const f = await fixture(t, { role });
    assert.equal((await f.request('workspace', { workspaceName: 'Forbidden' })).status, 403);
    assert.ok(!f.calls.some(({ sql }) => sql?.startsWith('UPDATE workspaces')));
  }
});

test('account updates deny forged IDs/roles/email, invalid names, origins, missing and revoked sessions', async (t) => {
  const f = await fixture(t);
  for (const body of [{ displayName: 'Name', userId: 999 }, { displayName: 'Name', role: 'owner' }, { displayName: 'Name', email: 'new@example.test' }, { displayName: '' }, { displayName: 'x'.repeat(151) }]) assert.equal((await f.request('profile', body)).status, 400);
  assert.equal((await f.request('workspace', { workspaceName: 'Forged', workspaceId: 999, organizationId: 998 })).status, 400);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.request('profile', { displayName: 'Name' }, { Origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await f.request('profile', { displayName: 'Name' }, { 'Content-Type': 'text/plain' })).status, 403);
  assert.equal((await f.request('profile', { displayName: 'Name' }, { Cookie: '' })).status, 401);
  const revoked = await fixture(t, { revoked: true });
  assert.equal((await revoked.request('profile', { displayName: 'Name' })).status, 401);
  assert.ok(!revoked.calls.some(({ type }) => type === 'begin'));
});

test('database failure rolls back account updates and never returns private error text', async (t) => {
  const f = await fixture(t, { failed: true });
  const response = await f.request('profile', { displayName: 'New' });
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /mysql|private-secret|internal/);
  assert.ok(f.calls.some(({ type }) => type === 'rollback'));
  assert.ok(!f.calls.some(({ type }) => type === 'commit'));
});
