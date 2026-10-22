import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSessionProfile } from '../server/auth/profile.js';

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
