import test from 'node:test';
import assert from 'node:assert/strict';
import { modelSeedOptions, seedDeploymentModels } from '../scripts/seed-deployment-models.mjs';

const args = ['--apply', '--confirm-production', '--database', 'deployment_fixture'];
const env = { NODE_ENV: 'production', DB_HOST: '127.0.0.1', DB_USER: 'app', DB_PASSWORD: 'fixture',
  DB_NAME: 'deployment_fixture', ANTHROPIC_API_KEY: 'fixture-not-a-real-key' };
test('deployment model seed requires confirmed target, apply and provider key', () => {
  assert.equal(modelSeedOptions(args, env).database, 'deployment_fixture');
  for (const [a, e] of [[[], env], [['--validate', ...args.slice(1)], env], [args, { ...env, ANTHROPIC_API_KEY: '' }],
    [args, { ...env, DB_NAME: 'other' }], [args, { ...env, NODE_ENV: 'development' }]]) {
    assert.throws(() => modelSeedOptions(a, e));
  }
});
function fixture() {
  const calls = [];
  const connection = Object.fromEntries(['beginTransaction', 'commit', 'rollback'].map(name => [name, async () => { calls.push(name); }]));
  const operations = {
    validate: async () => { calls.push('validate'); return { validation: { valid: true } }; },
    fetchMetadata: async () => { calls.push('metadata'); return [{ id: 'fixture-model' }]; },
    seed: async () => { calls.push('seed'); return { inserted: 1 }; },
  };
  return { calls, connection, operations };
}
test('model seed validates first, obtains metadata then commits existing idempotent seeder', async () => {
  const f = fixture();
  const result = await seedDeploymentModels(f.connection, 'deployment_fixture', [], f.operations);
  assert.deepEqual(f.calls, ['validate', 'metadata', 'beginTransaction', 'seed', 'commit']);
  assert.equal(result.existingRowsOverwritten, false);
  assert.equal(result.paidInferenceCalls, 0);
});
test('invalid schema and provider failures prevent writes', async () => {
  for (const kind of ['schema', 'provider', 'empty']) {
    const f = fixture();
    if (kind === 'schema') f.operations.validate = async () => ({ validation: { valid: false } });
    if (kind === 'provider') f.operations.fetchMetadata = async () => { throw Error('PROVIDER_FAILED'); };
    if (kind === 'empty') f.operations.fetchMetadata = async () => [];
    await assert.rejects(seedDeploymentModels(f.connection, 'deployment_fixture', [], f.operations));
    assert.ok(!f.calls.includes('beginTransaction'));
    assert.ok(!f.calls.includes('seed'));
  }
});
test('model seed rolls back failed inserts and does not report a commit', async () => {
  const f = fixture();
  f.operations.seed = async () => { throw Error('DATABASE_FAILED'); };
  await assert.rejects(seedDeploymentModels(f.connection, 'deployment_fixture', [], f.operations), /DATABASE_FAILED/);
  assert.deepEqual(f.calls, ['validate', 'metadata', 'beginTransaction', 'rollback']);
});
