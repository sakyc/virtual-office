import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compareMigrationHistory, inspectDatabaseHistory, inspectMigrationDirectory } from '../server/migrations/status.js';

async function fixture(manifest, files = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'virtual-office-migrations-'));
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  await Promise.all(Object.entries(files).map(([file, content]) => writeFile(path.join(dir, file), content)));
  return dir;
}

const checksum = (text) => createHash('sha256').update(text).digest('hex');

test('accepts valid ordered migrations and hashes source without executing it', async (t) => {
  const sql = 'SELECT 1;';
  const dir = await fixture({ format: 1, migrations: [{ id: '001_baseline_clients', file: '001_baseline_clients.sql' }] }, { '001_baseline_clients.sql': sql });
  t.after(() => rm(dir, { recursive: true, force: true }));
  const result = await inspectMigrationDirectory(dir);
  assert.equal(result.diagnostics.length, 0);
  assert.deepEqual(result.migrations, [{ id: '001_baseline_clients', file: '001_baseline_clients.sql', checksum: checksum(sql), source: sql }]);
});

test('reports duplicate IDs, invalid names, and ordering errors', async (t) => {
  const dir = await fixture({
    format: 1,
    migrations: [
      { id: '002_second', file: '002_second.sql' },
      { id: '001_first', file: '001_first.sql' },
      { id: '001_first', file: 'duplicate.sql' },
      { id: 'bad name', file: 'bad.sql' },
    ],
  }, { '002_second.sql': '', '001_first.sql': '', 'duplicate.sql': '', 'bad.sql': '' });
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { diagnostics } = await inspectMigrationDirectory(dir);
  assert.ok(diagnostics.some((entry) => entry.code === 'migration_order_invalid'));
  assert.ok(diagnostics.some((entry) => entry.code === 'migration_id_duplicate'));
  assert.ok(diagnostics.some((entry) => entry.code === 'migration_id_invalid'));
});

test('reports manifest references to missing migration files', async (t) => {
  const dir = await fixture({ format: 1, migrations: [{ id: '001_missing', file: '001_missing.sql' }] });
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { diagnostics } = await inspectMigrationDirectory(dir);
  assert.ok(diagnostics.some((entry) => entry.code === 'migration_file_missing'));
});

test('reports history checksum mismatch', () => {
  const diagnostics = compareMigrationHistory(
    [{ id: '001_baseline_clients', file: '001_baseline_clients.sql', checksum: 'a'.repeat(64) }],
    [{ migration_id: '001_baseline_clients', checksum: 'b'.repeat(64), status: 'applied' }],
  );
  assert.ok(diagnostics.some((entry) => entry.code === 'checksum_mismatch'));
});

test('reports unavailable database without exposing connection details', async () => {
  const result = await inspectDatabaseHistory({
    execute: async () => { const error = new Error('credentials must stay hidden'); error.code = 'ER_ACCESS_DENIED_ERROR'; throw error; },
  }, []);
  assert.equal(result.available, false);
  assert.equal(result.diagnostics[0].code, 'database_unavailable');
  assert.equal(result.diagnostics[0].databaseCode, 'ER_ACCESS_DENIED_ERROR');
  assert.equal(JSON.stringify(result), JSON.stringify(result).replace('credentials must stay hidden', ''));
});

test('database inspection only issues SELECT statements and never executes migration SQL', async () => {
  const calls = [];
  const connection = {
    execute: async (sql) => {
      calls.push(sql);
      if (sql.includes('information_schema.tables')) return [[{ table_name: 'schema_migrations' }]];
      return [[{ migration_id: '001_baseline_clients', checksum: 'a'.repeat(64), status: 'applied' }]];
    },
  };
  const result = await inspectDatabaseHistory(connection, [{ id: '001_baseline_clients', file: '001_baseline_clients.sql', checksum: 'a'.repeat(64) }]);
  assert.equal(result.available, true);
  assert.ok(calls.every((sql) => /^SELECT\b/i.test(sql.trim())));
  assert.ok(calls.every((sql) => !sql.includes('CREATE TABLE') && !sql.includes('SELECT 1;')));
});
