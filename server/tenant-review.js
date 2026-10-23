import { jobById } from '../shared/jobs.js';
import { revise } from './runner.js';

const reviewRoles = new Set(['owner', 'admin', 'member']);
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const parse = (value) => typeof value === 'string' ? JSON.parse(value) : value;
export const REVISION_FAILURE = 'Revisi gagal. Konten sebelumnya tetap tersimpan. Muat ulang lalu coba lagi secara manual.';

function validate({ tenantContext, principal, itemId, body }, maxLength) {
  if (!reviewRoles.has(tenantContext?.role) || !Number.isSafeInteger(principal?.userId)) throw error('Item review permission required.', 403);
  if (!Number.isSafeInteger(itemId) || itemId <= 0) throw error('ID item tidak valid.');
  if (!Number.isSafeInteger(body?.version) || body.version <= 0) throw error('Versi item yang ditinjau wajib disertakan.');
  if (typeof body?.reason !== 'string' || body.reason.trim().length < 3 || body.reason.trim().length > maxLength) throw error(`Alasan wajib diisi, 3–${maxLength} karakter.`);
  return body.reason.trim();
}

async function lockItem(connection, { itemId, tenantContext }) {
  const [rows] = await connection.execute(
    `SELECT i.id, i.job_id, i.client_id, i.title, i.content, i.status, i.version, i.agent_id, i.type,
            j.job_type, j.params, j.client_id AS job_client_id
       FROM items i JOIN jobs j ON j.id = i.job_id
      WHERE i.id = ? AND i.organization_id = ? AND i.workspace_id = ?
        AND j.organization_id = ? AND j.workspace_id = ? AND i.deleted_at IS NULL
      FOR UPDATE`,
    [itemId, tenantContext.organizationId, tenantContext.workspaceId, tenantContext.organizationId, tenantContext.workspaceId],
  );
  if (!rows[0]) throw error('Item tidak ditemukan pada workspace aktif.', 404);
  return rows[0];
}

function checkVersion(item, version) {
  if (item.status === 'revising') throw error('Item sedang direvisi. Tunggu hingga proses selesai.', 409);
  if (item.version !== version) throw error('Versi item telah berubah. Muat ulang sebelum meninjau kembali.', 409);
}

export async function rejectTenantItem(connection, input) {
  const reason = validate(input, 500);
  await connection.beginTransaction();
  try {
    const item = await lockItem(connection, input); checkVersion(item, input.body.version);
    if (item.status === 'rejected') throw error('Item sudah ditolak. Muat ulang Board.', 409);
    await connection.execute(
      `UPDATE items SET status = 'rejected', reject_reason = ?, approved_at = NULL, last_error = NULL, updated_by_user_id = ?
        WHERE id = ? AND organization_id = ? AND workspace_id = ? AND version = ? AND deleted_at IS NULL`,
      [reason, input.principal.userId, item.id, input.tenantContext.organizationId, input.tenantContext.workspaceId, item.version],
    );
    await connection.commit();
  } catch (failure) { await connection.rollback(); throw failure; }
}

export async function reserveTenantRevision(connection, input) {
  const reason = validate(input, 2000);
  if (!Number.isSafeInteger(input.principal.sessionId)) throw error('Valid server session required.', 401);
  await connection.beginTransaction();
  try {
    const item = await lockItem(connection, input); checkVersion(item, input.body.version);
    await connection.execute(
      `UPDATE items SET status = 'revising', last_error = NULL, updated_by_user_id = ?
        WHERE id = ? AND organization_id = ? AND workspace_id = ? AND version = ? AND deleted_at IS NULL`,
      [input.principal.userId, item.id, input.tenantContext.organizationId, input.tenantContext.workspaceId, item.version],
    );
    await connection.commit();
    // This reservation is built exclusively from the locked row and authenticated server context.
    return { itemId: item.id, version: item.version, previousStatus: item.status, reason, tenantContext: { ...input.tenantContext }, principal: { ...input.principal } };
  } catch (failure) { await connection.rollback(); throw failure; }
}

async function assertRunnerAccess(connection, { tenantContext: tenant, principal }) {
  const [rows] = await connection.execute(
    `SELECT s.id FROM sessions s
       JOIN users u ON u.id = s.user_id AND u.status = 'active'
       JOIN workspaces w ON w.id = s.active_workspace_id AND w.status = 'active'
       JOIN organizations o ON o.id = w.organization_id AND o.status = 'active'
       LEFT JOIN organization_memberships om ON om.organization_id = o.id AND om.user_id = u.id AND om.revoked_at IS NULL
       LEFT JOIN workspace_memberships wm ON wm.workspace_id = w.id AND wm.user_id = u.id AND wm.revoked_at IS NULL
      WHERE s.id = ? AND s.user_id = ? AND s.revoked_at IS NULL
        AND s.idle_expires_at > CURRENT_TIMESTAMP AND s.absolute_expires_at > CURRENT_TIMESTAMP
        AND w.id = ? AND o.id = ? AND (om.role = 'owner' OR wm.role IN ('admin','member')) LIMIT 1`,
    [principal.sessionId, principal.userId, tenant.workspaceId, tenant.organizationId],
  );
  if (!rows[0]) throw error('Item revision access expired.', 403);
}

