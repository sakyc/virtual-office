import assert from 'node:assert/strict';
import test from 'node:test';
import { approveTenantItem, deleteTenantItem } from '../server/tenant-items.js';

const context = { organizationId: 3, workspaceId: 8, role: 'member' }; const principal = { userId: 9 };
test('member approval is scoped to tenant item ownership', async () => { const calls = []; await approveTenantItem({ execute: async (sql, values) => { calls.push({ sql, values }); return [{ affectedRows: 1 }]; } }, { tenantContext: context, principal, itemId: 4 }); assert.match(calls[0].sql, /organization_id = \? AND workspace_id = \?/); assert.deepEqual(calls[0].values, [9, 4, 3, 8]); });
test('member cannot delete and no query runs', async () => { await assert.rejects(() => deleteTenantItem({ execute: async () => { throw new Error('must not execute'); } }, { tenantContext: context, principal, itemId: 4 }), { status: 403 }); });
test('admin can soft-delete only its workspace item', async () => { const calls = []; await deleteTenantItem({ execute: async (sql, values) => { calls.push({ sql, values }); return [{ affectedRows: 1 }]; } }, { tenantContext: { ...context, role: 'admin' }, principal, itemId: 4 }); assert.match(calls[0].sql, /deleted_at = NOW/); assert.deepEqual(calls[0].values, [9, 4, 3, 8]); });
