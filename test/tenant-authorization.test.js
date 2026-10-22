import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeTenantAction } from '../server/auth/tenant-authorization.js';

const resource = { organizationId: 'org-a', workspaceId: 'ws-a' };
const ownerContext = {
  organizationId: 'org-a', workspaceId: 'ws-a',
  organizationMemberships: [{ userId: 'owner', organizationId: 'org-a', role: 'owner', active: true }],
  workspaceMemberships: [],
};
const memberContext = {
  organizationId: 'org-a', workspaceId: 'ws-a', organizationMemberships: [],
  workspaceMemberships: [{ userId: 'member', organizationId: 'org-a', workspaceId: 'ws-a', role: 'member', active: true }],
};
const check = (principal, context, scopedResource, permission) => authorizeTenantAction({ principal, context, resource: scopedResource, permission });

test('owner accesses resources in any workspace within their organization', () => {
  assert.equal(check({ userId: 'owner' }, ownerContext, resource, 'item:purge').allowed, true);
  assert.equal(check({ userId: 'owner' }, { ...ownerContext, workspaceId: 'ws-b' }, { ...resource, workspaceId: 'ws-b' }, 'job:create').allowed, true);
});

test('member receives only granted permissions', () => {
  assert.equal(check({ userId: 'member' }, memberContext, resource, 'job:create').allowed, true);
  assert.equal(check({ userId: 'member' }, memberContext, resource, 'item:delete').reason, 'permission_denied');
});

test('viewer cannot write', () => {
  const context = { ...memberContext, workspaceMemberships: [{ userId: 'viewer', organizationId: 'org-a', workspaceId: 'ws-a', role: 'viewer', active: true }] };
  assert.equal(check({ userId: 'viewer' }, context, resource, 'item:update').reason, 'permission_denied');
});

test('denies cross-workspace resource access', () => {
  assert.equal(check({ userId: 'member' }, memberContext, { ...resource, workspaceId: 'ws-b' }, 'item:read').reason, 'resource_outside_active_workspace');
});

test('denies cross-organization resource access', () => {
  assert.equal(check({ userId: 'member' }, memberContext, { ...resource, organizationId: 'org-b' }, 'item:read').reason, 'resource_outside_active_workspace');
});

test('denies missing or invalid tenant context', () => {
  assert.equal(check({ userId: 'member' }, null, resource, 'item:read').reason, 'tenant_context_invalid');
  assert.equal(check(null, memberContext, resource, 'item:read').reason, 'principal_invalid');
});

test('platform admin has no implicit customer-content access', () => {
  assert.equal(check({ userId: 'platform', platformAdmin: true }, memberContext, resource, 'item:read').reason, 'platform_admin_requires_customer_grant');
});
