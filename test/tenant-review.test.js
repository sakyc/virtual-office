import assert from 'node:assert/strict';
import test from 'node:test';
import { processTenantRevision, rejectTenantItem, reserveTenantRevision, REVISION_FAILURE } from '../server/tenant-review.js';

const tenantContext = { organizationId: 3, workspaceId: 8, role: 'member' };
const principal = { userId: 9, sessionId: 2 };
const input = { tenantContext, principal, itemId: 4, body: { version: 1, reason: 'Perjelas kebutuhan client.' } };
const oldContent = { fields: [{ label: 'Ringkasan', kind: 'text', value: 'Sebelum revisi' }] };

function fixture({ missing = false, clientMissing = false, lockUnavailable = false, failSnapshot = false, failRelease = false, access = true } = {}) {
  const row = { id: 4, job_id: 44, client_id: 6, job_client_id: 6, title: 'Versi lama', content: oldContent, status: 'draft', version: 1, agent_id: 'bagas', type: 'brief', job_type: 'brief_analysis', params: { brief: 'Fixture' }, updated_by_user_id: 9, last_error: null };
  const calls = [], snapshots = [];
  let before, locked = false, destroyed = false;
  const connection = {
    async beginTransaction() { calls.push({ operation: 'begin' }); before = { row: structuredClone(row), snapshots: structuredClone(snapshots) }; },
    async commit() { calls.push({ operation: 'commit' }); before = null; },
    async rollback() { calls.push({ operation: 'rollback' }); if (before) { Object.assign(row, before.row); snapshots.splice(0, snapshots.length, ...before.snapshots); } before = null; },
    release() { calls.push({ operation: 'release' }); },
    destroy() { destroyed = true; calls.push({ operation: 'destroy' }); },
    async execute(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('GET_LOCK')) { if (lockUnavailable || locked) return [[{ acquired: 0 }]]; locked = true; return [[{ acquired: 1 }]]; }
      if (sql.includes('RELEASE_LOCK')) { if (failRelease) throw new Error('release failed'); locked = false; return [[{ released: 1 }]]; }
      if (sql.includes('SELECT s.id FROM sessions')) return [typeof access === 'function' ? access() ? [{ id: 2 }] : [] : access ? [{ id: 2 }] : []];
      if (sql.includes('FROM items i JOIN jobs')) return [missing ? [] : [structuredClone(row)]];
      if (sql.includes('SELECT name, brief')) return [clientMissing ? [] : [{ name: 'Client fixture', brief: 'Brief' }]];
      if (sql.startsWith('INSERT INTO revisions')) {
        if (failSnapshot) throw new Error('mysql://private-credential@internal');
        snapshots.push(values); return [{ insertId: snapshots.length }];
      }
      if (sql.startsWith('UPDATE items SET status = \'rejected\'')) { row.status = 'rejected'; row.reject_reason = values[0]; row.updated_by_user_id = values[1]; }
      else if (sql.startsWith('UPDATE items SET status = \'revising\'')) { row.status = 'revising'; row.last_error = null; row.updated_by_user_id = values[0]; }
      else if (sql.startsWith('UPDATE items SET title')) { row.title = values[0]; row.content = JSON.parse(values[1]); row.version++; row.status = 'draft'; row.last_error = null; row.reject_reason = null; }
      else if (sql.startsWith('UPDATE items SET status = ?')) {
        if (row.status === 'revising' && row.version === values[5] && row.updated_by_user_id === values[6]) { row.status = values[0]; row.last_error = values[1]; }
      }
      return [{ affectedRows: 1 }];
    },
  };
  const pool = { getConnection: async () => connection };
  return { row, connection, pool, calls, snapshots, isDestroyed: () => destroyed };
}

const output = { items: [{ title: 'Versi baru', content: { fields: [{ label: 'Ringkasan', kind: 'text', value: 'Sesudah revisi' }] } }], usage: { in: 5, out: 7 } };
const run = (f, reservation, reviseImpl = async () => output) => processTenantRevision({ pool: f.pool, client: null, DEMO: false, models: {}, reservation, reviseImpl });

test('review requires member+ server permission, version and bounded reason before touching SQL', async () => {
  const connection = { beginTransaction() { throw new Error('must not execute'); } };
  for (const action of [rejectTenantItem, reserveTenantRevision]) {
    for (const role of ['viewer', 'platform_admin', undefined]) await assert.rejects(action(connection, { ...input, tenantContext: { ...tenantContext, role } }), { status: 403 });
    for (const body of [{ reason: 'Valid reason' }, { version: 1, reason: '  ' }, { version: 1, reason: 'x'.repeat(2001) }]) await assert.rejects(action(connection, { ...input, body }), { status: 400 });
  }
});

test('reject records bounded reason and actor, preserving the original content', async () => {
  const f = fixture();
  await rejectTenantItem(f.connection, input);
  assert.equal(f.row.status, 'rejected'); assert.equal(f.row.reject_reason, input.body.reason);
  assert.deepEqual(f.row.content, oldContent); assert.equal(f.snapshots.length, 0);
  const select = f.calls.find((call) => call.sql?.includes('FOR UPDATE'));
  assert.deepEqual(select.values, [4, 3, 8, 3, 8]);
  const update = f.calls.find((call) => call.sql?.startsWith('UPDATE items'));
  assert.deepEqual(update.values, [input.body.reason, 9, 4, 3, 8, 1]);
  await assert.rejects(rejectTenantItem(f.connection, input), { status: 409 });
});

