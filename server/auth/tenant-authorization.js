// Inputs must be resolved by trusted server-side authentication and membership loaders.
// This module never treats request body, query, or header tenant IDs as identity evidence.
const ROLE_PERMISSIONS = Object.freeze({
  admin: new Set(['chat:create', 'client:read', 'client:create', 'job:create', 'job:read', 'item:read', 'item:revise', 'item:review', 'item:update', 'item:delete', 'item:restore', 'item:purge', 'workspace:members:manage']),
  member: new Set(['chat:create', 'client:read', 'client:create', 'job:create', 'job:read', 'item:read', 'item:revise', 'item:review', 'item:update']),
  viewer: new Set(['client:read', 'job:read', 'item:read']),
});

function deny(reason) {
  return { allowed: false, reason };
}

function activeMembership(row, userId) {
  return row && row.userId === userId && row.active === true;
}

/**
 * Authorizes one resource action using server-resolved identity, memberships, and scope.
 * `resource` must come from a workspace-scoped database lookup, never client input.
 */
export function authorizeTenantAction({ principal, context, resource, permission }) {
  if (!principal || typeof principal.userId !== 'string' || !principal.userId) return deny('principal_invalid');
  if (!context || !resource || typeof permission !== 'string' || !permission) return deny('tenant_context_invalid');
  if (!resource.organizationId || !resource.workspaceId) return deny('resource_scope_invalid');
  if (context.organizationId !== resource.organizationId || context.workspaceId !== resource.workspaceId) return deny('resource_outside_active_workspace');

  const orgMemberships = Array.isArray(context.organizationMemberships) ? context.organizationMemberships : [];
  const workspaceMemberships = Array.isArray(context.workspaceMemberships) ? context.workspaceMemberships : [];
  const owner = orgMemberships.find((row) => activeMembership(row, principal.userId)
    && row.organizationId === resource.organizationId && row.role === 'owner');

  // Platform operations do not imply customer-content authority.
  if (principal.platformAdmin === true && !owner && !workspaceMemberships.some((row) => activeMembership(row, principal.userId))) {
    return deny('platform_admin_requires_customer_grant');
  }
  if (owner) return { allowed: true, reason: 'organization_owner', effectiveRole: 'owner' };

  const membership = workspaceMemberships.find((row) => activeMembership(row, principal.userId)
    && row.organizationId === resource.organizationId && row.workspaceId === resource.workspaceId);
  if (!membership) return deny('workspace_membership_missing');
  if (!ROLE_PERMISSIONS[membership.role]?.has(permission)) return deny('permission_denied');
  return { allowed: true, reason: 'workspace_membership', effectiveRole: membership.role };
}

export const tenantPermissions = ROLE_PERMISSIONS;
