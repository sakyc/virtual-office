const editableRoles = new Set(['owner', 'admin', 'member']);

export async function createTenantClient(connection, { tenantContext, principal, body }) {
  if (!editableRoles.has(tenantContext?.role)) throw Object.assign(new Error('Client create permission required.'), { status: 403 });
  const name = String(body?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 150);
  const brief = String(body?.brief ?? '').trim().slice(0, 4000);
  if (!name) throw Object.assign(new Error('Nama client wajib diisi.'), { status: 400 });
  const [result] = await connection.execute(
    `INSERT INTO clients (name, brief, organization_id, workspace_id, created_by_user_id, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, brief || null, tenantContext.organizationId, tenantContext.workspaceId, principal.userId, principal.userId],
  );
  return { id: result.insertId, name, brief: brief || null };
}
