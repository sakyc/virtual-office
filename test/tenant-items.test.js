import assert from 'node:assert/strict';
import test from 'node:test';
import { approveTenantItem, deleteTenantItem, loadTenantItemRevisions } from '../server/tenant-items.js';

const context = { organizationId: 3, workspaceId: 8, role: 'member' }; const principal = { userId: 9 };
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
