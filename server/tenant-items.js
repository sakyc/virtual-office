import { assertTenantItemReview, itemReviewAccess, lockMemberPolicy } from './member-access.js';
const writeRoles = new Set(['owner', 'admin', 'member']);

export async function loadTenantItemDetail(connection, { tenantContext, itemId }) {
  if (!Number.isSafeInteger(itemId) || itemId <= 0) throw Object.assign(new Error('ID item tidak valid.'), { status: 400 });
  const [rows] = await connection.execute(
    `SELECT i.id, i.type, i.title, i.agent_id, i.status, i.version, i.content, i.reject_reason, i.last_error, i.created_at, i.updated_at,
       JSON_UNQUOTE(JSON_EXTRACT(j.params, '$.task.agent.name')) AS agent_name,
       JSON_UNQUOTE(JSON_EXTRACT(j.params, '$.task.model')) AS selected_model
       FROM items i JOIN jobs j ON j.id = i.job_id
      WHERE i.id = ? AND i.organization_id = ? AND i.workspace_id = ?
        AND j.organization_id = ? AND j.workspace_id = ? AND i.deleted_at IS NULL LIMIT 1`,
    [itemId, tenantContext.organizationId, tenantContext.workspaceId, tenantContext.organizationId, tenantContext.workspaceId],
  );
  if (!rows[0]) throw Object.assign(new Error('Item tidak ditemukan pada workspace aktif.'), { status: 404 });
  const item = rows[0];
  return {
    id: item.id, type: item.type, title: item.title, agentId: item.agent_id, status: item.status, version: item.version,
    content: typeof item.content === 'string' ? JSON.parse(item.content) : item.content,
    createdAt: item.created_at, updatedAt: item.updated_at, rejectReason: item.reject_reason || null,
    // Existing legacy/provider diagnostics must never be reflected into the customer UI.
    lastError: item.last_error ? 'Revisi gagal. Konten sebelumnya tetap tersimpan. Muat ulang lalu coba lagi secara manual.' : null,
    ...(item.agent_name ? { agentName: item.agent_name, model: item.selected_model } : {}),
    ...(tenantContext.memberPolicy ? await itemReviewAccess(connection, tenantContext, itemId) : {}),
  };
}

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
  if (tenantContext.memberPolicy) await connection.beginTransaction();
  try {
    await lockMemberPolicy(connection, tenantContext);
    await assertTenantItemReview(connection, tenantContext, itemId);
    const [result] = await connection.execute(
      `UPDATE items SET status = 'approved', approved_at = NOW(), reject_reason = NULL, updated_by_user_id = ?
        WHERE id = ? AND organization_id = ? AND workspace_id = ? AND deleted_at IS NULL AND status <> 'revising'`,
      [principal.userId, itemId, tenantContext.organizationId, tenantContext.workspaceId],
    );
    if (!result.affectedRows) throw Object.assign(new Error('Item tidak ditemukan pada workspace aktif.'), { status: 404 });
    if (tenantContext.memberPolicy) await connection.commit();
  } catch (error) {
    if (tenantContext.memberPolicy) await connection.rollback();
    throw error;
  }
}

export async function deleteTenantItem(connection, { tenantContext, principal, itemId }) {
  if (!['owner', 'admin'].includes(tenantContext?.role)) throw Object.assign(new Error('Item delete permission required.'), { status: 403 });
  const [result] = await connection.execute(
    `UPDATE items SET deleted_at = NOW(), updated_by_user_id = ?
      WHERE id = ? AND organization_id = ? AND workspace_id = ? AND deleted_at IS NULL AND status <> 'revising'`,
    [principal.userId, itemId, tenantContext.organizationId, tenantContext.workspaceId],
  );
  if (!result.affectedRows) throw Object.assign(new Error('Item tidak ditemukan pada workspace aktif.'), { status: 404 });
}
