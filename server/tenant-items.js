const writeRoles = new Set(['owner', 'admin', 'member']);

// Scope both the revision and parent item so inconsistent child rows cannot cross tenants.
export async function loadTenantItemRevisions(connection, { tenantContext, itemId }) {
  const [rows] = await connection.execute(
    `SELECT r.id, r.version, r.reason, r.created_at AS created_at
       FROM revisions r
       JOIN items i ON i.id = r.item_id
      WHERE r.item_id = ?
        AND r.organization_id = ? AND r.workspace_id = ?
        AND i.organization_id = ? AND i.workspace_id = ?
        AND i.deleted_at IS NULL
      ORDER BY r.id DESC LIMIT 100`,
    [itemId, tenantContext.organizationId, tenantContext.workspaceId, tenantContext.organizationId, tenantContext.workspaceId],
  );
  return rows.map((revision) => ({ id: revision.id, version: revision.version, reason: revision.reason, createdAt: revision.created_at }));
}

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
