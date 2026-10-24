import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Both guards must fail before process discovery or ANY connection. No live opt-in
// is provided by the ordinary offline test suite.
for (const [label, env] of [
  ['missing approval', { LOCAL_TEAM_MIGRATION_APPROVED: '0' }],
  ['production environment', { LOCAL_TEAM_MIGRATION_APPROVED: '1', NODE_ENV: 'production' }],
]) test(`local team operator refuses ${label} before database access`, () => {
  const result = spawnSync(process.execPath, ['scripts/apply-local-team-migration.mjs'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...process.env, ...env }, encoding: 'utf8', timeout: 10000, windowsHide: true,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout.trim(), '');
  const report = JSON.parse(result.stderr.trim());
  assert.equal(report.failed, true); assert.equal(report.phase, 'approval');
  assert.equal(report.backupDirectory, undefined);
});
