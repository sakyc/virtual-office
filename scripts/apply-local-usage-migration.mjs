// Explicit operator utility. Never imported by application startup.
import 'dotenv/config';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { migrationConnectionOptions } from '../server/migrations/database.js';
import { inspectMigrationDirectory, compareMigrationHistory } from '../server/migrations/status.js';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';

const options = migrationConnectionOptions();
const expectedExecutable = 'C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\mysqld.exe';
const tools = 'C:/laragon/bin/mysql/mysql-8.0.30-winx64/bin/';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const quote = (value) => '`' + value.replaceAll('`', '``') + '`';
let source, restored, evidence, backupDirectory;

async function child(binary, args, { input, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const processChild = spawn(binary, args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    processChild.stdout.on('data', (data) => { output += data; });
    processChild.stderr.on('data', () => {}); // Never print dump/client errors that might contain private data.
    processChild.on('error', () => reject(new Error('CHILD_START_FAILED')));
    processChild.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(`CHILD_EXIT_${code}`)));
    processChild.stdin.on('error', () => {});
    if (input) {
      const stream = createReadStream(input);
      stream.on('error', () => { processChild.kill(); reject(new Error('BACKUP_READ_FAILED')); });
      stream.pipe(processChild.stdin);
    } else processChild.stdin.end();
  });
}

async function snapshot(connection) {
  const [columns] = await connection.execute(`SELECT table_name, column_name, ordinal_position, column_type, is_nullable, column_default, extra, character_set_name, collation_name
    FROM information_schema.columns WHERE table_schema = DATABASE() ORDER BY table_name, ordinal_position`);
  const [indexes] = await connection.execute(`SELECT table_name, index_name, non_unique, seq_in_index, column_name, sub_part, index_type
    FROM information_schema.statistics WHERE table_schema = DATABASE() ORDER BY table_name, index_name, seq_in_index`);
  const [keys] = await connection.execute(`SELECT k.table_name, k.constraint_name, k.column_name, k.ordinal_position, k.referenced_table_name, k.referenced_column_name, r.update_rule, r.delete_rule
    FROM information_schema.key_column_usage k LEFT JOIN information_schema.referential_constraints r
    ON r.constraint_schema = k.constraint_schema AND r.constraint_name = k.constraint_name
    WHERE k.table_schema = DATABASE() ORDER BY k.table_name, k.constraint_name, k.ordinal_position`);
  const [tables] = await connection.execute('SELECT table_name AS name, engine, table_collation FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name');
  assert.ok(tables.every((row) => row.ENGINE === 'InnoDB'), 'NON_TRANSACTIONAL_TABLE');
  const data = {};
  for (const { name } of tables) {
    const [rows] = await connection.query(`SELECT * FROM ${quote(name)}`);
    data[name] = { count: rows.length, digest: hash(JSON.stringify(rows.map((row) => JSON.stringify(row)).sort())) };
  }
  return { columns, indexes, keys, tables, data };
}

async function runMigration(database) {
  const env = { ...process.env, DB_NAME: database, MIGRATION_NON_PROD_APPROVED: '1', MIGRATION_TARGET_LABEL: 'non-production', MIGRATION_NON_PROD_DB_NAME: database };
  const result = JSON.parse(await child(process.execPath, ['scripts/migrate.js', '--apply', '--confirm-non-production'], { env }));
  assert.deepEqual(result.applied, ['004_ai_usage'], 'UNEXPECTED_MIGRATION_SET');
  return result;
}