test('cross-tenant or legacy target is 404 with no mutation and transaction rollback', async () => {
  for (const action of [rejectTenantItem, reserveTenantRevision]) {
    const f = fixture({ missing: true });
    await assert.rejects(action(f.connection, input), { status: 404 });
    assert.ok(!f.calls.some((call) => call.sql?.startsWith('UPDATE')));
    assert.equal(f.calls.at(-1).operation, 'rollback');
  }
});

test('stale versions and already-revising items deny any second review', async () => {
  const f = fixture(); const reservation = await reserveTenantRevision(f.connection, input);
  assert.equal(f.row.status, 'revising'); assert.equal(reservation.previousStatus, 'draft');
  assert.deepEqual(reservation.tenantContext, tenantContext); assert.deepEqual(reservation.principal, principal);
  for (const action of [rejectTenantItem, reserveTenantRevision]) await assert.rejects(action(f.connection, input), { status: 409 });
  f.row.status = 'draft'; f.row.version = 2;
  for (const action of [rejectTenantItem, reserveTenantRevision]) await assert.rejects(action(f.connection, input), { status: 409 });
});

test('successful revision atomically snapshots previous version, updates content and scopes usage', async () => {
  const f = fixture(); const reservation = await reserveTenantRevision(f.connection, input);
  let generated = 0;
  const result = await run(f, reservation, async (args) => { generated++; assert.deepEqual(args.item.content, oldContent); assert.equal(args.reason, input.body.reason); assert.equal(args.clientRow.name, 'Client fixture'); return output; });
  assert.deepEqual(result, { status: 'completed' }); assert.equal(f.row.version, 2); assert.equal(f.row.status, 'draft');
  assert.equal(f.row.title, 'Versi baru'); assert.equal(f.snapshots.length, 1);
  assert.deepEqual(f.snapshots[0], [4, 1, input.body.reason, 'Versi lama', JSON.stringify(oldContent), 3, 8, 9]);
  assert.deepEqual(f.calls.find((call) => call.sql?.startsWith('UPDATE jobs')).values, [5, 7, 44, 3, 8]);
  assert.deepEqual(await run(f, reservation, async () => { generated++; return output; }), { status: 'superseded' });
  assert.equal(generated, 1); assert.equal(f.snapshots.length, 1);
});

test('advisory lock prevents concurrent workers from calling the provider twice', async () => {
  const f = fixture(); const reservation = await reserveTenantRevision(f.connection, input);
  let resume, started;
  const ready = new Promise((resolve) => { started = resolve; });
  const blocker = new Promise((resolve) => { resume = resolve; });
  const first = run(f, reservation, async () => { started(); await blocker; return output; });
  await ready;
  assert.deepEqual(await run(f, reservation, async () => { throw new Error('must not generate'); }), { status: 'already-running' });
  resume(); assert.deepEqual(await first, { status: 'completed' });
});

test('provider failure restores prior status, preserves content and permits explicit manual retry', async () => {
  const f = fixture(); f.row.status = 'approved';
  const reservation = await reserveTenantRevision(f.connection, input);
  assert.deepEqual(await run(f, reservation, async () => { throw new Error('private provider credential'); }), { status: 'failed' });
  assert.equal(f.row.status, 'approved'); assert.equal(f.row.version, 1); assert.deepEqual(f.row.content, oldContent);
  assert.equal(f.row.last_error, REVISION_FAILURE); assert.equal(f.snapshots.length, 0);
  const retry = await reserveTenantRevision(f.connection, input);
  assert.deepEqual(await run(f, retry), { status: 'completed' }); assert.equal(f.row.version, 2);
});

test('snapshot database failure rolls back all successful-output changes', async () => {
  const f = fixture({ failSnapshot: true }); const reservation = await reserveTenantRevision(f.connection, input);
  assert.deepEqual(await run(f, reservation), { status: 'failed' });
  assert.equal(f.row.version, 1); assert.equal(f.row.title, 'Versi lama'); assert.deepEqual(f.row.content, oldContent);
  assert.equal(f.row.last_error, REVISION_FAILURE); assert.equal(f.snapshots.length, 0);
});

test('revoked session or membership prevents provider calls and revision commit', async () => {
  const f = fixture({ access: false }); const reservation = await reserveTenantRevision(f.connection, input);
  assert.deepEqual(await run(f, reservation, async () => { throw new Error('provider must not be called'); }), { status: 'failed' });
  assert.equal(f.row.version, 1); assert.equal(f.row.status, 'draft');
  let accesses = 0;
  const revokedDuringRun = fixture({ access: () => ++accesses === 1 });
  const second = await reserveTenantRevision(revokedDuringRun.connection, input);
  assert.deepEqual(await run(revokedDuringRun, second), { status: 'failed' });
  assert.equal(revokedDuringRun.snapshots.length, 0); assert.equal(revokedDuringRun.row.version, 1);
});

test('foreign client context is not sent to provider', async () => {
  const f = fixture({ clientMissing: true }); const reservation = await reserveTenantRevision(f.connection, input);
  let called = false;
  assert.deepEqual(await run(f, reservation, async () => { called = true; return output; }), { status: 'failed' }); assert.equal(called, false);
  assert.deepEqual(f.calls.find((call) => call.sql?.startsWith('SELECT name')).values, [6, 3, 8]);
});

test('a pooled connection is destroyed if the named lock cannot be released', async () => {
  const f = fixture({ failRelease: true }); const reservation = await reserveTenantRevision(f.connection, input);
  assert.deepEqual(await run(f, reservation), { status: 'recovery-required' });
  assert.equal(f.isDestroyed(), true); assert.ok(!f.calls.some((call) => call.operation === 'release'));
});
