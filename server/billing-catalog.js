import { randomUUID } from 'node:crypto';
import { money, billingError } from './billing-policy.js';
import { readCookie, resolveSession } from './auth/sessions.js';
import { authenticationEnabled } from './auth/config.js';

export const PLAN_SELECT = `SELECT code, name, version, CAST(monthly_price_idr AS CHAR) AS monthlyPriceIdr,
  CAST(included_credit_idr AS CHAR) AS includedCreditIdr, max_divisions AS maxDivisions,
  max_members AS maxMembers, agents_per_division AS agentsPerDivision,
  whatsapp_enabled AS whatsapp, quote_required AS quoteRequired, is_public AS isPublic FROM billing_plans`;
export async function readCatalog(c, { admin = false } = {}) {
  const [rows] = await c.execute(`${PLAN_SELECT}${admin ? '' : ' WHERE is_public = 1'} ORDER BY monthly_price_idr IS NULL, monthly_price_idr, code`);
  return rows;
}
export function catalogTerms(plan) {
  if (!plan || !plan.isPublic || plan.quoteRequired || plan.agentsPerDivision !== 4) throw billingError('PLAN_UNAVAILABLE', 409);
  validatePlanUpdate(plan.code, { expectedVersion: plan.version, name: plan.name, monthlyPriceIdr: plan.monthlyPriceIdr,
    includedCreditIdr: plan.includedCreditIdr, maxDivisions: plan.maxDivisions, maxMembers: plan.maxMembers,
    whatsapp: Boolean(plan.whatsapp), isPublic: Boolean(plan.isPublic), reason: 'Catalog validation' });
  return { price: plan.monthlyPriceIdr, credit: plan.includedCreditIdr, divisions: plan.maxDivisions,
    members: plan.maxMembers, whatsapp: Boolean(plan.whatsapp), agentsPerDivision: 4 };
}
export function validatePlanUpdate(code, body) {
  const fields = ['expectedVersion','name','monthlyPriceIdr','includedCreditIdr','maxDivisions','maxMembers','whatsapp','isPublic','reason'];
  if (!['starter','pro','business','custom'].includes(code) || !body || Array.isArray(body) || Object.keys(body).sort().join(',') !== fields.sort().join(',')) throw billingError('CATALOG_FIELDS_INVALID', 400);
  if (!Number.isInteger(body.expectedVersion) || body.expectedVersion < 1 || body.expectedVersion >= 4294967295 ||
    typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 60 || /[\x00-\x1f]/.test(body.name) ||
    typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.trim().length > 500 ||
    typeof body.whatsapp !== 'boolean' || typeof body.isPublic !== 'boolean') throw billingError('CATALOG_VALUES_INVALID', 400);
  if (code === 'custom') {
    if ([body.monthlyPriceIdr,body.includedCreditIdr,body.maxDivisions,body.maxMembers].some((v) => v !== null) || body.whatsapp) throw billingError('CUSTOM_QUOTE_REQUIRED', 400);
  } else {
    money(body.monthlyPriceIdr); money(body.includedCreditIdr, true);
    if (!Number.isInteger(body.maxDivisions) || body.maxDivisions < 1 || body.maxDivisions > 8 || !Number.isInteger(body.maxMembers) || body.maxMembers < 1 || body.maxMembers > 65535) throw billingError('CATALOG_LIMITS_INVALID', 400);
  }
  return { ...body, name: body.name.trim(), reason: body.reason.trim() };
}
export async function requirePlatformAdmin(c, req) {
  const principal = await resolveSession(c, readCookie(req.headers.cookie, 'vo_session'));
  if (!principal) throw billingError('SESSION_REQUIRED', 401);
  if (principal.sharedDemo) throw billingError('PLATFORM_ADMIN_REQUIRED', 403);
  // No tenant role, email, browser claim, or shared access code grants platform rights.
  const [[grant]] = await c.execute('SELECT user_id FROM platform_admins WHERE user_id = ? AND revoked_at IS NULL FOR UPDATE', [principal.userId]);
  if (!grant) throw billingError('PLATFORM_ADMIN_REQUIRED', 403);
  return principal;
}
export async function updateCatalogPlan(c, principal, code, input) {
  const body = validatePlanUpdate(code, input);
  const [[previous]] = await c.execute(`${PLAN_SELECT} WHERE code = ? FOR UPDATE`, [code]);
  if (!previous) throw billingError('PLAN_NOT_FOUND', 404);
  if (previous.version !== body.expectedVersion) throw billingError('CATALOG_VERSION_CONFLICT', 409);
  const next = { code, name: body.name, version: previous.version + 1, monthlyPriceIdr: body.monthlyPriceIdr,
    includedCreditIdr: body.includedCreditIdr, maxDivisions: body.maxDivisions, maxMembers: body.maxMembers,
    agentsPerDivision: 4, whatsapp: body.whatsapp ? 1 : 0, quoteRequired: code === 'custom' ? 1 : 0, isPublic: body.isPublic ? 1 : 0 };
  const [result] = await c.execute(`UPDATE billing_plans SET name = ?, version = ?, monthly_price_idr = ?, included_credit_idr = ?,
    max_divisions = ?, max_members = ?, whatsapp_enabled = ?, is_public = ? WHERE code = ? AND version = ?`,
    [next.name,next.version,next.monthlyPriceIdr,next.includedCreditIdr,next.maxDivisions,next.maxMembers,next.whatsapp,next.isPublic,code,body.expectedVersion]);
  if (result.affectedRows !== 1) throw billingError('CATALOG_VERSION_CONFLICT', 409);
  await c.execute('INSERT INTO billing_catalog_audit (id, actor_user_id, plan_code, plan_version, before_snapshot, after_snapshot, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(),principal.userId,code,next.version,JSON.stringify(previous),JSON.stringify(next),body.reason]);
  return next;
}
export function installCatalogRoutes(app, { getPool, env = process.env }) {
  app.get('/api/plans', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store'); let c;
    try { c = await getPool().getConnection(); res.json({ plans: await readCatalog(c), currency: 'IDR' }); }
    catch { res.status(503).json({ error: 'Katalog paket belum tersedia.' }); }
    finally { c?.release(); }
  });
  async function admin(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (!authenticationEnabled(env)) return res.status(503).json({ error: 'Autentikasi belum aktif.' });
    if (Object.keys(req.query).length) return res.status(400).json({ error: 'Filter tidak valid.' });
    const write = req.method === 'PUT';
    const origin = env.APP_ORIGIN || (env.NODE_ENV === 'production' ? null : 'http://localhost:5173');
    if (write && (!origin || req.headers.origin !== origin || !req.is('application/json'))) return res.status(403).json({ error: 'Origin atau format permintaan tidak valid.' });
    let c;
    try {
      c = await getPool().getConnection(); await c.beginTransaction();
      const principal = await requirePlatformAdmin(c, req);
      let result;
      if (req.path === '/api/platform/me') result = { platformAdmin: true };
      else if (write) result = { plan: await updateCatalogPlan(c, principal, req.params.code, req.body) };
      else {
        const [audit] = await c.execute('SELECT id, actor_user_id AS actorUserId, plan_code AS planCode, plan_version AS planVersion, before_snapshot AS beforeSnapshot, after_snapshot AS afterSnapshot, reason, created_at AS createdAt FROM billing_catalog_audit ORDER BY created_at DESC, id DESC LIMIT 50');
        result = { plans: await readCatalog(c, { admin: true }), audit };
      }
      await c.commit(); res.json(result);
    } catch (error) {
      await c?.rollback().catch(() => {});
      const safe = [400,401,403,404,409].includes(error.status);
      res.status(safe ? error.status : 503).json({ error: safe ? error.code : 'Administrasi katalog belum tersedia. Periksa migration 009.', code: safe ? error.code : 'CATALOG_UNAVAILABLE' });
    } finally { c?.release(); }
  }
  app.get('/api/platform/me', admin);
  app.get('/api/admin/billing/plans', admin);
  app.put('/api/admin/billing/plans/:code', admin);
}