export async function recoverTenantRevision(connection, reservation) {
  const { tenantContext: tenant, principal } = reservation;
  await connection.execute(
    `UPDATE items SET status = ?, last_error = ?
      WHERE id = ? AND organization_id = ? AND workspace_id = ? AND version = ?
        AND status = 'revising' AND updated_by_user_id = ? AND deleted_at IS NULL`,
    [reservation.previousStatus, REVISION_FAILURE, reservation.itemId, tenant.organizationId, tenant.workspaceId, reservation.version, principal.userId],
  );
}

export async function processTenantRevision({ pool, client, DEMO, models, reservation, reviseImpl = revise }) {
  let connection;
  let transaction = false;
  const tenant = reservation.tenantContext;
  const ownsReservation = (item) => item.status === 'revising' && item.version === reservation.version;
  try {
    connection = await pool.getConnection();
    // A connection-scoped lock prevents two worker invocations from generating for one reservation.
    const lockName = `vo:revision:${tenant.workspaceId}:${reservation.itemId}`;
    const [locks] = await connection.execute('SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
    if (Number(locks[0]?.acquired) !== 1) return { status: 'already-running' };
    try {
      await assertRunnerAccess(connection, reservation);
      await connection.beginTransaction(); transaction = true;
      const item = await lockItem(connection, reservation);
      if (!ownsReservation(item)) { await connection.rollback(); transaction = false; return { status: 'superseded' }; }
      const definition = jobById(item.job_type);
      if (!definition || definition.agent !== item.agent_id) throw error('Item job definition is unavailable.', 409);
      const clientId = item.job_client_id;
      let clientRow = null;
      if (clientId) {
        const [clients] = await connection.execute('SELECT name, brief FROM clients WHERE id = ? AND organization_id = ? AND workspace_id = ?', [clientId, tenant.organizationId, tenant.workspaceId]);
        if (!clients[0]) throw error('Client tidak ditemukan pada workspace aktif.', 404);
        clientRow = clients[0];
      }
      await connection.commit(); transaction = false;
      const output = await reviseImpl({ apiClient: client, DEMO, models, def: definition, params: parse(item.params), clientRow,
        item: { ...item, content: parse(item.content) }, reason: reservation.reason });
      const next = output.items?.[0];
      if (!next || typeof next.title !== 'string' || !Array.isArray(next.content?.fields) || !next.content.fields.length) throw new Error('Revision output invalid');
      await connection.beginTransaction(); transaction = true;
      await assertRunnerAccess(connection, reservation);
      const current = await lockItem(connection, reservation);
      if (!ownsReservation(current)) { await connection.rollback(); transaction = false; return { status: 'superseded' }; }
      await connection.execute(
        `INSERT INTO revisions (item_id, version, reason, title_before, content_before, organization_id, workspace_id, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [current.id, current.version, reservation.reason, current.title, JSON.stringify(parse(current.content)), tenant.organizationId, tenant.workspaceId, reservation.principal.userId],
      );
      const [saved] = await connection.execute(
        `UPDATE items SET title = ?, content = ?, version = version + 1, status = 'draft', reject_reason = NULL,
                approved_at = NULL, last_error = NULL, updated_by_user_id = ?
          WHERE id = ? AND organization_id = ? AND workspace_id = ? AND version = ? AND status = 'revising' AND deleted_at IS NULL`,
        [next.title, JSON.stringify(next.content), reservation.principal.userId, current.id, tenant.organizationId, tenant.workspaceId, current.version],
      );
      if (saved.affectedRows !== 1) throw new Error('Revision reservation changed');
      await connection.execute(
        'UPDATE jobs SET tokens_in = COALESCE(tokens_in,0) + ?, tokens_out = COALESCE(tokens_out,0) + ? WHERE id = ? AND organization_id = ? AND workspace_id = ?',
        [Number(output.usage?.in) || 0, Number(output.usage?.out) || 0, current.job_id, tenant.organizationId, tenant.workspaceId],
      );
      await connection.commit(); transaction = false;
      return { status: 'completed' };
    } catch {
      if (transaction) { await connection.rollback(); transaction = false; }
      await recoverTenantRevision(connection, reservation);
      return { status: 'failed' };
    } finally {
      // Named locks survive rollback and must be released before returning a pooled connection.
      try { await connection.execute('SELECT RELEASE_LOCK(?) AS released', [lockName]); }
      catch { connection.destroy(); connection = null; throw new Error('Revision lock release failed'); }
    }
  } catch {
    // If the DB itself is unavailable, never automatically regenerate. See the recovery runbook.
    return { status: 'recovery-required' };
  } finally { connection?.release(); }
}
