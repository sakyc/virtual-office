import { billingError } from './billing-policy.js';
import { activeDemo, demoEntitlements } from './demo-policy.js';

// All capacity-changing writers lock the organization first, then its workspaces.
// Limits apply to the WHOLE organization, not independently to every workspace.
export async function lockBillingEntitlements(c, organizationId) {
  const [[org]] = await c.execute("SELECT id FROM organizations WHERE id = ? AND status = 'active' FOR UPDATE", [organizationId]);
  if (!org) throw billingError('Organisasi tidak aktif.', 403);
  let [[plan]] = await c.execute(`SELECT max_divisions AS maxDivisions, max_members AS maxMembers, whatsapp_enabled AS whatsapp
    FROM billing_subscriptions WHERE organization_id = ? AND status = 'active'
    AND period_start <= UTC_TIMESTAMP() AND period_end > UTC_TIMESTAMP() FOR UPDATE`, [organizationId]);
  if (!plan) { const demo=await activeDemo(c,organizationId); if(demo)plan=demoEntitlements(demo); }
  if (!plan) throw billingError('Langganan atau trial aktif diperlukan. Buka Langganan & Saldo.', 402);
  const [[usage]] = await c.execute(`SELECT
    (SELECT COUNT(*) FROM workspace_divisions d JOIN workspaces w ON w.id=d.workspace_id AND w.organization_id=d.organization_id
      WHERE d.organization_id=? AND d.status='active' AND w.status='active') AS divisions,
    (SELECT COUNT(DISTINCT memberships.user_id) FROM (
      SELECT om.user_id FROM organization_memberships om WHERE om.organization_id=? AND om.revoked_at IS NULL
      UNION ALL
      SELECT wm.user_id FROM workspace_memberships wm JOIN workspaces w ON w.id=wm.workspace_id
      WHERE w.organization_id=? AND w.status='active' AND wm.revoked_at IS NULL
    ) AS memberships) AS members`, [organizationId, organizationId, organizationId]);
  if (!Number.isInteger(plan.maxDivisions) || !Number.isInteger(plan.maxMembers) || plan.maxDivisions < 1 || plan.maxMembers < 1) throw billingError('BILLING_LIMITS_INVALID', 503);
  return { ...plan, divisions: Number(usage.divisions), members: Number(usage.members) };
}
export function enforceCapacity(entitlements, { addDivisions = 0, addMembers = 0, whatsapp = false } = {}) {
  if (!Number.isSafeInteger(addDivisions) || addDivisions < 0 || !Number.isSafeInteger(addMembers) || addMembers < 0 || typeof whatsapp !== 'boolean') throw billingError('BILLING_CAPACITY_REQUEST_INVALID', 400);
  if (entitlements.divisions + addDivisions > entitlements.maxDivisions) throw billingError('Batas divisi paket tercapai. Kurangi divisi atau ubah paket.', 402);
  if (entitlements.members + addMembers > entitlements.maxMembers) throw billingError('Batas anggota organisasi pada paket tercapai.', 402);
  if (whatsapp && !entitlements.whatsapp) throw billingError('Paket ini tidak mencakup WhatsApp.', 402);
}
export async function assertPaidAccess(c, organizationId, options) {
  const entitlements = await lockBillingEntitlements(c, organizationId);
  enforceCapacity(entitlements, options);
  return entitlements;
}

export function createPaidMutationGate({ getPool, providerAvailable }) {
  return async (req, res, next) => {
    let c;
    try {
      if (!providerAvailable) return res.status(503).json({ error: 'Layanan AI belum dikonfigurasi. Tidak ada hasil demo atau biaya yang dibuat.' });
      c = await getPool().getConnection(); await c.beginTransaction();
      await assertPaidAccess(c, req.tenantContext.organizationId);
      await c.commit(); next();
    } catch (error) {
      await c?.rollback().catch(() => {});
      res.status(error.status === 402 ? 402 : 503).json({ error: error.status === 402 ? error.message : 'Pemeriksaan langganan belum tersedia.' });
    } finally { c?.release(); }
  };
}
