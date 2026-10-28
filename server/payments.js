import { randomUUID, createHash } from 'node:crypto';
import { billingError } from './billing-policy.js';
import { PLAN_SELECT, catalogTerms } from './billing-catalog.js';
import { createBillingService } from './billing.js';
import { nextMonthlyPeriod } from './billing-administration.js';

const fail = (code, status = 400) => { throw billingError(code, status); };
const parse = v => typeof v === 'string' ? JSON.parse(v) : v;
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const orderId = v => typeof v === 'string' && /^KRY-[a-f0-9-]{36}$/.test(v);
const SELECT = 'SELECT *, CAST(amount_idr AS CHAR) AS amount FROM billing_payment_orders';
export function validatePurchase(body) {
  if (!body || Array.isArray(body) || !uuid(body.requestId)) fail('PAYMENT_FIELDS_INVALID');
  const keys = body.kind === 'subscription' ? ['requestId','kind','planCode','expectedPlanVersion'] : ['requestId','kind','amountIdr'];
  if (Object.keys(body).sort().join() !== keys.sort().join()) fail('PAYMENT_FIELDS_INVALID');
  if (body.kind === 'subscription') {
    if (!['starter','pro','business'].includes(body.planCode) || !Number.isInteger(body.expectedPlanVersion) || body.expectedPlanVersion < 1) fail('PAYMENT_PLAN_INVALID');
  } else if (body.kind !== 'topup' || typeof body.amountIdr !== 'string' || !/^[1-9]\d{3,7}$/.test(body.amountIdr) || BigInt(body.amountIdr) < 10000n || BigInt(body.amountIdr) > 10000000n) fail('PAYMENT_TOPUP_INVALID');
  return body;
}
export function publicOrder(row) {
  return { id: row.id, kind: row.kind, amountIdr: row.amount, status: row.status, mode: row.environment,
    createdAt: row.created_at, paidAt: row.paid_at, providerStatus: row.provider_status,
    ...(row.snap_token && ['creating','pending'].includes(row.status) ? { snapToken: row.snap_token } : {}) };
}
async function lockWallet(c, org) {
  await c.execute('INSERT INTO billing_wallets (organization_id) VALUES (?) ON DUPLICATE KEY UPDATE organization_id = VALUES(organization_id)', [org]);
  const [[row]] = await c.execute("SELECT w.organization_id FROM billing_wallets w JOIN organizations o ON o.id=w.organization_id AND o.status='active' WHERE w.organization_id=? FOR UPDATE", [org]);
  if (!row) fail('PAYMENT_ORGANIZATION_UNAVAILABLE', 403);
}
async function capacity(c, org, terms) {
  const [[usage]] = await c.execute(`SELECT
    (SELECT COUNT(*) FROM workspace_divisions d JOIN workspaces w ON w.id=d.workspace_id AND w.status='active' WHERE d.organization_id=? AND d.status='active') AS divisions,
    (SELECT COUNT(DISTINCT user_id) FROM (SELECT user_id FROM organization_memberships WHERE organization_id=? AND revoked_at IS NULL UNION ALL SELECT wm.user_id FROM workspace_memberships wm JOIN workspaces w ON w.id=wm.workspace_id AND w.status='active' WHERE w.organization_id=? AND wm.revoked_at IS NULL) AS members) AS members`, [org,org,org]);
  return Number(usage.divisions) <= terms.divisions && Number(usage.members) <= terms.members;
}
export function createPaymentService({ getPool, provider, now = () => new Date() }) {
  function scope(org) { if (provider.allowedOrganizationId && provider.allowedOrganizationId !== org) fail('PAYMENT_SANDBOX_TENANT_REQUIRED',403); }
  async function tx(action) {
    const c = await getPool().getConnection();
    try { await c.beginTransaction(); const result = await action(c); await c.commit(); return result; }
    catch (e) { await c.rollback().catch(() => {}); throw e; } finally { c.release(); }
  }
  async function read(org, id) {
    if (!orderId(id)) fail('PAYMENT_NOT_FOUND', 404);
    const c = await getPool().getConnection();
    try {
      const [[row]] = await c.execute(`${SELECT} WHERE organization_id=? AND id=?`, [org,id]);
      if (!row) fail('PAYMENT_NOT_FOUND',404);
      return row;
    } finally { c.release(); }
  }
  async function create(org, user, input) {
    const body = validatePurchase(input);
    if (!provider.enabled) fail('PAYMENT_NOT_CONFIGURED',503);
    scope(org);
    const hash = createHash('sha256').update(JSON.stringify(body.kind === 'subscription'
      ? [body.kind,body.planCode,body.expectedPlanVersion,provider.mode] : [body.kind,body.amountIdr,provider.mode])).digest('hex');
    const row = await tx(async c => {
      await lockWallet(c,org);
      const [[previous]] = await c.execute(`${SELECT} WHERE organization_id=? AND request_id=?`,[org,body.requestId]);
      if (previous) {
        if (previous.request_hash !== hash) fail('PAYMENT_REQUEST_CONFLICT',409);
        return { ...previous, existing: true };
      }
      let snapshot, amount;
      if (body.kind === 'subscription') {
        const [[existing]] = await c.execute('SELECT id FROM billing_subscriptions WHERE organization_id=?',[org]);
        if (existing) fail('PAYMENT_FIRST_SUBSCRIPTION_ONLY',409);
        const [[pending]] = await c.execute("SELECT id FROM billing_payment_orders WHERE organization_id=? AND kind='subscription' AND status IN ('creating','pending','needs_review') LIMIT 1",[org]);
        if (pending) fail('PAYMENT_SUBSCRIPTION_PENDING',409);
        const [[plan]] = await c.execute(`${PLAN_SELECT} WHERE code=? FOR UPDATE`,[body.planCode]);
        if (!plan || plan.version !== body.expectedPlanVersion) fail('PAYMENT_PLAN_CHANGED',409);
        const terms = catalogTerms(plan);
        if (!await capacity(c,org,terms)) fail('PAYMENT_CAPACITY_EXCEEDED',409);
        snapshot = { planCode: plan.code, planVersion: plan.version, terms }; amount = terms.price;
      } else {
        const [[active]] = await c.execute("SELECT id FROM billing_subscriptions WHERE organization_id=? AND status='active' AND period_start<=UTC_TIMESTAMP() AND period_end>UTC_TIMESTAMP()",[org]);
        if (!active) fail('PAYMENT_ACTIVE_SUBSCRIPTION_REQUIRED',409);
        snapshot = { amountIdr: body.amountIdr }; amount = body.amountIdr;
      }
      // Midtrans IDR uses integral rupiah. Enforce its checkout range server-side.
      if (!/^[1-9]\d*$/.test(amount) || BigInt(amount)>999999999n) fail('PAYMENT_AMOUNT_UNSUPPORTED');
      const id = `KRY-${randomUUID()}`;
      await c.execute('INSERT INTO billing_payment_orders(id,organization_id,created_by_user_id,request_id,request_hash,environment,kind,amount_idr,purchase_snapshot) VALUES (?,?,?,?,?,?,?,?,?)',
        [id,org,user,body.requestId,hash,provider.mode,body.kind,amount,JSON.stringify(snapshot)]);
      return { id, organization_id: org, environment: provider.mode, kind: body.kind, amount, status: 'creating', planCode: snapshot.planCode };
    });
    // A timed-out call may have created a provider order. Never blindly re-create it.
    if (!row.existing) {
      const token = await provider.checkout(row);
      await tx(c => c.execute("UPDATE billing_payment_orders SET snap_token=?,status=CASE WHEN status='creating' THEN 'pending' ELSE status END WHERE id=?",[token,row.id]));
      return publicOrder(await read(org,row.id));
    }
    return publicOrder(row);
  }
  async function reconcile(id) {
    if (!provider.enabled) fail('PAYMENT_NOT_CONFIGURED',503);
    if (!orderId(id)) fail('PAYMENT_NOT_FOUND',404);
    // Authenticate the provider status independently; browser callbacks are never evidence.
    const status = await provider.status(id);
    return tx(async c => {
      const [[hint]] = await c.execute(`${SELECT} WHERE id=?`,[id]);
      if (!hint) fail('PAYMENT_NOT_FOUND',404);
      scope(hint.organization_id);
      await lockWallet(c,hint.organization_id);
      const [[row]] = await c.execute(`${SELECT} WHERE id=? FOR UPDATE`,[id]);
      if (row.environment !== provider.mode || status.order_id !== row.id || status.currency !== 'IDR' ||
        typeof status.gross_amount !== 'string' || !/^\d+(\.00)?$/.test(status.gross_amount) || BigInt(status.gross_amount.split('.')[0]) !== BigInt(row.amount) ||
        typeof status.transaction_id !== 'string' || !status.transaction_id || status.transaction_id.length>100 ||
        (row.provider_transaction_id && row.provider_transaction_id !== status.transaction_id)) fail('PAYMENT_VERIFICATION_FAILED',409);
      const state = status.transaction_status;
      if (!['settlement','capture','pending','expire','cancel','deny','failure','refund','partial_refund','chargeback','partial_chargeback'].includes(state)) fail('PAYMENT_STATUS_UNSUPPORTED',409);
      // Refund/chargeback handling is manual; do not destroy already-used balance.
      if (row.fulfillment) {
        await c.execute('UPDATE billing_payment_orders SET provider_status=? WHERE id=?',[state,id]);
        return publicOrder({ ...row, provider_status: state });
      }
      const paid = (state==='settlement' && (!status.fraud_status || status.fraud_status==='accept')) || (state==='capture' && status.fraud_status==='accept');
      // A stale pending response must not hide an already-confirmed payment
      // awaiting manual review (e.g. a competing admin activation).
      if (row.paid_at && !paid) return publicOrder(row);
      let next = paid ? 'paid' : ({expire:'expired',cancel:'cancelled',deny:'denied',failure:'denied',refund:'needs_review',partial_refund:'needs_review',chargeback:'needs_review',partial_chargeback:'needs_review'}[state] || 'pending');
      let fulfillment = null;
      if (paid) {
        const org = row.organization_id, snapshot = parse(row.purchase_snapshot);
        if (row.kind==='topup') {
          const adapter = {execute:(...a)=>c.execute(...a),beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}};
          fulfillment = await createBillingService(()=>({getConnection:async()=>adapter})).grantCredit({ organizationId:org,key:`midtrans:${id}`,source:'topup',amountIdr:row.amount,approvalReference:id });
        } else {
          const [[existing]] = await c.execute('SELECT id FROM billing_subscriptions WHERE organization_id=?',[org]);
          if (existing || !await capacity(c,org,snapshot.terms)) next='needs_review';
          else {
            const start=now(); start.setUTCMilliseconds(0); const periodStart=start.toISOString(), periodEnd=nextMonthlyPeriod(periodStart);
            const sqlDate=s=>s.slice(0,19).replace('T',' '), subId=randomUUID(), grantId=BigInt(snapshot.terms.credit)>0n?randomUUID():null, t=snapshot.terms;
            await c.execute(`INSERT INTO billing_subscriptions(organization_id,id,plan_code,plan_version,status,monthly_price_idr,included_credit_idr,max_divisions,max_members,agents_per_division,whatsapp_enabled,period_start,period_end,approval_reference)
              VALUES (?,?,?,?,'active',?,?,?,?,4,?,?,?,?)`,[org,subId,snapshot.planCode,snapshot.planVersion,t.price,t.credit,t.divisions,t.members,t.whatsapp?1:0,sqlDate(periodStart),sqlDate(periodEnd),id]);
            if(grantId) await c.execute("INSERT INTO billing_credit_grants(id,organization_id,source,reference_id,original_idr,available_idr,expires_at) VALUES (?,?,'package',?,?,?,?)",[grantId,org,subId,t.credit,t.credit,sqlDate(periodEnd)]);
            fulfillment={subscriptionId:subId,grantId,terms:t,periodStart,periodEnd};
            await c.execute("INSERT INTO billing_ledger(id,organization_id,idempotency_key,request_hash,kind,amount_idr,result) VALUES (?,?,?,?,'subscription',?,?)",[randomUUID(),org,`midtrans:${id}`,row.request_hash,t.credit,JSON.stringify(fulfillment)]);
          }
        }
      }
      await c.execute('UPDATE billing_payment_orders SET status=?,provider_status=?,provider_transaction_id=?,fulfillment=?,paid_at=CASE WHEN ? THEN COALESCE(paid_at,UTC_TIMESTAMP()) ELSE paid_at END WHERE id=?',
        [next,state,status.transaction_id,fulfillment?JSON.stringify(fulfillment):null,paid?1:0,id]);
      return publicOrder({...row,status:next,provider_status:state,fulfillment});
    });
  }
  return {create,read,reconcile,async list(org) {
    const c=await getPool().getConnection();
    try {const [rows]=await c.execute(`${SELECT} WHERE organization_id=? ORDER BY created_at DESC,id DESC LIMIT 30`,[org]);return rows.map(publicOrder);}finally{c.release();}
  }};
}

