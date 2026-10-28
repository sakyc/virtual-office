import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentOptions, bootstrapDeployment, validateDeployment } from '../scripts/bootstrap-deployment.mjs';

const env = { NODE_ENV: 'production', DB_HOST: '127.0.0.1', DB_NAME: 'tenant_deploy', DB_USER: 'tenant_app', DB_PASSWORD: 'test-only' };
const args = ['--apply', '--confirm-production', '--database', 'tenant_deploy'];
test('deployment requires explicit production confirmation and matching non-root local target', () => {
  assert.equal(deploymentOptions(args, env).database, 'tenant_deploy');
  assert.equal(deploymentOptions(['--validate', ...args.slice(1)], env).database, 'tenant_deploy');
  for (const invalid of [[], args.slice(1), [...args, '--force'], ['--apply', '--confirm-production', '--database', 'other']]) {
    assert.throws(() => deploymentOptions(invalid, env));
  }
  for (const override of [{ NODE_ENV: 'development' }, { DB_USER: 'root' }, { DB_PASSWORD: '' }, { DB_HOST: 'remote.example' }]) {
    assert.throws(() => deploymentOptions(args, { ...env, ...override }));
  }
});

test('deployment validation rejects incomplete history using SELECT only', async () => {
  const queries = [];
  const c = { execute: async sql => {
    queries.push(sql);
    if (sql.startsWith('SELECT DATABASE()')) return [[{ db: 'tenant_deploy' }]];
    return [[]];
  } };
  await assert.rejects(validateDeployment(c, 'tenant_deploy', [{ id: '001', checksum: 'test' }]), /HISTORY_INCOMPLETE/);
  assert.ok(queries.every(sql => sql.startsWith('SELECT')));
});

function connection(db = 'tenant_deploy', tables = []) {
  return { execute: async sql => sql.startsWith('SELECT DATABASE()') ? [[{ db }]] : [tables] };
}
test('fresh deployment rejects wrong target and any existing table before mutations', async () => {
  const operations = { apply: () => { assert.fail('must not write'); } };
  await assert.rejects(bootstrapDeployment(connection('other'), 'tenant_deploy', [], operations), /DATABASE_MISMATCH/);
  await assert.rejects(bootstrapDeployment(connection('tenant_deploy', [{ table_name: 'anything' }]), 'tenant_deploy', [], operations), /NOT_EMPTY/);
});
test('fresh deployment uses framework then checksum history and all schema requirements', async () => {
  const order = [];
  const migrations = [{ id: 'fixture' }];
  const result = await bootstrapDeployment(connection(), 'tenant_deploy', migrations, {
    apply: async (c, m) => { assert.equal(m, migrations); order.push('apply'); return [{ name: 'fixture' }]; },
    history: async () => { order.push('history'); },
    validate: async (c, options) => { order.push('schema'); assert.equal(Object.keys(options).length, 16); assert.equal(options.requirePayments,true); assert.ok(Object.values(options).every(Boolean)); return { valid: true, differences: [] }; },
  });
  assert.deepEqual(order, ['apply', 'history', 'schema']);
  assert.deepEqual(result.applied, ['fixture']);
  assert.equal(result.validation.valid, true);
});
test('migration failure is propagated without retry or schema validation', async () => {
  let calls = 0;
  await assert.rejects(bootstrapDeployment(connection(), 'tenant_deploy', [], {
    apply: async () => { calls++; throw new Error('DDL_FAILED'); },
    validate: async () => assert.fail('must not continue'),
  }), /DDL_FAILED/);
  assert.equal(calls, 1);
});
