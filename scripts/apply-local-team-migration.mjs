// Explicit one-shot operator workflow. No application startup import; no provider imports.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { connectApprovedNonProduction, migrationConnectionOptions } from '../server/migrations/database.js';
import { inspectMigrationDirectory, compareMigrationHistory, inspectDatabaseHistory } from '../server/migrations/status.js';
import { acquireMigrationLock, releaseMigrationLock, applyMigrations } from '../server/migrations/framework.js';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';
import { verifyTeamLive } from './verify-team-live.mjs';

const options = migrationConnectionOptions(), root = fileURLToPath(new URL('..', import.meta.url));
const toolDirectory = 'C:/laragon/bin/mysql/mysql-8.0.30-winx64/bin/';
const digest = (data) => createHash('sha256').update(data).digest('hex');
const quote = (name) => { assert.match(name, /^[a-z0-9_]+$/i); return '`' + name + '`'; };
const normalized = (path) => path.replaceAll('\\', '/').replace(/\/+/g, '/').toLowerCase();
let phase = 'approval', source, restore, fresh, failure, pool, sessionFreeze, backupDirectory, evidence;
async function child(binary, args, { input, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const task = spawn(binary, args, { cwd: root, windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    task.stdout.on('data', (bytes) => { output += bytes; }); task.stderr.on('data', () => {});
    task.on('error', () => reject(Object.assign(new Error(), { code: 'CHILD_START_FAILED' })));
    task.on('close', (code) => code === 0 ? resolve(output) : reject(Object.assign(new Error(), { code: `CHILD_EXIT_${code}` })));
    task.stdin.on('error', () => {});
    if (input) { const stream = createReadStream(input); stream.on('error', () => { task.kill(); reject(Object.assign(new Error(), { code: 'BACKUP_READ_FAILED' })); }); stream.pipe(task.stdin); }
    else task.stdin.end();
  });
}
async function snapshot(connection) {
  const result = {};
  [result.columns] = await connection.execute('SELECT table_name AS tableName, column_name, ordinal_position, column_type, is_nullable, column_default, extra, character_set_name, collation_name FROM information_schema.columns WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position');
  [result.indexes] = await connection.execute('SELECT table_name AS tableName, index_name, non_unique, seq_in_index, column_name, sub_part, index_type FROM information_schema.statistics WHERE table_schema = DATABASE() ORDER BY table_name, index_name, seq_in_index');
  [result.keys] = await connection.execute(`SELECT k.table_name AS tableName, k.constraint_name, k.column_name, k.ordinal_position, k.referenced_table_name, k.referenced_column_name, r.update_rule, r.delete_rule
    FROM information_schema.key_column_usage k LEFT JOIN information_schema.referential_constraints r ON r.constraint_schema = k.constraint_schema AND r.constraint_name = k.constraint_name
    WHERE k.table_schema = DATABASE() ORDER BY k.table_name, k.constraint_name, k.ordinal_position`);
  [result.tables] = await connection.execute('SELECT table_name AS name, engine AS engine, table_collation AS collation FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name');
  assert.ok(result.tables.every((t) => t.engine === 'InnoDB'), 'TRANSACTIONAL_TABLES_REQUIRED');
  result.data = {};
  for (const { name } of result.tables) {
    const [rows] = await connection.query(`SELECT * FROM ${quote(name)}`);
    result.data[name] = { count: rows.length, digest: digest(JSON.stringify(rows.map((r) => JSON.stringify(r)).sort())) };
  }
  return result;
}
async function history(connection) { return (await connection.execute('SELECT migration_id, checksum, status FROM schema_migrations ORDER BY migration_id'))[0]; }
async function validation(connection, team = true) {
  const result = await validateCurrentSchema(connection, { requireTenantFoundation: true, requireNativeCredentials: true, requireAiUsage: true, requireWorkspaceTeam: team });
  assert.equal(result.valid, true, 'SCHEMA_CONTRACT_FAILED'); return result;
}
function unchanged(before, after, withHistory = true) {
  for (const name of Object.keys(before.data).filter((n) => withHistory || n !== 'schema_migrations')) {
    assert.deepEqual(after.data[name], before.data[name], 'EXISTING_ROWS_CHANGED');
    for (const section of ['columns', 'indexes', 'keys']) assert.deepEqual(after[section].filter((r) => r.tableName === name), before[section].filter((r) => r.tableName === name), 'EXISTING_SCHEMA_CHANGED');
  }
}
async function apply(connection, migrations, expected) {
  await acquireMigrationLock(connection);
  try { const result = (await applyMigrations(connection, migrations)).map((m) => m.name); assert.deepEqual(result, expected, 'UNEXPECTED_MIGRATION_SET'); return result; }
  finally { await releaseMigrationLock(connection); }
}
async function createIsolated(name) {
  assert.match(name, /^vo_team_(fresh|restore|failure)_\d+$/);
  assert.equal((await source.execute('SELECT schema_name FROM information_schema.schemata WHERE schema_name = ?', [name]))[0].length, 0, 'TEST_DATABASE_EXISTS');
  await source.query(`CREATE DATABASE ${quote(name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const env = { ...process.env, DB_NAME: name, MIGRATION_NON_PROD_APPROVED: '1', MIGRATION_TARGET_LABEL: 'non-production', MIGRATION_NON_PROD_DB_NAME: name };
  const connection = await connectApprovedNonProduction(env); await connection.execute("SET time_zone = '+00:00'");
  return connection;
}
async function persist() { if (evidence) await writeFile(`${backupDirectory}/verification.json`, JSON.stringify(evidence, null, 2)); }
try {
  assert.equal(process.env.LOCAL_TEAM_MIGRATION_APPROVED, '1', 'LOCAL_APPROVAL_REQUIRED');
  assert.notEqual(process.env.NODE_ENV, 'production'); assert.ok(['localhost', '127.0.0.1', '::1'].includes(options.host));
  assert.equal(options.port, 3306); assert.equal(options.database, 'virtual_office');
  const report = await inspectMigrationDirectory(fileURLToPath(new URL('../migrations/', import.meta.url)));
  assert.equal(report.diagnostics.length, 0); assert.equal(report.migrations.at(-1)?.id, '005_workspace_team', 'ONE_SHOT_MIGRATION_SET_CHANGED');
  phase = 'local-process-identity';
  const processEvidence = JSON.parse(await child('powershell.exe', ['-NoProfile', '-Command', " $listener = Get-NetTCPConnection -State Listen -LocalPort 3306 -ErrorAction Stop | Select-Object -First 1; Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $listener.OwningProcess) | Select-Object ProcessId, ExecutablePath | ConvertTo-Json -Compress"]));
  assert.equal(normalized(processEvidence.ExecutablePath), normalized(`${toolDirectory}mysqld.exe`));
  // All guards run before any connection. Approval flags are scoped to this child workflow.
  const approved = { ...process.env, MIGRATION_NON_PROD_APPROVED: '1', MIGRATION_TARGET_LABEL: 'non-production', MIGRATION_NON_PROD_DB_NAME: options.database };
  source = await connectApprovedNonProduction(approved); await source.execute("SET time_zone = '+00:00'");
  const [[identity]] = await source.execute('SELECT DATABASE() AS databaseName, @@port AS port, @@datadir AS dataDirectory, VERSION() AS version');
  assert.equal(identity.databaseName, options.database); assert.equal(identity.port, 3306); assert.match(normalized(identity.dataDirectory), /^c:\/laragon\/data\//);
  phase = 'source-history-preflight';
  const prior = report.migrations.slice(0, -1), beforeHistory = await history(source);
  assert.deepEqual(beforeHistory.map((r) => r.migration_id), prior.map((m) => m.id), 'SOURCE_ALREADY_APPLIED_OR_UNEXPECTED_HISTORY');
  assert.deepEqual(compareMigrationHistory(report.migrations, beforeHistory), []);
  await validation(source, false);
  assert.equal((await source.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('workspace_divisions','workspace_agents')"))[0].length, 0, 'PARTIAL_TEAM_SCHEMA_PRESENT');
  let before = await snapshot(source);
  await mkdir('D:/VetendCode/database-backups', { recursive: true }); backupDirectory = await mkdtemp('D:/VetendCode/database-backups/virtual-office-team-');
  evidence = { time: new Date().toISOString(), target: identity, localProcess: processEvidence, beforeHistory, before, checks: {}, phase };
  await persist();
  phase = 'fresh-database-migrations';
  const suffix = Date.now(); evidence.freshDatabase = `vo_team_fresh_${suffix}`; fresh = await createIsolated(evidence.freshDatabase); await persist();
  evidence.checks.freshApplied = await apply(fresh, report.migrations, report.migrations.map((m) => m.id));
  evidence.checks.freshValidation = await validation(fresh);
  assert.deepEqual(compareMigrationHistory(report.migrations, await history(fresh)), []);
  evidence.checks.duplicateApply = await apply(fresh, report.migrations, []);
  await acquireMigrationLock(fresh);
  const contender = await connectApprovedNonProduction({ ...approved, DB_NAME: evidence.freshDatabase, MIGRATION_NON_PROD_DB_NAME: evidence.freshDatabase });
  try { await assert.rejects(acquireMigrationLock(contender, 0), { code: 'MIGRATION_LOCK_UNAVAILABLE' }); evidence.checks.concurrentMigrationDenied = true; }
  finally { await contender.end(); await releaseMigrationLock(fresh); }
  pool = mysql.createPool({ ...options, database: evidence.freshDatabase, connectionLimit: 8 });
  phase = 'fresh-team-sql-http-tests'; evidence.checks.integration = await verifyTeamLive(fresh, pool); await pool.end(); pool = null; await persist();
  phase = 'failure-recovery-test';
  evidence.failureDatabase = `vo_team_failure_${suffix}`; failure = await createIsolated(evidence.failureDatabase); await persist();
  await apply(failure, report.migrations, report.migrations.map((m) => m.id));
  const probeSource = 'SELECT * FROM vo_intentionally_missing_failure_probe';
  const probe = { id: '006_isolated_failure_probe', file: '006_isolated_failure_probe.sql', checksum: digest(probeSource), source: probeSource };
  await assert.rejects(apply(failure, [...report.migrations, probe], [probe.id]), (error) => (error.code || error.cause?.code) === 'ER_NO_SUCH_TABLE');
  const failed = (await history(failure)).at(-1); assert.equal(failed.status, 'failed');
  await assert.rejects(apply(failure, [...report.migrations, probe], []), { code: 'MIGRATION_HISTORY_NOT_FINAL' });
  evidence.checks.failureRecordedAndRerunDenied = true; await persist();
  phase = 'backup-and-restore';
  // The running local app refreshes last_seen_at/idle_expires_at even without AI
  // requests. Freeze only session writes for the brief backup/restore/apply window;
  // never terminate dev processes, weaken authentication, or discard the data check.
  sessionFreeze = await connectApprovedNonProduction(approved);
  await sessionFreeze.execute('SET SESSION lock_wait_timeout = 10');
  await sessionFreeze.query('LOCK TABLES sessions READ');
  const freezeStarted = Date.now();
  evidence.sessionWriteFreeze = { startedAt: new Date().toISOString(), method: 'LOCK TABLES sessions READ; dedicated local connection only' };
  before = await snapshot(source); evidence.before = before; await persist();
  const backup = `${backupDirectory}/before-005.sql`, dumpEnv = { ...process.env, MYSQL_PWD: options.password };
  const common = [`--host=${options.host}`, '--port=3306', `--user=${options.user}`];
  await child(`${toolDirectory}mysqldump.exe`, [...common, '--single-transaction', '--skip-lock-tables', '--no-tablespaces', '--set-gtid-purged=OFF', '--column-statistics=0', '--hex-blob', `--result-file=${backup}`, options.database], { env: dumpEnv });
  const bytes = await readFile(backup); assert.ok(bytes.length > 0); assert.deepEqual(await snapshot(source), before, 'SOURCE_CHANGED_DURING_REHEARSAL');
  evidence.backup = { path: backup, bytes: bytes.length, sha256: digest(bytes) }; await persist();
  evidence.restoreDatabase = `vo_team_restore_${suffix}`; restore = await createIsolated(evidence.restoreDatabase); await persist();
  await child(`${toolDirectory}mysql.exe`, [...common, '--default-character-set=utf8mb4', evidence.restoreDatabase], { input: backup, env: dumpEnv });
  assert.deepEqual(await snapshot(restore), before, 'RESTORE_SCHEMA_OR_DATA_MISMATCH'); evidence.checks.backupRestoreVerified = true;
  evidence.checks.restoreApplied = await apply(restore, report.migrations, ['005_workspace_team']); evidence.checks.restoreValidation = await validation(restore);
  unchanged(before, await snapshot(restore), false); await persist();
  console.log(JSON.stringify({ backup: evidence.backup, freshPassed: true, restorePassed: true }));
  phase = 'development-apply';
  assert.ok(Date.now() - freezeStarted < 60000, 'SESSION_FREEZE_WINDOW_EXCEEDED');
  assert.deepEqual(await snapshot(source), before, 'SOURCE_CHANGED_BEFORE_APPLY');
  evidence.checks.developmentApplied = await apply(source, report.migrations, ['005_workspace_team']);
  evidence.checks.developmentValidation = await validation(source);
  const after = await snapshot(source); unchanged(before, after, false);
  assert.equal(after.data.workspace_divisions.count, 0); assert.equal(after.data.workspace_agents.count, 0);
  const status = await inspectDatabaseHistory(source, report.migrations); assert.deepEqual(status.diagnostics, []);
  evidence.checks.readOnlyStatus = { diagnostics: status.diagnostics, history: status.history }; evidence.after = after;
  evidence.checks.existingDataUnchanged = true; evidence.phase = 'complete';
  await sessionFreeze.query('UNLOCK TABLES'); await sessionFreeze.end(); sessionFreeze = null;
  evidence.sessionWriteFreeze.finishedAt = new Date().toISOString(); await persist();
  console.log(JSON.stringify({ target: options.database, applied: evidence.checks.developmentApplied, validation: evidence.checks.developmentValidation, existingDataUnchanged: true,
    teamTablesEmpty: true, integrationChecks: evidence.checks.integration.passed.length, backup: evidence.backup, evidence: `${backupDirectory}/verification.json`, retainedDatabases: [evidence.freshDatabase, evidence.failureDatabase, evidence.restoreDatabase] }, null, 2));
} catch (error) {
  if (evidence) { evidence.failed = { phase, code: error.code || 'VERIFICATION_FAILED' }; await persist().catch(() => {}); }
  console.error(JSON.stringify({ failed: true, phase, code: error.code || 'VERIFICATION_FAILED', backupDirectory, recovery: 'Stop. Preserve backups, databases and history; no automatic retry/deletion.' })); process.exitCode = 1;
} finally {
  if (sessionFreeze) { await sessionFreeze.query('UNLOCK TABLES').catch(() => {}); await sessionFreeze.end(); }
  await pool?.end(); for (const connection of [failure, fresh, restore, source]) await connection?.end();
}