export function installPaymentRoutes(app,{getPool,requireTenant,provider,appOrigin,trackHandler=fn=>fn,service=createPaymentService({getPool,provider})}) {
  const safe = fn => trackHandler(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try {await fn(req,res);}catch(e){const allowed=[400,401,403,404,409].includes(e.status);res.status(allowed?e.status:503).json({code:allowed?e.code:'PAYMENT_UNAVAILABLE',error:'Pembayaran belum dapat diproses. Periksa riwayat transaksi sebelum mencoba lagi.'});}
  });
  const owner=(req,res,next)=>req.tenantContext.role==='owner'?next():res.status(403).json({code:'PAYMENT_OWNER_REQUIRED'});
  const origin=(req,res,next)=>appOrigin && req.get('origin')===appOrigin && req.is('application/json')?next():res.status(403).json({code:'PAYMENT_ORIGIN_REQUIRED'});
  const noQuery=(req,res,next)=>Object.keys(req.query).length?res.status(400).json({code:'PAYMENT_FILTER_INVALID'}):next();
  app.get('/api/payments',requireTenant,owner,noQuery,safe(async(req,res)=>res.json({config:{...provider.publicConfig(),enabled:provider.enabled && (!provider.allowedOrganizationId || provider.allowedOrganizationId===req.tenantContext.organizationId)},orders:await service.list(req.tenantContext.organizationId)})));
  app.post('/api/payments/checkout',requireTenant,owner,origin,noQuery,safe(async(req,res)=>res.status(201).json(await service.create(req.tenantContext.organizationId,req.authPrincipal.userId,req.body))));
  app.post('/api/payments/:id/check',requireTenant,owner,origin,noQuery,safe(async(req,res)=>{
    if (!req.body || Object.keys(req.body).length) fail('PAYMENT_FIELDS_INVALID');
    const row=await service.read(req.tenantContext.organizationId,req.params.id);
    if(row.environment!==provider.mode) fail('PAYMENT_ENVIRONMENT_MISMATCH',409);
    res.json(await service.reconcile(row.id));
  }));
  // Midtrans sends this server-to-server: no login/Origin, but mandatory signature
  // AND independent authenticated status verification. No customer identity accepted.
  app.post('/api/payments/midtrans/notification',safe(async(req,res)=>{
    if (!provider.verify(req.body)) return res.status(403).json({code:'PAYMENT_SIGNATURE_INVALID'});
    await service.reconcile(req.body.order_id);res.json({received:true});
  }));
}
