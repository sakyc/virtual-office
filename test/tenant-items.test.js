import assert from 'node:assert/strict';
import test from 'node:test';
import { approveTenantItem, deleteTenantItem, loadTenantItemDetail, loadTenantItemRevisions } from '../server/tenant-items.js';

const context = { organizationId: 3, workspaceId: 8, role: 'member' }; const principal = { userId: 9 };
test('detail scopes both output and parent job and exposes only safe structured output', async () => {
  const calls = [];
  const row = { id: 4, type: 'brief', title: '<script>not executable</script>', agent_id: 'bagas', status: 'draft', version: 2,
    content: JSON.stringify({ fields: [{ label: 'Result', kind: 'text', value: 'Fixture' }] }), created_at: '2026-10-23', updated_at: '2026-10-23', error: 'internal secret' };
  const detail = await loadTenantItemDetail({ execute: async (sql, values) => { calls.push({ sql, values }); return [[row]]; } }, { tenantContext: context, itemId: 4 });
  assert.equal(detail.content.fields[0].value, 'Fixture'); assert.equal(detail.version, 2); assert.equal(detail.agentId, 'bagas');
  assert.equal(detail.error, undefined);
  assert.match(calls[0].sql, /JOIN jobs j ON j.id = i.job_id/);
  assert.match(calls[0].sql, /i.organization_id = \? AND i.workspace_id = \?/);
  assert.match(calls[0].sql, /j.organization_id = \? AND j.workspace_id = \?/);
  assert.match(calls[0].sql, /i.deleted_at IS NULL/);
  assert.deepEqual(calls[0].values, [4, 3, 8, 3, 8]);
});
test('unowned, deleted and cross-tenant detail produce 404 when scoped query finds no row', async () => {
  await assert.rejects(loadTenantItemDetail({ execute: async () => [[]] }, { tenantContext: context, itemId: 4 }), { status: 404 });
});
test('invalid item detail IDs are rejected before SQL', async () => {
  for (const itemId of [NaN, 0, -1, 1.5]) await assert.rejects(loadTenantItemDetail({ execute: async () => { throw new Error('must not execute'); } }, { tenantContext: context, itemId }), { status: 400 });
});
test('viewer approval is denied before any SQL', async () => {
  await assert.rejects(approveTenantItem({ execute: async () => { throw new Error('must not execute'); } }, { tenantContext: { ...context, role: 'viewer' }, principal, itemId: 4 }), { status: 403 });
});
test('approve and delete cannot modify an item while a revision owns it', async () => {
  for (const action of [approveTenantItem, deleteTenantItem]) {
    const calls = [];
    await assert.rejects(action({ execute: async (sql, values) => { calls.push({ sql, values }); return [{ affectedRows: 0 }]; } }, { tenantContext: { ...context, role: 'admin' }, principal, itemId: 4 }), { status: 404 });
    assert.match(calls[0].sql, /status <> 'revising'/);
  }
});

test('raw legacy/provider revision diagnostics are never reflected in item detail', async () => {
  const detail = await loadTenantItemDetail({ execute: async () => [[{ id: 4, content: { fields: [] }, last_error: 'mysql://private-credential@internal', reject_reason: 'Human feedback' }]] }, { tenantContext: context, itemId: 4 });
  assert.equal(detail.rejectReason, 'Human feedback'); assert.match(detail.lastError, /Revisi gagal/); assert.doesNotMatch(JSON.stringify(detail), /credential|mysql/);
});
test('member approval is scoped to tenant item ownership', async () => { const calls = []; await approveTenantItem({ execute: async (sql, values) => { calls.push({ sql, values }); return [{ affectedRows: 1 }]; } }, { tenantContext: context, principal, itemId: 4 }); assert.match(calls[0].sql, /organization_id = \? AND workspace_id = \?/); assert.deepEqual(calls[0].values, [9, 4, 3, 8]); });
test('member cannot delete and no query runs', async () => { await assert.rejects(() => deleteTenantItem({ execute: async () => { throw new Error('must not execute'); } }, { tenantContext: context, principal, itemId: 4 }), { status: 403 }); });
test('admin can soft-delete only its workspace item', async () => { const calls = []; await deleteTenantItem({ execute: async (sql, values) => { calls.push({ sql, values }); return [{ affectedRows: 1 }]; } }, { tenantContext: { ...context, role: 'admin' }, principal, itemId: 4 }); assert.match(calls[0].sql, /deleted_at = NOW/); assert.deepEqual(calls[0].values, [9, 4, 3, 8]); });

test('revision history is scoped to both the revision and parent item', async () => {
  const calls = [];
  const revisions = await loadTenantItemRevisions({ execute: async (sql, values) => {
    calls.push({ sql, values });
    return [[{ id: 12, version: 3, reason: 'Client feedback', created_at: '2026-10-22' }]];
  } }, { tenantContext: context, itemId: 4 });
  assert.deepEqual(revisions, [{ id: 12, version: 3, reason: 'Client feedback', createdAt: '2026-10-22' }]);
  assert.match(calls[0].sql, /JOIN items i ON i\.id = r\.item_id/);
  assert.match(calls[0].sql, /r\.organization_id = \? AND r\.workspace_id = \?/);
  assert.match(calls[0].sql, /i\.organization_id = \? AND i\.workspace_id = \?/);
  assert.deepEqual(calls[0].values, [4, 3, 8, 3, 8]);
});
