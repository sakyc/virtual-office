import assert from 'node:assert/strict';
import test from 'node:test';
import { createTenantClient } from '../server/tenant-clients.js';

const context = { organizationId: 3, workspaceId: 8, role: 'member' };
const principal = { userId: 9 };

test('client creation sets tenant ownership from server context', async () => {
  const calls = [];
  const connection = { execute: async (sql, values) => { calls.push({ sql, values }); return [{ insertId: 41 }]; } };
  assert.deepEqual(await createTenantClient(connection, { tenantContext: context, principal, body: { name: '  Acme  Studio ', brief: 'Launch work' } }), { id: 41, name: 'Acme Studio', brief: 'Launch work' });
  assert.match(calls[0].sql, /organization_id, workspace_id, created_by_user_id, updated_by_user_id/);
  assert.deepEqual(calls[0].values.slice(-4), [3, 8, 9, 9]);
});

test('viewer cannot create a client', async () => {
  await assert.rejects(() => createTenantClient({ execute: async () => { throw new Error('must not execute'); } }, { tenantContext: { ...context, role: 'viewer' }, principal, body: { name: 'Acme' } }), { status: 403 });
});
