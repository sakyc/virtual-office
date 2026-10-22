import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { approvedNonProductionEnvironment } from '../server/migrations/database.js';
import { acquireMigrationLock, applyMigrations, ensureFreshApplicationSchema, ensureHistoryTable, validateHistory } from '../server/migrations/framework.js';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';

const migration = { id: '001_current_schema_baseline', file: '001_current_schema_baseline.sql', checksum: 'a'.repeat(64), source: 'CREATE TABLE clients (id INT);' };

test('non-production guard requires explicit matching target identity', () => {
  assert.equal(approvedNonProductionEnvironment({ DB_NAME: 'office_test' }), false);
  assert.equal(approvedNonProductionEnvironment({ MIGRATION_NON_PROD_APPROVED: '1', MIGRATION_TARGET_LABEL: 'non-production', MIGRATION_NON_PROD_DB_NAME: 'office_test', DB_NAME: 'office_test' }), true);
  assert.equal(approvedNonProductionEnvironment({ MIGRATION_NON_PROD_APPROVED: '1', MIGRATION_TARGET_LABEL: 'production', MIGRATION_NON_PROD_DB_NAME: 'office_test', DB_NAME: 'office_test' }), false);
});

test('history rejects failed and checksum-modified migrations', async () => {
  const failed = { execute: async () => [[{ migration_id: migration.id, checksum: migration.checksum, status: 'failed' }]] };
  await assert.rejects(() => validateHistory(failed, [migration]), { code: 'MIGRATION_HISTORY_NOT_FINAL' });
  const changed = { execute: async () => [[{ migration_id: migration.id, checksum: 'b'.repeat(64), status: 'applied' }]] };
  await assert.rejects(() => validateHistory(changed, [migration]), { code: 'MIGRATION_HISTORY_MISMATCH' });
});

test('advisory lock fails safely when another runner owns it', async () => {
  const connection = { execute: async () => [[{ acquired: 0 }]] };
  await assert.rejects(() => acquireMigrationLock(connection), { code: 'MIGRATION_LOCK_UNAVAILABLE' });
});

test('fresh initialization rejects an existing application schema before metadata writes', async () => {
  const calls = [];
  const connection = { execute: async (sql) => { calls.push(sql); return [[{ table_name: 'clients' }]]; } };
  await assert.rejects(() => ensureFreshApplicationSchema(connection), { code: 'EXISTING_APPLICATION_SCHEMA' });
  assert.equal(calls.length, 1);
});

test('baseline application records failure and does not mark it applied', async () => {
  const calls = [];
  const connection = { execute: async (sql) => {
    calls.push(sql);
    if (sql.includes('information_schema.tables')) return [[]];
    if (sql.startsWith('SELECT migration_id, checksum')) return [[]];
    if (sql.startsWith('SELECT COUNT(*)')) return [[{ count: 0 }]];
    if (sql.startsWith('CREATE TABLE clients')) { const error = new Error('bad SQL'); error.code = 'ER_PARSE_ERROR'; throw error; }
    return [[]];
  } };
  await assert.rejects(() => applyMigrations(connection, [migration]));
  assert.ok(calls.some((sql) => sql.includes("status = 'failed'")));
  assert.ok(!calls.some((sql) => sql.includes("status = 'applied'")));
});

test('schema contract detects missing current-schema table or column', async () => {
  const result = await validateCurrentSchema({ execute: async (sql) => {
    if (sql.includes('information_schema.columns')) return [[{ tableName: 'clients', columnName: 'id' }]];
    return [[]];
  } });
  assert.equal(result.valid, false);
  assert.ok(result.differences.some((entry) => entry.reason === 'table_missing'));
  assert.ok(result.differences.some((entry) => entry.reason === 'foreign_key_missing'));
});

test('history metadata is created only by runner/adoption path', async () => {
  const calls = [];
  await ensureHistoryTable({ execute: async (sql) => { calls.push(sql); return [[]]; } });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^CREATE TABLE IF NOT EXISTS schema_migrations/);
});

test('migration framework is explicit and does not alter application startup', async () => {
  const startup = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const framework = await readFile(new URL('../server/migrations/framework.js', import.meta.url), 'utf8');
  assert.match(startup, /initDb\(\);/);
  assert.doesNotMatch(startup, /applyMigrations|createUmzug/);
  assert.match(framework, /new Umzug/);
});
