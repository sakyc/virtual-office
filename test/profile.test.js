import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSessionProfile, selectActiveWorkspace } from '../server/auth/profile.js';

test('profile is assembled exclusively from the server-resolved principal and active memberships', async () => {
  const calls = [];
  const connection = {
    execute: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT id, email')) return [[{ id: 7, email: 'person@example.test', display_name: 'Person' }]];
      return [[
        { workspace_id: 12, workspace_slug: 'main', workspace_name: 'Main workspace', organization_id: 3, organization_slug: 'studio-garis', organization_name: 'Studio Garis', workspace_role: 'admin', organization_role: 'owner' },
        { workspace_id: 13, workspace_slug: 'delivery', workspace_name: 'Delivery', organization_id: 3, organization_slug: 'studio-garis', organization_name: 'Studio Garis', workspace_role: 'viewer', organization_role: null },
      ]];
    },
  };
  const result = await loadSessionProfile(connection, { userId: 7, activeWorkspaceId: 12 });
  assert.deepEqual(result.user, { id: 7, email: 'person@example.test', displayName: 'Person' });
  assert.equal(result.activeWorkspace.name, 'Main workspace');
  assert.equal(result.activeWorkspace.role, 'owner');
  assert.equal(result.workspaces[1].role, 'viewer');
  assert.deepEqual(calls[1].values, [7, 7]);
  assert.match(calls[1].sql, /wm\.user_id IS NOT NULL OR om\.role = 'owner'/);
});

test('profile leaves active workspace empty when the session points outside current membership', async () => {
  const connection = { execute: async (sql) => sql.startsWith('SELECT id, email') ? [[{ id: 7, email: 'person@example.test', display_name: null }]] : [[{ workspace_id: 12, workspace_slug: 'main', workspace_name: 'Main workspace', organization_id: 3, organization_slug: 'studio-garis', organization_name: 'Studio Garis', workspace_role: 'admin', organization_role: null }]] };
  const result = await loadSessionProfile(connection, { userId: 7, activeWorkspaceId: 999 });
  assert.equal(result.activeWorkspace, null);
  assert.equal(result.workspaces.length, 1);
});

test('workspace selection verifies membership before updating only the current server session', async () => {
  const calls = [];
  const connection = { execute: async (sql, values) => { calls.push({ sql, values }); return sql.startsWith('SELECT w.id') ? [[{ id: 12 }]] : [{ affectedRows: 1 }]; } };
  assert.equal(await selectActiveWorkspace(connection, { userId: 7, sessionId: 4 }, 12), true);
  assert.match(calls[0].sql, /wm\.user_id IS NOT NULL OR om\.role = 'owner'/);
  assert.deepEqual(calls[0].values, [7, 7, 12]);
  assert.deepEqual(calls[1].values, [12, 4, 7]);
});

test('workspace selection denies an unowned workspace without changing the session', async () => {
  const calls = [];
  const connection = { execute: async (sql) => { calls.push(sql); return [[]]; } };
  assert.equal(await selectActiveWorkspace(connection, { userId: 7, sessionId: 4 }, 99), false);
  assert.equal(calls.length, 1);
});
