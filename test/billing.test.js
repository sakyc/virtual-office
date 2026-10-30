import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { createBillingService, installBillingRoutes } from '../server/billing.js';
import { subscriptionTerms, money, resolveBillingEntitlements } from '../server/billing-policy.js';
import { BILLING_CONTRACT, validateBillingSchema } from '../server/migrations/billing-contract.js';
import { inspectMigrationDirectory } from '../server/migrations/status.js';
import { publicBillingPlans } from '../shared/billing-plans.js';

function fixture() {
  let state = { wallets: new Set(), plans: publicBillingPlans.map((p) => ({ ...p, version: 1, isPublic: 1 })), grants: [], holds: [], ledger: [], subscriptions: [], fail: false }, queue = Promise.resolve();
  const calls = [];
  const pool = { async getConnection() {
    let snapshot, unlock;
    return {
      async beginTransaction() { const before = queue; queue = new Promise((r) => { unlock = r; }); await before; snapshot = structuredClone(state); },
      async commit() { snapshot = null; }, async rollback() { if (snapshot) state = snapshot; }, release() { unlock(); },
      async execute(sql, v = []) {
        if(sql.includes('FROM managed_demo_accounts'))return [[]];
        calls.push({ sql, v });
        if (sql.startsWith('INSERT INTO billing_wallets')) { state.wallets.add(v[0]); return [{}]; }
        if (sql.startsWith('SELECT w.organization_id')) return [[{ organization_id: v[0] }]];
        if (sql.startsWith('SELECT request_hash')) return [state.ledger.filter((r) => r.org === v[0] && r.key === v[1])];
        if (sql.startsWith('INSERT INTO billing_ledger')) {
          if (state.fail) throw new Error('ledger failure');
          state.ledger.push({ org: v[1], key: v[2], request_hash: v[3], kind: v[4], result: v[6] }); return [{}];
        }
        if (sql.startsWith('SELECT id FROM billing_subscriptions')) return [state.subscriptions.filter((r) => r.org === v[0])];
        if (sql.includes('FROM billing_plans')) return [state.plans.filter((p) => p.code === v[0])];
        if (sql.startsWith('INSERT INTO billing_subscriptions')) { state.subscriptions.push({ org: v[0], id: v[1], price: v[4], version: v[3] }); return [{}]; }
        if (sql.startsWith('INSERT INTO billing_credit_grants')) {
          if (state.grants.some((g) => g.org === v[1] && g.source === v[2] && g.ref === v[3])) throw Object.assign(new Error(), { code: 'ER_DUP_ENTRY' });
          state.grants.push({ id: v[0], org: v[1], source: v[2], ref: v[3], available: v[5], reserved: '0', expires: v[6] }); return [{}];
        }
        if (sql.startsWith('SELECT id, CAST(available_idr')) return [state.grants.filter((g) => g.org === v[0] && BigInt(g.available) > 0n && (!g.expires || Date.parse(g.expires+'Z') > Date.now())).sort((a,b) => Number(!a.expires) - Number(!b.expires))];
        if (sql.startsWith('UPDATE billing_credit_grants')) {
          const grant = state.grants.find((g) => g.org === v[2] && g.id === v[3]); assert(grant);
          const reserve = sql.includes('available_idr = available_idr -');
          grant.available = (BigInt(grant.available) + (reserve ? -BigInt(v[0]) : BigInt(v[1]))).toString();
          grant.reserved = (BigInt(grant.reserved) + (reserve ? BigInt(v[1]) : -BigInt(v[0]))).toString();
          assert(BigInt(grant.available) >= 0n && BigInt(grant.reserved) >= 0n); return [{}];
        }
        if (sql.startsWith('INSERT INTO billing_holds')) { state.holds.push({ id: v[0], org: v[1], amount: v[2], allocations: v[3], status: 'reserved' }); return [{}]; }
        if (sql.startsWith('SELECT id, CAST(amount_idr')) return [state.holds.filter((h) => h.org === v[0] && h.id === v[1])];
        if (sql.startsWith('UPDATE billing_holds')) { const h = state.holds.find((h) => h.org === v[2] && h.id === v[3]); h.status = v[0]; h.settled = v[1]; return [{}]; }
        throw new Error('Unexpected SQL: '+sql);
      },
    };
  } };
  return { service: createBillingService(() => pool), state: () => state, calls };
}
const activation = (org = 1) => {
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0,0,0,0);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth()+1);
  return { organizationId: org, key: 'subscription', planCode: 'starter', periodStart: start.toISOString(), periodEnd: end.toISOString(), approvalReference: 'operator-reviewed' };
};

