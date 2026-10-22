const writeRoles = new Set(['owner', 'admin', 'member']);

export async function approveTenantItem(connection, { tenantContext, principal, itemId }) {
  if (!writeRoles.has(tenantContext?.role)) throw Object.assign(new Error('Item review permission required.'), { status: 403 });
  const [result] = await connection.execute(
    `UPDATE items SET status = 'approved', approved_at = NOW(), reject_reason = NULL, updated_by_user_id = ?
      WHERE id = ? AND organization_id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    [principal.userId, itemId, tenantContext.organizationId, tenantContext.workspaceId],
  );
  if (!result.affectedRows) throw Object.assign(new Error('Item tidak ditemukan pada workspace aktif.'), { status: 404 });
}

export async function deleteTenantItem(connection, { tenantContext, principal, itemId }) {
  if (!['owner', 'admin'].includes(tenantContext?.role)) throw Object.assign(new Error('Item delete permission required.'), { status: 403 });
  const [result] = await connection.execute(
    `UPDATE items SET deleted_at = NOW(), updated_by_user_id = ?
      WHERE id = ? AND organization_id = ? AND workspace_id = ? AND deleted_at IS NULL`,
    [principal.userId, itemId, tenantContext.organizationId, tenantContext.workspaceId],
  );
  if (!result.affectedRows) throw Object.assign(new Error('Item tidak ditemukan pada workspace aktif.'), { status: 404 });
}
