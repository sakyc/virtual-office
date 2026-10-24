import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, validateOnboardingPayload } from '../server/auth/onboarding-routes.js';
import express from 'express';
import { installOnboardingRoutes } from '../server/auth/onboarding-routes.js';
import { installAuthRoutes } from '../server/auth/auth-routes.js';
import { onboardingErrors } from '../shared/onboarding-validation.js';

test('onboarding payload normalizes names and generates a deterministic organization slug', () => {
  assert.deepEqual(validateOnboardingPayload({ organizationName: '  Studio  KreaTif  ', workspaceName: ' Tim Utama ', teamSize: '6-20' }), {
    organizationName: 'Studio KreaTif', organizationSlug: 'studio-kreatif', workspaceName: 'Tim Utama', clientName: '', clientBrief: '', teamSize: '6-20',
  });
  assert.equal(slugify('Kreasi & Co.'), 'kreasi-co');
});

test('onboarding rejects missing required names and unrecognized team sizes', () => {
  assert.throws(() => validateOnboardingPayload({ workspaceName: 'Main' }), { status: 400 });
  assert.throws(() => validateOnboardingPayload({ organizationName: 'Acme', workspaceName: 'Main', teamSize: 'many' }), { status: 400 });
});

test('shared onboarding validation checks the current step and bounds without silently truncating', () => {
  assert.deepEqual(onboardingErrors({ organizationName: 'Studio' }, 1), {});
  assert.equal(onboardingErrors({ organizationName: 'Studio' }, 2).workspaceName, 'Nama workspace wajib diisi.');
  for (const value of [null, {}, 14, ' ', 'x'.repeat(151)]) assert.throws(() => validateOnboardingPayload({ organizationName: value, workspaceName: 'Main' }), { status: 400 });
  assert.throws(() => validateOnboardingPayload({ organizationName: 'Studio', workspaceName: 'x'.repeat(151) }), { status: 400 });
  assert.throws(() => validateOnboardingPayload({ organizationName: 'Studio', workspaceName: 'Main', clientBrief: 'x'.repeat(4001) }), { status: 400 });
});

const payload = { organizationName: 'Studio Uji', workspaceName: 'Tim Kreatif', clientName: 'Klien Uji', clientBrief: 'Brief uji', teamSize: '1-5' };
async function fixture(t, { existing = null, revoked = false, conflict = false, failInsert = false, failTeam = false } = {}) {
  const calls = [];
  let workspace = existing;
  let staged = null;
  let activeWorkspaceId = null;
  const connection = {
    release() { calls.push({ type: 'release' }); },
    async beginTransaction() { calls.push({ type: 'begin' }); },
    async commit() { calls.push({ type: 'commit' }); workspace ||= staged; },
    async rollback() { calls.push({ type: 'rollback' }); staged = null; },
    async execute(sql, values) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT s.')) return [[{ id: 4, user_id: 7, active_workspace_id: activeWorkspaceId, user_status: 'active', revoked_at: revoked ? new Date() : null, idle_expires_at: new Date(Date.now() + 60000), absolute_expires_at: new Date(Date.now() + 60000) }]];
      if (sql.startsWith('SELECT id, email')) return [[{ id: 7, email: 'user@example.test', display_name: 'Pengguna Uji' }]];
      if (sql.includes('AS workspace_slug')) return [workspace ? [{ ...workspace, workspace_slug: 'main', organization_slug: 'studio-uji', organization_role: 'owner', workspace_role: 'admin' }] : []];
      if (sql.startsWith('SELECT id FROM users')) return [[{ id: 7 }]];
      if (sql.includes('SELECT o.id AS organization_id')) return [workspace ? [workspace] : []];
      if (sql.startsWith('SELECT id FROM organizations')) return [conflict ? [{ id: 99 }] : []];
      if (sql.startsWith('INSERT INTO organizations')) return [{ insertId: 11 }];
      if (sql.startsWith('INSERT INTO workspaces')) {
        if (failInsert) throw new Error('mysql://private-secret@internal');
        staged = { organization_id: values[0], organization_name: payload.organizationName, workspace_id: 12, workspace_name: values[1] };
        return [{ insertId: 12 }];
      }
      if (sql.startsWith('INSERT INTO clients')) return [{ insertId: 13 }];
      if (sql.startsWith('SELECT slot FROM workspace_divisions')) return [[]];
      if (sql.startsWith('SELECT id FROM workspace_divisions')) return [[{ id: values[2] }]];
      if (sql.startsWith('SELECT COUNT(*) AS count FROM workspace_agents')) return [[{ count: 0 }]];
      if (sql.startsWith('INSERT INTO workspace_divisions') && failTeam) throw new Error('mysql://private-secret@internal');
      if (sql.startsWith('UPDATE sessions SET active_workspace_id')) activeWorkspaceId = values[0];
      return [{ affectedRows: 1 }];
    },
  };
  const pool = { getConnection: async () => connection };
  const app = express(); app.use(express.json());
  installAuthRoutes(app, { getPool: () => pool, env: { AUTH_PROVIDER: 'native', APP_ORIGIN: 'http://localhost:5173' } });
  installOnboardingRoutes(app, { getPool: () => pool, authEnabled: true, appOrigin: 'http://localhost:5173' });
  const server = app.listen(0, '127.0.0.1'); await new Promise((done) => server.once('listening', done));
  t.after(() => new Promise((done) => { server.close(done); server.closeAllConnections(); }));
  const request = (path, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    ...options, headers: { Cookie: `vo_session=${'a'.repeat(43)}`, Origin: 'http://localhost:5173', 'Content-Type': 'application/json', ...options.headers },
  });
  return { calls, request, submit: (body = payload, headers = {}) => request('/api/onboarding', { method: 'POST', body: JSON.stringify(body), headers }) };
}