test('approved packages and negotiated Custom have explicit limits and exact money', () => {
  assert.deepEqual(subscriptionTerms('starter'), { price: '149000', credit: '50000', divisions: 1, members: 2, whatsapp: false, agentsPerDivision: 4 });
  assert.equal(subscriptionTerms('pro').whatsapp, true); assert.equal(subscriptionTerms('business').divisions*4, 32);
  assert.throws(() => subscriptionTerms('custom'), { code: 'CUSTOM_QUOTE_REQUIRED' });
  const custom = { price: '1000000', credit: '200000', divisions: 7, members: 25, whatsapp: true };
  assert.equal(subscriptionTerms('custom', custom).members, 25);
  assert.throws(() => subscriptionTerms('custom', { ...custom, divisions: 9 }), { code: 'CUSTOM_LIMITS_INVALID' });
  assert.throws(() => subscriptionTerms('starter', custom), { code: 'STANDARD_PLAN_OVERRIDE_REJECTED' });
  for (const invalid of ['-1','1.5','NaN','9007199254740992',1,null]) assert.throws(() => money(invalid));
});

test('entitlements fail closed without an active period; Whatsapp is a package right, not live delivery', () => {
  const now = Date.now(), row = { status: 'active', period_start: new Date(now-1000).toISOString(), period_end: new Date(now+1000).toISOString(), max_divisions: 3, max_members: 6, whatsapp_enabled: 1 };
  assert.equal(resolveBillingEntitlements(row, now).whatsapp, true);
  for (const s of [null, {...row,status:'cancelled'}, {...row,status:'past_due'}, {...row,period_end:new Date(now).toISOString()}, {...row,period_start:new Date(now+1).toISOString()}]) assert.equal(resolveBillingEntitlements(s,now).canUseAi,false);
});

test('subscription snapshots/grants are atomic, monthly, idempotent and never auto-assigned', async () => {
  const f = fixture(); assert.equal(f.state().subscriptions.length,0);
  const input = activation(), first = await f.service.startSubscription(input);
  assert.deepEqual(await f.service.startSubscription(input), first);
  assert.equal(f.state().grants.length,1); assert.equal(f.state().grants[0].available,'50000'); assert.equal(f.state().subscriptions[0].price,'149000');
  await assert.rejects(f.service.startSubscription({...input,key:'another'}),{code:'SUBSCRIPTION_ALREADY_EXISTS'});
  await assert.rejects(f.service.startSubscription({...input,planCode:'pro'}),{code:'BILLING_IDEMPOTENCY_CONFLICT'});
  await assert.rejects(f.service.startSubscription({...activation(2),periodEnd:'2030-01-01T00:00:00.000Z'}),{code:'MONTHLY_PERIOD_REQUIRED'});
});

test('package credit spends first; settlement debits actual usage and returns unused reservation', async () => {
  const f = fixture(); await f.service.startSubscription(activation());
  await f.service.grantCredit({ organizationId:1,key:'paid-topup',source:'topup',amountIdr:'100000',approvalReference:'payment-verified-1' });
  const held = await f.service.reserve({organizationId:1,key:'hold-1',amountIdr:'60000'});
  assert.deepEqual(f.state().grants.map((g)=>g.available),['0','90000']);
  const result = await f.service.finishHold({organizationId:1,key:'settle-1',holdId:held.holdId,actualIdr:'42000'});
  assert.equal(result.returnedIdr,'18000'); assert.deepEqual(f.state().grants.map((g)=>g.available),['8000','100000']);
  assert(f.state().grants.every((g)=>g.reserved==='0'));
  await assert.rejects(f.service.finishHold({organizationId:1,key:'settle-again',holdId:held.holdId,actualIdr:'42000'}),{code:'HOLD_ALREADY_FINISHED'});
});

test('activation snapshots database catalog version; later edits never change past subscriptions or retry results', async () => {
  const f = fixture(), input = activation();
  const starter = f.state().plans.find((p) => p.code === 'starter');
  starter.monthlyPriceIdr = '175000'; starter.includedCreditIdr = '60000'; starter.version = 2;
  const first = await f.service.startSubscription(input);
  assert.equal(first.terms.price, '175000'); assert.equal(first.planVersion, 2);
  starter.monthlyPriceIdr = '190000'; starter.version = 3;
  assert.deepEqual(await f.service.startSubscription(input), first);
  assert.equal(f.state().subscriptions[0].price, '175000'); assert.equal(f.state().subscriptions[0].version, 2);
  const second = await f.service.startSubscription(activation(2));
  assert.equal(second.terms.price, '190000'); assert.equal(second.planVersion, 3);
  starter.isPublic = 0;
  await assert.rejects(f.service.startSubscription(activation(3)), { code: 'PLAN_UNAVAILABLE' });
});

