// Explicit opt-in real-handler verification; never imports initDb or runs schema SQL.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import express from 'express';
import mysql from 'mysql2/promise';
import { installAuthRoutes } from '../server/auth/auth-routes.js';
import { installOnboardingRoutes } from '../server/auth/onboarding-routes.js';
import { createTenantGate } from '../server/auth/tenant-gate.js';
import { installDashboardRoutes } from '../server/dashboard-routes.js';
import { destinationForProfile } from '../src/react/auth-flow.js';

const database = process.argv.find((arg) => arg.startsWith('--database='))?.slice(11);
const host = process.env.DB_HOST || '127.0.0.1';
if (process.env.LOCAL_AUTH_VERIFICATION_APPROVED !== '1' || process.env.NODE_ENV === 'production'
    || !['127.0.0.1', 'localhost', '::1'].includes(host)
    || !/^(vo_native_restore_|virtual_office_auth_test_)\d+$/.test(database || '')
    || database === process.env.DB_NAME) {
  console.error('Verification refused: explicit local isolated target and LOCAL_AUTH_VERIFICATION_APPROVED=1 required.');
  process.exit(1);
}

let pool, server, stage = 'preflight';
const origin = 'http://localhost:5173';
const label = `onboarding-qa-${randomUUID()}`;
try {
  pool = mysql.createPool({ host, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database, timezone: 'Z', connectionLimit: 4 });
  const [identity] = await pool.execute('SELECT DATABASE() AS name');
  assert.equal(identity[0].name, database);
  const [tables] = await pool.execute('SELECT table_name FROM information_schema.tables WHERE table_schema = ?', [database]);
  const names = new Set(tables.map((row) => row.TABLE_NAME || row.table_name));
  for (const required of ['users', 'native_credentials', 'sessions', 'organizations', 'organization_memberships', 'workspaces', 'workspace_memberships', 'clients', 'jobs', 'items', 'revisions']) assert.ok(names.has(required));
  const fingerprint = async () => JSON.stringify((await pool.execute('SELECT table_name, column_name, column_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = ? ORDER BY table_name, ordinal_position', [database]))[0]);
  const schemaBefore = await fingerprint();
  const resourceCounts = async () => Promise.all(['clients', 'jobs', 'items', 'revisions'].map(async (table) => (await pool.execute(`SELECT COUNT(*) AS n FROM ${table}`))[0][0].n));
  const resourcesBefore = await resourceCounts();
  const app = express(); app.use(express.json());
  const getPool = () => pool;
  installAuthRoutes(app, { getPool, env: { AUTH_PROVIDER: 'native', APP_ORIGIN: origin } });
  installOnboardingRoutes(app, { getPool, authEnabled: true, appOrigin: origin });
  installDashboardRoutes(app, { getPool, requireTenant: createTenantGate({ getPool, authEnabled: true, resourceQueriesScoped: true }) });
  server = app.listen(0, '127.0.0.1'); await new Promise((done) => server.once('listening', done));
  let cookie = '';
  const request = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const session = response.headers.get('set-cookie');
    if (session) cookie = session.split(';')[0];
    return response;
  };
  // Generated from a non-sequential alphabet, retained only in memory.
  const credentials = { email: `${label}@example.invalid`, displayName: 'Local onboarding verification', password: `K!9${Array.from(randomBytes(24), (byte) => 'GkRm8!2%'[byte % 8]).join('')}` };
  stage = 'register'; assert.equal((await request('/auth/register', credentials)).status, 201);
  const fresh = await (await request('/auth/me')).json();
  assert.equal(destinationForProfile(fresh), '/onboarding');
  assert.equal((await request('/api/dashboard/overview')).status, 403);
  stage = 'onboarding';
  const body = { organizationName: label, workspaceName: `Workspace ${label}`, clientName: '', clientBrief: '', teamSize: '1-5' };
  const created = await request('/api/onboarding', body); assert.equal(created.status, 201);
  const result = await created.json();
  const ready = await (await request('/auth/me')).json();
  assert.equal(destinationForProfile(ready), '/dashboard');
  assert.equal(ready.activeWorkspace.name, body.workspaceName);
  assert.equal(ready.activeWorkspace.role, 'owner');
  stage = 'dashboard';
  const dashboard = await request('/api/dashboard/overview'); assert.equal(dashboard.status, 200);
  const overview = await dashboard.json();
  assert.equal(overview.metrics.totalJobs, 0); assert.equal(overview.metrics.totalClients, 0); assert.deepEqual(overview.recentJobs, []);
  stage = 'idempotent retry';
  const retry = await request('/api/onboarding', body); assert.equal(retry.status, 200);
  assert.equal((await retry.json()).workspace.id, result.workspace.id);
  const [memberships] = await pool.execute('SELECT COUNT(*) AS n FROM organization_memberships WHERE user_id = ?', [ready.user.id]);
  assert.equal(Number(memberships[0].n), 1);
  stage = 'save account settings';
  const profileSave = await request('/api/account/profile', { displayName: 'Local verified profile' });
  assert.equal(profileSave.status, 200); assert.equal((await profileSave.json()).user.displayName, 'Local verified profile');
  const workspaceSave = await request('/api/account/workspace', { workspaceName: `Updated ${label}`, organizationName: `Updated ${label}` });
  assert.equal(workspaceSave.status, 200); assert.equal((await workspaceSave.json()).activeWorkspace.name, `Updated ${label}`);
  stage = 'office workloads';
  const workloads = await request('/api/dashboard/workers'); assert.equal(workloads.status, 200); assert.deepEqual((await workloads.json()).workers, []);
  stage = 'suspended organization access denial';
  const [suspended] = await pool.execute("UPDATE organizations SET status = 'suspended' WHERE id = ? AND created_by_user_id = ?", [result.organization.id, ready.user.id]);
  assert.equal(suspended.affectedRows, 1);
  try { assert.equal((await request('/api/dashboard/overview')).status, 403); }
  finally { await pool.execute("UPDATE organizations SET status = 'active' WHERE id = ? AND created_by_user_id = ?", [result.organization.id, ready.user.id]); }
  stage = 'logout'; const revokedCookie = cookie;
  assert.equal((await request('/auth/logout', {})).status, 204);
  cookie = revokedCookie; assert.equal((await request('/auth/me')).status, 401);
  stage = 'login again'; cookie = '';
  assert.equal((await request('/auth/login', { email: credentials.email, password: credentials.password })).status, 200);
  const returning = await (await request('/auth/me')).json();
  assert.equal(destinationForProfile(returning), null); // Existing membership -> workspace selection, never onboarding.
  assert.equal(returning.workspaces.length, 1);
  assert.equal((await request('/auth/active-workspace', { workspaceId: result.workspace.id })).status, 200);
  const persisted = await (await request('/auth/me')).json();
  assert.equal(destinationForProfile(persisted), '/dashboard');
  assert.equal(persisted.user.displayName, 'Local verified profile');
  assert.equal(persisted.activeWorkspace.name, `Updated ${label}`);
  assert.equal((await request('/auth/logout', {})).status, 204);
  stage = 'preservation';
  assert.equal(await fingerprint(), schemaBefore);
  assert.deepEqual(await resourceCounts(), resourcesBefore);
  console.log(JSON.stringify({ result: 'PASS', target: database, classification: 'isolated local verification database', fixture: label, register: 201, onboarding: 201, retry: 200, dashboard: 200, profileSave: 200, workspaceSave: 200, settingsPersistAfterLogin: true, officeWorkloads: 200, suspendedOrganizationDenied: 403, logout: 204, revokedSession: 401, returningLogin: 200, returningUserRepeatsOnboarding: false, schemaUnchanged: true, resourceRowCountsUnchanged: true, fixtureRetained: true }));
} catch {
  console.error(JSON.stringify({ result: 'FAIL', stage, error: 'Local verification did not complete; no credentials logged. Any created QA records are retained.' }));
  process.exitCode = 1;
} finally {
  if (server) await new Promise((done) => { server.close(done); server.closeAllConnections(); });
  await pool?.end();
}