test('onboarding provisions server-owned organization/workspace/client and activates the real profile', async (t) => {
  const f = await fixture(t);
  const response = await f.submit({ ...payload, userId: 999, organizationId: 998, workspaceId: 997, role: 'platform_admin' });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { organization: { id: 11, name: 'Studio Uji' }, workspace: { id: 12, name: 'Tim Kreatif' }, clientId: 13, existing: false });
  assert.deepEqual(f.calls.find(({ sql }) => sql?.startsWith('INSERT INTO workspaces')).values, [11, 'Tim Kreatif', 7]);
  assert.deepEqual(f.calls.find(({ sql }) => sql?.startsWith('INSERT INTO clients')).values, ['Klien Uji', 'Brief uji', 11, 12, 7, 7]);
  assert.deepEqual(f.calls.find(({ sql }) => sql?.startsWith('UPDATE sessions SET active_workspace_id')).values, [12, 4, 7]);
  assert.match(f.calls.find(({ sql }) => sql?.startsWith('SELECT id FROM users')).sql, /FOR UPDATE/);
  const profile = await (await f.request('/auth/me')).json();
  assert.equal(profile.activeWorkspace.name, 'Tim Kreatif');
  assert.equal(profile.activeWorkspace.role, 'owner');
  const inserts = f.calls.filter(({ sql }) => sql?.startsWith('INSERT')).length;
  const retry = await f.submit();
  assert.equal(retry.status, 200); assert.equal((await retry.json()).existing, true);
  assert.equal(f.calls.filter(({ sql }) => sql?.startsWith('INSERT')).length, inserts);
});

test('onboarding copies only the selected template atomically and retry never duplicates its agents', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.submit({ ...payload, team: { mode: 'template', templateId: 'proposal' } })).status, 201);
  assert.equal(f.calls.filter((c) => c.sql?.startsWith('INSERT INTO workspace_divisions')).length, 1);
  assert.equal(f.calls.filter((c) => c.sql?.startsWith('INSERT INTO workspace_agents')).length, 4);
  assert.equal((await f.submit({ ...payload, team: { mode: 'template', templateId: 'social' } })).status, 200);
  assert.equal(f.calls.filter((c) => c.sql?.startsWith('INSERT INTO workspace_agents')).length, 4);
  const failed = await fixture(t, { failTeam: true });
  const response = await failed.submit({ ...payload, team: { mode: 'template', templateId: 'proposal' } });
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /mysql|private-secret/);
  assert.ok(failed.calls.some((c) => c.type === 'rollback'));
  assert.ok(!failed.calls.some((c) => c.type === 'commit'));
  assert.equal((await (await failed.request('/auth/me')).json()).activeWorkspace, null);
});

test('existing workspace member is returned to their workspace without creating another organization', async (t) => {
  const f = await fixture(t, { existing: { organization_id: 21, organization_name: 'Existing', workspace_id: 22, workspace_name: 'Delivery' } });
  const response = await f.submit();
  assert.equal(response.status, 200); assert.equal((await response.json()).workspace.id, 22);
  assert.ok(!f.calls.some(({ sql }) => sql?.startsWith('INSERT')));
  assert.match(f.calls.find(({ sql }) => sql?.includes('SELECT o.id AS organization_id')).sql, /wm\.user_id IS NOT NULL/);
});

test('onboarding denies missing/revoked sessions, cross-origin and non-JSON requests before provisioning', async (t) => {
  for (const revoked of [false, true]) {
    const f = await fixture(t, { revoked });
    assert.equal((await f.submit(payload, revoked ? {} : { Cookie: '' })).status, 401);
    assert.ok(!f.calls.some(({ type }) => type === 'begin'));
  }
  for (const headers of [{ Origin: 'https://attacker.invalid' }, { Origin: '' }, { 'Content-Type': 'text/plain' }]) {
    const f = await fixture(t);
    assert.equal((await f.submit(payload, headers)).status, 403);
    assert.equal(f.calls.length, 0);
  }
});

test('onboarding supports optional client, reports slug conflicts, and rolls back sanitized failures', async (t) => {
  const optional = await fixture(t);
  assert.equal((await optional.submit({ ...payload, clientName: '', clientBrief: '' })).status, 201);
  assert.ok(!optional.calls.some(({ sql }) => sql?.startsWith('INSERT INTO clients')));
  const conflict = await fixture(t, { conflict: true });
  assert.equal((await conflict.submit()).status, 409);
  assert.ok(conflict.calls.some(({ type }) => type === 'rollback'));
  assert.ok(!conflict.calls.some(({ sql }) => sql?.startsWith('INSERT')));
  const failure = await fixture(t, { failInsert: true });
  const response = await failure.submit();
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /mysql|private-secret|internal/);
  assert.ok(failure.calls.some(({ type }) => type === 'rollback'));
  assert.ok(!failure.calls.some(({ type }) => type === 'commit'));
  assert.equal((await (await failure.request('/auth/me')).json()).activeWorkspace, null);
});