test('concurrent reservations serialize and cannot overdraw; failed operations roll back', async () => {
  const f = fixture(); await f.service.startSubscription(activation());
  const results = await Promise.allSettled(['a','b'].map(key=>f.service.reserve({organizationId:1,key,amountIdr:'40000'})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1); assert.equal(f.state().grants[0].available,'10000');
  f.state().fail = true; const before = structuredClone(f.state().grants);
  await assert.rejects(f.service.reserve({organizationId:1,key:'will-fail',amountIdr:'1000'}));
  assert.deepEqual(f.state().grants,before);
});

test('holds cannot cross organizations, exceed reserved amount, or be released twice', async () => {
  const f = fixture(); await f.service.startSubscription(activation());
  const input = {organizationId:1,key:'reserve',amountIdr:'10000'};
  const h = await f.service.reserve(input); assert.deepEqual(await f.service.reserve(input),h);
  await assert.rejects(f.service.finishHold({organizationId:2,key:'cross',holdId:h.holdId,actualIdr:'100'}),{code:'HOLD_NOT_FOUND'});
  await assert.rejects(f.service.finishHold({organizationId:1,key:'over',holdId:h.holdId,actualIdr:'10001'}),{code:'HOLD_AMOUNT_EXCEEDED'});
  const released = await f.service.finishHold({organizationId:1,key:'release',holdId:h.holdId,actualIdr:'0',release:true});
  assert.equal(released.returnedIdr,'10000'); assert.equal(f.state().grants[0].available,'50000');
  assert.deepEqual(await f.service.finishHold({organizationId:1,key:'release',holdId:h.holdId,actualIdr:'0',release:true}),released);
  await assert.rejects(f.service.reserve({organizationId:2,key:'no-sub',amountIdr:'1'}),{code:'ACTIVE_SUBSCRIPTION_REQUIRED'});
});

test('grant deduplication and expired package preserve topups without allowing spend on inactive subscriptions', async () => {
  const f = fixture(); await f.service.startSubscription(activation());
  const input = {organizationId:1,key:'topup',source:'topup',amountIdr:'100',approvalReference:'payment-1'};
  assert.deepEqual(await f.service.grantCredit(input),await f.service.grantCredit(input));
  await assert.rejects(f.service.grantCredit({...input,key:'different'}));
  f.state().grants[0].expires='2020-01-01 00:00:00';
  await assert.rejects(f.service.reserve({organizationId:1,key:'expired',amountIdr:'101'}),{code:'INSUFFICIENT_AI_BALANCE'});
  const h=await f.service.reserve({organizationId:1,key:'topup-only',amountIdr:'100'});
  assert.equal(h.amountIdr,'100'); assert.equal(f.state().grants[1].expires,null);
});

test('008 is registered, expand-only, seeds four plans and does not assign existing customers', async () => {
  const report=await inspectMigrationDirectory(new URL('../migrations',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
  assert.deepEqual(report.diagnostics,[]); const m=report.migrations.find(m=>m.id==='008_billing_foundation');
  assert.match(m.checksum,/^[a-f0-9]{64}$/); assert.doesNotMatch(m.source,/^\s*(?:ALTER|DROP|DELETE|UPDATE)\b/im);
  assert.doesNotMatch(m.source,/INSERT INTO billing_(?:subscriptions|wallets|credit_grants|holds|ledger)/);
  const missing=await validateBillingSchema({execute:async()=>[[]]}); assert(missing.some(d=>d.table==='billing_ledger'&&d.reason==='column_missing'));
  const valid={execute:async(sql,[table])=>{
    const s=BILLING_CONTRACT[table];
    if(sql.includes('information_schema.columns')) return [s.columns.map(name=>({name,nullable:(s.nullable||[]).includes(name)?'YES':'NO',type:s.enums?.[name]||(name.endsWith('_idr')||name==='organization_id'?'bigint unsigned':'varchar(191)')}))];
    if(sql.includes('information_schema.statistics')) return [Object.entries(s.indexes).flatMap(([name,cols])=>cols.map(columnName=>({name,columnName,nonUnique:name==='PRIMARY'||name.startsWith('uq_')?0:1})))];
    if(sql.includes('information_schema.table_constraints')) return [(s.checks||[]).map(name=>({name}))];
    return [Object.entries(s.keys).map(([name,[columnName,targetTable,targetColumn]])=>({name,columnName,targetTable,targetColumn}))];
  }}; assert.deepEqual(await validateBillingSchema(valid),[]);
});

test('billing endpoint is owner-only, rejects injected scopes, and exposes no funding/write routes', async(t)=>{
  const app=express();let role='owner',authenticated=true,reads=0;
  installBillingRoutes(app,{requireTenant:(req,res,next)=>{if(!authenticated)return res.sendStatus(401);req.tenantContext={organizationId:1,role};next();},getPool:()=>({getConnection:async()=>({release(){},execute:async(sql,v)=>{reads++;if(!sql.includes('FROM billing_plans'))assert.deepEqual(v,[1]);return [[]];}})})});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
  const url=`http://127.0.0.1:${server.address().port}/api/billing`;
  assert.equal((await fetch(url+'?organizationId=99')).status,400);assert.equal(reads,0);
  for(const r of ['member','admin','viewer','platform_admin']){role=r;assert.equal((await fetch(url)).status,403);}
  role='owner';const response=await fetch(url);assert.equal(response.status,200);const data=await response.json();assert.equal(data.subscription,null);assert.equal(data.paymentEnabled,false);assert.equal(data.entitlements.canUseAi,false);
  assert.equal((await fetch(url,{method:'POST'})).status,404);authenticated=false;assert.equal((await fetch(url)).status,401);
});