try {
  assert.equal(process.env.LOCAL_USAGE_MIGRATION_APPROVED, '1', 'LOCAL_APPROVAL_REQUIRED');
  assert.notEqual(process.env.NODE_ENV, 'production', 'PRODUCTION_REFUSED');
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(options.host), 'LOOPBACK_REQUIRED');
  assert.equal(options.port, 3306, 'UNEXPECTED_PORT');
  assert.equal(options.database, 'virtual_office', 'UNEXPECTED_DATABASE');
  const processEvidence = JSON.parse(await child('powershell.exe', ['-NoProfile', '-Command', " $listener = Get-NetTCPConnection -State Listen -LocalPort 3306 -ErrorAction Stop | Select-Object -First 1; Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $listener.OwningProcess) | Select-Object ProcessId, ExecutablePath | ConvertTo-Json -Compress"]));
  assert.equal(processEvidence.ExecutablePath.toLowerCase(), expectedExecutable.toLowerCase(), 'LOCAL_SERVER_IDENTITY_MISMATCH');
  source = await mysql.createConnection({ ...options, timezone: 'Z' });
  await source.execute("SET time_zone = '+00:00'");
  const [[identity]] = await source.execute('SELECT DATABASE() AS databaseName, @@port AS port, @@datadir AS dataDirectory');
  assert.equal(identity.databaseName, 'virtual_office');
  assert.match(identity.dataDirectory.replaceAll('\\', '/').toLowerCase(), /^c:\/laragon\/data\//);
  const report = await inspectMigrationDirectory('migrations');
  assert.equal(report.diagnostics.length, 0);
  const [history] = await source.execute('SELECT migration_id, checksum, status FROM schema_migrations ORDER BY migration_id');
  assert.equal(compareMigrationHistory(report.migrations, history).length, 0);
  assert.deepEqual(history.map((row) => row.migration_id), ['001_current_schema_baseline', '002_tenant_foundation', '003_native_credentials']);
  const before = await snapshot(source);
  await mkdir('D:/VetendCode/database-backups', { recursive: true });
  backupDirectory = await mkdtemp('D:/VetendCode/database-backups/virtual-office-ai-usage-');
  const backup = `${backupDirectory}/before-004.sql`;
  const dumpEnv = { ...process.env, MYSQL_PWD: options.password };
  const common = ['--host=' + options.host, '--port=3306', '--user=' + options.user];
  await child(`${tools}mysqldump.exe`, [...common, '--single-transaction', '--skip-lock-tables', '--no-tablespaces', '--set-gtid-purged=OFF', '--column-statistics=0', '--hex-blob', '--result-file=' + backup, options.database], { env: dumpEnv });
  const backupBytes = await readFile(backup);
  assert.ok(backupBytes.length > 0);
  assert.deepEqual(await snapshot(source), before, 'SOURCE_CHANGED_DURING_BACKUP');
  const restoreName = `vo_usage_restore_${Date.now()}`;
  const [existing] = await source.execute('SELECT schema_name FROM information_schema.schemata WHERE schema_name = ?', [restoreName]);
  assert.equal(existing.length, 0);
  await source.query(`CREATE DATABASE ${quote(restoreName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await child(`${tools}mysql.exe`, [...common, '--default-character-set=utf8mb4', restoreName], { input: backup, env: dumpEnv });
  restored = await mysql.createConnection({ ...options, database: restoreName, timezone: 'Z' });
  await restored.execute("SET time_zone = '+00:00'");
  assert.deepEqual(await snapshot(restored), before, 'RESTORE_SCHEMA_OR_CONTENT_MISMATCH');
  evidence = { time: new Date().toISOString(), target: options.database, localServer: processEvidence, backup, bytes: backupBytes.length, sha256: hash(backupBytes), restoreDatabase: restoreName, restoreVerified: true, before };
  await writeFile(`${backupDirectory}/verification.json`, JSON.stringify(evidence, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ backup, sha256: evidence.sha256, restoreDatabase: restoreName, restoreVerified: true }));
  evidence.restoreMigration = await runMigration(restoreName);
  evidence.restoreValidation = await validateCurrentSchema(restored, { requireTenantFoundation: true, requireNativeCredentials: true, requireAiUsage: true });
  assert.equal(evidence.restoreValidation.valid, true, 'RESTORE_MIGRATION_VALIDATION_FAILED');
  // Only after verified backup + rehearsal. No schema.sql, baseline adoption, or startup invocation.
  assert.deepEqual(await snapshot(source), before, 'SOURCE_CHANGED_BEFORE_APPLY');
  evidence.targetMigration = await runMigration(options.database);
  evidence.targetValidation = await validateCurrentSchema(source, { requireTenantFoundation: true, requireNativeCredentials: true, requireAiUsage: true });
  assert.equal(evidence.targetValidation.valid, true, 'TARGET_MIGRATION_VALIDATION_FAILED');
  const after = await snapshot(source);
  for (const table of Object.keys(before.data).filter((name) => name !== 'schema_migrations')) {
    assert.deepEqual(after.data[table], before.data[table], 'EXISTING_DATA_CHANGED');
    for (const section of ['columns', 'indexes', 'keys']) assert.deepEqual(after[section].filter((row) => row.TABLE_NAME === table), before[section].filter((row) => row.TABLE_NAME === table), 'EXISTING_SCHEMA_CHANGED');
  }
  assert.equal(after.data.ai_usage.count, 0);
  const [finalHistory] = await source.execute('SELECT migration_id, checksum, status FROM schema_migrations ORDER BY migration_id');
  assert.equal(compareMigrationHistory(report.migrations, finalHistory).length, 0);
  assert.equal(finalHistory.at(-1).status, 'applied');
  evidence.after = after; evidence.history = finalHistory; evidence.existingDataUnchanged = true;
  await writeFile(`${backupDirectory}/verification.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ target: options.database, applied: evidence.targetMigration.applied, validation: evidence.targetValidation, historyChecksumsValid: true, existingDataUnchanged: true, usageRows: after.data.ai_usage.count, evidence: `${backupDirectory}/verification.json` }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ failed: true, code: error.code || 'LOCAL_VERIFICATION_FAILED', check: error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0] : undefined, backupDirectory, recovery: 'Stop; preserve evidence and migration history. No automatic retry or deletion.' }));
  process.exitCode = 1;
} finally { await restored?.end(); await source?.end(); }
