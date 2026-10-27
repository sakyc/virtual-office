import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIntegerType, portableColumns } from '../server/migrations/column-types.js';

test('integer display widths normalize without changing sign or actual storage type', () => {
  assert.equal(normalizeIntegerType('bigint(20) unsigned'), 'bigint unsigned');
  assert.equal(normalizeIntegerType('tinyint(3) unsigned'), 'tinyint unsigned');
  assert.equal(normalizeIntegerType('int(10) unsigned'), 'int unsigned');
  assert.equal(normalizeIntegerType('bigint(20)'), 'bigint');
  assert.notEqual(normalizeIntegerType('bigint(20)'), 'bigint unsigned');
  assert.equal(normalizeIntegerType('varchar(20)'), 'varchar(20)');
  assert.equal(normalizeIntegerType('decimal(20,4)'), 'decimal(20,4)');
});
test('native JSON needs no metadata fallback', async () => {
  const columns = [{ name: 'details', type: 'json', nullable: 'NO' }];
  assert.deepEqual(await portableColumns({ execute: () => assert.fail('unexpected query') }, 'fixture', columns), columns);
});
test('MariaDB JSON alias requires an exact JSON_VALID constraint on that column', async () => {
  const columns = [{ name: 'details', type: 'longtext', nullable: 'NO' }];
  for (const clause of ['json_valid(`details`)', '(json_valid(`details`))', 'JSON_VALID(details)']) {
    const c = { execute: async (sql, params) => { assert.deepEqual(params, ['fixture']); return [[{ clause }]]; } };
    assert.equal((await portableColumns(c, 'fixture', columns))[0].type, 'json');
  }
  for (const checks of [[], [{ clause: 'json_valid(`other`)' }], [{ clause: 'json_valid(`details`) OR 1=1' }]]) {
    assert.equal((await portableColumns({ execute: async () => [checks] }, 'fixture', columns))[0].type, 'longtext');
  }
  assert.equal(columns[0].type, 'longtext');
});
