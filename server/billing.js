import { randomUUID, createHash } from 'node:crypto';
import { billingError, money, subscriptionTerms, resolveBillingEntitlements } from './billing-policy.js';
import { PLAN_SELECT, readCatalog, catalogTerms } from './billing-catalog.js';
import {activeDemo,demoEntitlements,readDemoStatus} from './demo-policy.js';
import {assertManagedDemoAi,managedDemoForOrganization} from './managed-demo-policy.js';

const json = (value) => typeof value === 'string' ? JSON.parse(value) : value;
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const utc = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw billingError('BILLING_DATE_INVALID', 400);
  if (new Date(value).toISOString() !== value) throw billingError('BILLING_DATE_INVALID', 400);
  return value.slice(0, 19).replace('T', ' ');
};
const reference = (value) => { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,190}$/.test(value)) throw billingError('BILLING_REFERENCE_INVALID', 400); return value; };
const organization = (id) => { if (!Number.isSafeInteger(id) || id < 1) throw billingError('BILLING_SCOPE_INVALID', 400); return id; };

// Trusted server/operator service ONLY. Never pass browser funding or plan claims here.
// Customer wallet funding is only invoked by the verified payment service,
// never directly from browser funding/identity claims.
export function createBillingService(getPool) {
  async function transaction(org, key, kind, payload, action) {
    organization(org); reference(key);
    const hash = createHash('sha256').update(JSON.stringify(canonical({ kind, payload }))).digest('hex');
    const c = await getPool().getConnection();
    try {
      await c.beginTransaction();
      await c.execute('INSERT INTO billing_wallets (organization_id) VALUES (?) ON DUPLICATE KEY UPDATE organization_id = VALUES(organization_id)', [org]);
      const [[wallet]] = await c.execute("SELECT w.organization_id FROM billing_wallets w JOIN organizations o ON o.id = w.organization_id AND o.status = 'active' WHERE w.organization_id = ? FOR UPDATE", [org]);
      if (!wallet) throw billingError('BILLING_ORGANIZATION_UNAVAILABLE', 403);
      const [[previous]] = await c.execute('SELECT request_hash, result FROM billing_ledger WHERE organization_id = ? AND idempotency_key = ?', [org, key]);
      if (previous) {
        if (previous.request_hash !== hash) throw billingError('BILLING_IDEMPOTENCY_CONFLICT');
        await c.commit(); return json(previous.result);
      }
      const { amount, result } = await action(c);
      await c.execute('INSERT INTO billing_ledger (id, organization_id, idempotency_key, request_hash, kind, amount_idr, result) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), org, key, hash, kind, amount, JSON.stringify(result)]);
      await c.commit(); return result;
    } catch (error) { await c.rollback().catch(() => {}); throw error; }
    finally { c.release(); }
  }
  async function credit(c, org, source, amount, expires, ref) {
    const id = randomUUID();
    await c.execute('INSERT INTO billing_credit_grants (id, organization_id, source, reference_id, original_idr, available_idr, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, org, source, ref, amount, amount, expires]);
    return id;
  }
  return {
    // Explicit first monthly activation only; renewals/upgrades need reviewed period handling.
    async startSubscription({ organizationId: org, key, planCode, customTerms, periodStart, periodEnd, approvalReference, expectedPlanVersion, beforeActivate }) {
      if (!['starter','pro','business','custom'].includes(planCode)) throw billingError('PLAN_UNAVAILABLE', 400);
      if (planCode !== 'custom' && customTerms !== undefined) throw billingError('STANDARD_PLAN_OVERRIDE_REJECTED', 400);
      const negotiated = planCode === 'custom' ? subscriptionTerms(planCode, customTerms) : null;
      const start = utc(periodStart), end = utc(periodEnd); reference(approvalReference);
      const beginning = new Date(periodStart), expectedEnd = new Date(beginning);
      const day = beginning.getUTCDate(); expectedEnd.setUTCDate(1); expectedEnd.setUTCMonth(expectedEnd.getUTCMonth() + 1);
      const days = new Date(Date.UTC(expectedEnd.getUTCFullYear(), expectedEnd.getUTCMonth() + 1, 0)).getUTCDate(); expectedEnd.setUTCDate(Math.min(day, days));
      if (expectedEnd.toISOString() !== periodEnd) throw billingError('MONTHLY_PERIOD_REQUIRED', 400);
      if (expectedPlanVersion !== undefined && (!Number.isInteger(expectedPlanVersion) || expectedPlanVersion < 1)) throw billingError('CATALOG_VERSION_INVALID', 400);
      return transaction(org, key, 'subscription', { planCode, customTerms: negotiated, periodStart, periodEnd, approvalReference, ...(expectedPlanVersion === undefined ? {} : { expectedPlanVersion }) }, async (c) => {
        const [[exists]] = await c.execute('SELECT id FROM billing_subscriptions WHERE organization_id = ?', [org]);
        if (exists) throw billingError('SUBSCRIPTION_ALREADY_EXISTS');
        const [[plan]] = await c.execute(`${PLAN_SELECT} WHERE code = ? FOR UPDATE`, [planCode]);
        if (!plan || !plan.isPublic) throw billingError('PLAN_UNAVAILABLE');
        if (expectedPlanVersion !== undefined && plan.version !== expectedPlanVersion) throw billingError('CATALOG_VERSION_CONFLICT');
        const terms = negotiated || catalogTerms(plan);
        if (beforeActivate) await beforeActivate(c, terms);
        const id = randomUUID();
        await c.execute(`INSERT INTO billing_subscriptions (organization_id, id, plan_code, plan_version, status, monthly_price_idr, included_credit_idr, max_divisions, max_members, agents_per_division, whatsapp_enabled, period_start, period_end, approval_reference)
          VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, 4, ?, ?, ?, ?)`, [org, id, planCode, plan.version, terms.price, terms.credit, terms.divisions, terms.members, terms.whatsapp ? 1 : 0, start, end, approvalReference]);
        const grantId = BigInt(terms.credit) > 0n ? await credit(c, org, 'package', terms.credit, end, id) : null;
        return { amount: terms.credit, result: { subscriptionId: id, grantId, planVersion: plan.version, terms, periodStart, periodEnd } };
      });
    },
    async grantCredit({ organizationId: org, key, source, amountIdr, approvalReference }) {
      money(amountIdr); reference(approvalReference);
      if (!['topup', 'adjustment'].includes(source)) throw billingError('CREDIT_SOURCE_INVALID', 400);
      return transaction(org, key, 'credit', { source, amountIdr, approvalReference }, async (c) => {
        const grantId = await credit(c, org, source, amountIdr, null, approvalReference);
        return { amount: amountIdr, result: { grantId, amountIdr } };
      });
    },
    async reserve({ organizationId: org, key, amountIdr, onReserved }) {
      const requested = money(amountIdr);
      return transaction(org, key, 'reserve', { amountIdr }, async (c) => {
        await assertManagedDemoAi(c,org);
        const [[subscription]] = await c.execute("SELECT id FROM billing_subscriptions WHERE organization_id = ? AND status = 'active' AND period_start <= UTC_TIMESTAMP() AND period_end > UTC_TIMESTAMP()", [org]);
        if (!subscription && !await activeDemo(c,org)) throw billingError('ACTIVE_SUBSCRIPTION_REQUIRED', 402);
        const [grants] = await c.execute(`SELECT id, CAST(available_idr AS CHAR) AS available FROM billing_credit_grants
          WHERE organization_id = ? AND available_idr > 0 AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())
          ORDER BY expires_at IS NULL, expires_at, created_at, id FOR UPDATE`, [org]);
        if (grants.reduce((sum, g) => sum + BigInt(g.available), 0n) < requested) throw billingError('INSUFFICIENT_AI_BALANCE', 402);
        let remaining = requested; const allocations = [];
        for (const g of grants) {
          if (remaining === 0n) break;
          const take = BigInt(g.available) < remaining ? BigInt(g.available) : remaining;
          await c.execute('UPDATE billing_credit_grants SET available_idr = available_idr - ?, reserved_idr = reserved_idr + ? WHERE organization_id = ? AND id = ?', [take.toString(), take.toString(), org, g.id]);
          allocations.push({ grantId: g.id, amountIdr: take.toString() }); remaining -= take;
        }
        const holdId = randomUUID();
        await c.execute('INSERT INTO billing_holds (id, organization_id, amount_idr, allocations) VALUES (?, ?, ?, ?)', [holdId, org, amountIdr, JSON.stringify(allocations)]);
        if (onReserved) await onReserved(c, holdId);
        return { amount: amountIdr, result: { holdId, amountIdr } };
      });
    },
    async finishHold({ organizationId: org, key, holdId, actualIdr, release = false, onFinished }) {
      reference(holdId); const actual = money(actualIdr, true);
      if (typeof release !== 'boolean' || (release && actual !== 0n)) throw billingError('HOLD_RELEASE_INVALID', 400);
      return transaction(org, key, release ? 'release' : 'settle', { holdId, actualIdr, release }, async (c) => {
        const [[hold]] = await c.execute('SELECT id, CAST(amount_idr AS CHAR) AS amount, status, allocations FROM billing_holds WHERE organization_id = ? AND id = ? FOR UPDATE', [org, holdId]);
        if (!hold) throw billingError('HOLD_NOT_FOUND', 404);
        if (hold.status !== 'reserved') throw billingError('HOLD_ALREADY_FINISHED');
        if (actual > BigInt(hold.amount)) throw billingError('HOLD_AMOUNT_EXCEEDED');
        let remaining = actual;
        for (const allocation of json(hold.allocations)) {
          const reserved = BigInt(allocation.amountIdr), spent = reserved < remaining ? reserved : remaining;
          await c.execute('UPDATE billing_credit_grants SET reserved_idr = reserved_idr - ?, available_idr = available_idr + ? WHERE organization_id = ? AND id = ?', [reserved.toString(), (reserved - spent).toString(), org, allocation.grantId]);
          remaining -= spent;
        }
        if (remaining !== 0n) throw billingError('HOLD_ALLOCATION_INVALID');
        await c.execute('UPDATE billing_holds SET status = ?, settled_idr = ?, finished_at = UTC_TIMESTAMP() WHERE organization_id = ? AND id = ?', [release ? 'released' : 'settled', actualIdr, org, holdId]);
        if (onFinished) await onFinished(c);
        return { amount: actualIdr, result: { holdId, spentIdr: actualIdr, returnedIdr: (BigInt(hold.amount) - actual).toString() } };
      });
    },
  };
}

export async function readBilling(c, org) {
  organization(org);
  const plans = await readCatalog(c);
  const [[subscription]] = await c.execute(`SELECT id, plan_code, plan_version, status,
    CAST(monthly_price_idr AS CHAR) AS monthly_price_idr, CAST(included_credit_idr AS CHAR) AS included_credit_idr,
    max_divisions, max_members, agents_per_division, whatsapp_enabled,
    DATE_FORMAT(period_start, '%Y-%m-%dT%H:%i:%s.000Z') AS period_start,
    DATE_FORMAT(period_end, '%Y-%m-%dT%H:%i:%s.000Z') AS period_end FROM billing_subscriptions WHERE organization_id = ?`, [org]);
  const [grants] = await c.execute(`SELECT source,
    CAST(COALESCE(SUM(CASE WHEN expires_at IS NULL OR expires_at > UTC_TIMESTAMP() THEN available_idr ELSE 0 END),0) AS CHAR) AS availableIdr,
    CAST(COALESCE(SUM(reserved_idr),0) AS CHAR) AS reservedIdr,
    CAST(COALESCE(SUM(CASE WHEN expires_at <= UTC_TIMESTAMP() THEN available_idr ELSE 0 END),0) AS CHAR) AS expiredIdr
    FROM billing_credit_grants WHERE organization_id = ? GROUP BY source`, [org]);
  const [ledger] = await c.execute('SELECT id, kind, CAST(amount_idr AS CHAR) AS amountIdr, created_at AS createdAt FROM billing_ledger WHERE organization_id = ? ORDER BY created_at DESC, id DESC LIMIT 50', [org]);
  const paidEntitlements=resolveBillingEntitlements(subscription);
  const demo=paidEntitlements.active?await managedDemoForOrganization(c,org):await readDemoStatus(c,org);
  return { currency: 'IDR', plans, subscription: subscription || null, demo,
    subscriptionStatus:demo?.managed?'demo':paidEntitlements.active?'active':demo?(demo.active?'trial':'trial_expired'):subscription?.status || 'none',
    entitlements: demo?.active?demoEntitlements(demo):paidEntitlements, grants, ledger,
    paymentEnabled: false, automaticAiDebitsEnabled: true, whatsappDeliveryEnabled: false, addOnsEnabled: false };
}

export function installBillingRoutes(app, { getPool, requireTenant, paymentAvailable = () => false }) {
  app.get('/api/billing', requireTenant, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.tenantContext.role !== 'owner') return res.status(403).json({ error: 'Hanya pemilik organisasi dapat melihat billing.' });
    if (Object.keys(req.query).length) return res.status(400).json({ error: 'Filter billing tidak valid.' });
    let c;
    try { c = await getPool().getConnection(); res.json({ ...await readBilling(c, req.tenantContext.organizationId), paymentEnabled: paymentAvailable(req.tenantContext.organizationId) }); }
    catch { res.status(503).json({ error: 'Billing belum tersedia. Operator perlu memverifikasi migration 008.' }); }
    finally { c?.release(); }
  });
}
