import assert from 'node:assert/strict';
import test from 'node:test';
import { baselineForAdoption } from '../server/migrations/framework.js';

test('adoption selects only immutable baseline even after later migrations are registered', () => {
  const baseline = { id: '001_current_schema_baseline', checksum: 'a'.repeat(64) };
  assert.equal(baselineForAdoption([baseline]), baseline);
  assert.equal(baselineForAdoption([baseline, { id: '002_tenant_foundation' }, { id: '003_native_credentials' }]), baseline);
});

test('adoption rejects missing, misplaced and duplicate baselines', () => {
  for (const migrations of [[], [{ id: '002_tenant_foundation' }], [{ id: '002_tenant_foundation' }, { id: '001_current_schema_baseline' }], [{ id: '001_current_schema_baseline' }, { id: '001_current_schema_baseline' }]]) {
    assert.throws(() => baselineForAdoption(migrations), { code: 'BASELINE_ADOPTION_INVALID' });
  }
});
