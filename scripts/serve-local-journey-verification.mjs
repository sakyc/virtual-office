// Opt-in browser verification using real handlers and an existing isolated restore.
// No initDb, migrations, schema SQL, provider calls or development database writes.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import mysql from 'mysql2/promise';
import { installAuthRoutes } from '../server/auth/auth-routes.js';
import { installOnboardingRoutes } from '../server/auth/onboarding-routes.js';
import { createTenantGate } from '../server/auth/tenant-gate.js';
import { installDashboardRoutes } from '../server/dashboard-routes.js';
import { installOfficeChatRoutes } from '../server/office-chat.js';
import { processTenantJob } from '../server/tenant-jobs.js';
import { processTenantRevision } from '../server/tenant-review.js';

const database = process.argv.find((arg) => arg.startsWith('--database='))?.slice(11);
const host = process.env.DB_HOST || '127.0.0.1';
const port = 5217;
const origin = `http://127.0.0.1:${port}`;
if (process.env.LOCAL_AUTH_VERIFICATION_APPROVED !== '1' || process.env.NODE_ENV === 'production'
    || !['127.0.0.1', 'localhost', '::1'].includes(host) || Number(process.env.DB_PORT || 3306) !== 3306
    || !/^vo_native_restore_\d+$/.test(database || '') || database === process.env.DB_NAME) {
  console.error('Refused: explicitly approved loopback isolated restore required.');
  process.exit(1);
}
const backup = 'D:/VetendCode/database-backups/virtual-office-native-xMZLPe/before-native.sql';
const digest = (value) => createHash('sha256').update(value).digest('hex');
assert.equal(digest(readFileSync(backup)), 'df8ea61de5bb7587b33e5b5b3abf8ec46c84ed8055095e37da82e16430bf1413', 'Verified backup evidence changed');
let pool, server, stopping = false;
try {
  pool = mysql.createPool({ host, port: 3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database, timezone: 'Z', connectionLimit: 4 });
  assert.equal((await pool.execute('SELECT DATABASE() AS name'))[0][0].name, database);
  const schemaFingerprint = async () => digest(JSON.stringify((await pool.execute('SELECT table_name, column_name, column_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = ? ORDER BY table_name, ordinal_position', [database]))[0]));
  const schemaBefore = await schemaFingerprint();
  const [tables] = await pool.execute('SELECT table_name FROM information_schema.tables WHERE table_schema = ?', [database]);
  const names = new Set(tables.map((row) => row.TABLE_NAME || row.table_name));
  for (const table of ['users', 'native_credentials', 'sessions', 'organizations', 'workspaces', 'workspace_memberships', 'clients', 'jobs', 'items', 'revisions']) assert.ok(names.has(table), `Missing required table: ${table}`);
  const app = express(); app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    res.on('finish', () => {
      if (/^\/(auth|api)\//.test(req.path)) console.log(JSON.stringify({ method: req.method, path: req.path, status: res.statusCode }));
    }); next();
  });
  const getPool = () => pool;
  installAuthRoutes(app, { getPool, env: { AUTH_PROVIDER: 'native', APP_ORIGIN: origin } });
  installOnboardingRoutes(app, { getPool, authEnabled: true, appOrigin: origin });
  const requireTenant = createTenantGate({ getPool, authEnabled: true, resourceQueriesScoped: true });
  const models = { leader: 'verification-demo', team: 'verification-demo' };
  installDashboardRoutes(app, { getPool, requireTenant,
    runTenantJob: (jobId, tenantContext, userId) => processTenantJob({ pool, client: null, DEMO: true, models, jobId, tenantContext, userId }),
    runTenantRevision: (reservation) => processTenantRevision({ pool, client: null, DEMO: true, models, reservation }),
  });
  const pass = (req, res, next) => next();
  installOfficeChatRoutes(app, { requireTenant, client: null, appOrigin: origin, models, rateLimit: pass, dailyCap: pass });
  app.get('/api/config', (req, res) => res.json({ demo: true, needsCode: false }));
  // Never proxy unknown APIs into a development backend or serve SPA HTML as API JSON.
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not available in isolated verification.' }));
  const dist = resolve('dist');
  assert.ok(readFileSync(resolve(dist, 'index.html')).length);
  app.use(express.static(dist));
  app.use((req, res, next) => req.method === 'GET' && !req.path.startsWith('/auth/') ? res.sendFile(resolve(dist, 'index.html')) : next());
  server = app.listen(port, '127.0.0.1');
  await new Promise((done, reject) => { server.once('listening', done); server.once('error', reject); });
  console.log(JSON.stringify({ ready: true, origin, database, realDatabase: true, aiMode: 'DEMO ONLY', migrations: false }));
  const stop = async () => {
    if (stopping) return; stopping = true;
    try { console.log(JSON.stringify({ schemaUnchanged: (await schemaFingerprint()) === schemaBefore, fixturesRetained: true })); }
    catch { console.error('Final schema fingerprint unavailable.'); }
    server.close(); server.closeAllConnections(); await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  // Pipe "stop" to finish gracefully on Windows without terminating the parent shell.
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (text) => { if (text.trim() === 'stop') void stop(); });
} catch {
  console.error('Isolated verification could not start; credentials and raw database diagnostics withheld.');
  server?.close(); await pool?.end(); process.exitCode = 1;
}
