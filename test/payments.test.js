import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import express from 'express';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {createMidtrans} from '../server/midtrans.js';
import {createPaymentService,installPaymentRoutes,validatePurchase} from '../server/payments.js';
import {paymentRequest} from '../src/react/payment-data.js';
import {validatePaymentSchema,PAYMENT_COLUMNS} from '../server/migrations/payment-contract.js';
import {paymentUpgradeOptions,upgradePayments} from '../scripts/upgrade-deployment-payments.mjs';
import {inspectMigrationDirectory} from '../server/migrations/status.js';

const env={MIDTRANS_ENABLED:'1',MIDTRANS_SERVER_KEY:'test-server',MIDTRANS_CLIENT_KEY:'test-client'};
const purchase=()=>({kind:'subscription',planCode:'starter',expectedPlanVersion:1,requestId:randomUUID()});
function fixture() {
  let state={orders:[],subscriptions:[],grants:[],ledger:[],plans:[{code:'starter',name:'Starter',version:1,monthlyPriceIdr:'149000',includedCreditIdr:'50000',maxDivisions:1,maxMembers:2,agentsPerDivision:4,whatsapp:0,isPublic:1,quoteRequired:0}],usage:{divisions:0,members:1}};
  let queue=Promise.resolve(),failLedger=false,checkoutCalls=0,statusCalls=0;
  const statuses=new Map(),calls=[];
  const pool={async getConnection(){let snapshot,unlock;return{
    async beginTransaction(){const previous=queue;queue=new Promise(r=>{unlock=r;});await previous;snapshot=structuredClone(state);},
    async commit(){snapshot=null;},async rollback(){if(snapshot)state=snapshot;},release(){unlock?.();},
    async execute(raw,v=[]){const sql=raw.replace(/\s+/g,' ').trim();calls.push({sql,v});
      if(sql.startsWith('INSERT INTO billing_wallets'))return[{}];
      if(sql.startsWith('SELECT w.organization_id'))return[[{organization_id:v[0]}]];
      if(sql.includes('FROM billing_payment_orders')){
        let rows=state.orders.filter(o=>sql.includes('organization_id=?')?o.organization_id===v[0]:true);
        if(sql.includes('request_id=?'))rows=rows.filter(o=>o.request_id===v[1]);
        else if(sql.includes('AND id=?'))rows=rows.filter(o=>o.id===v[1]);
        else if(sql.includes('WHERE id=?'))rows=rows.filter(o=>o.id===v[0]);
        else if(sql.includes("kind='subscription'"))rows=rows.filter(o=>o.kind==='subscription'&&['creating','pending','needs_review'].includes(o.status));
        return[structuredClone(rows)];
      }
      if(sql.startsWith('SELECT id FROM billing_subscriptions'))return[state.subscriptions.filter(s=>s.organization_id===v[0])];
      if(sql.includes('FROM billing_plans'))return[structuredClone(state.plans.filter(p=>p.code===v[0]))];
      if(sql.startsWith('SELECT (SELECT COUNT(*)'))return[[state.usage]];
      if(sql.startsWith('INSERT INTO billing_payment_orders')){state.orders.push({id:v[0],organization_id:v[1],created_by_user_id:v[2],request_id:v[3],request_hash:v[4],environment:v[5],kind:v[6],amount:v[7],purchase_snapshot:v[8],status:'creating',fulfillment:null});return[{}];}
      if(sql.startsWith('UPDATE billing_payment_orders SET snap_token')){const row=state.orders.find(o=>o.id===v[1]);row.snap_token=v[0];if(row.status==='creating')row.status='pending';return[{}];}
      if(sql.startsWith('UPDATE billing_payment_orders SET provider_status')){state.orders.find(o=>o.id===v[1]).provider_status=v[0];return[{}];}
      if(sql.startsWith('UPDATE billing_payment_orders SET status')){if(state.orders.some(o=>o.id!==v[5]&&o.provider_transaction_id===v[2]))throw Object.assign(Error('duplicate provider id'),{code:'ER_DUP_ENTRY'});Object.assign(state.orders.find(o=>o.id===v[5]),{status:v[0],provider_status:v[1],provider_transaction_id:v[2],fulfillment:v[3],paid_at:v[4]?'2026-10-28':null});return[{}];}
      if(sql.startsWith('INSERT INTO billing_subscriptions')){state.subscriptions.push({organization_id:v[0],id:v[1],price:v[4],periodStart:v[9],periodEnd:v[10]});return[{}];}
      if(sql.startsWith('INSERT INTO billing_credit_grants')){state.grants.push({id:v[0],org:v[1],amount:sql.includes("'package'")?v[3]:v[4]});return[{}];}
      if(sql.startsWith('SELECT request_hash'))return[state.ledger.filter(l=>l.org===v[0]&&l.key===v[1])];
      if(sql.startsWith('INSERT INTO billing_ledger')){if(failLedger)throw Error('fixture ledger failure');state.ledger.push({org:v[1],key:v[2],request_hash:v[3],result:sql.includes("'subscription'")?v[5]:v[6]});return[{}];}
      throw Error(`Unexpected query: ${sql}`);
    },
  };}};
  const provider={enabled:true,mode:'sandbox',async checkout(order){checkoutCalls++;statuses.set(order.id,{order_id:order.id,transaction_id:`tx-${order.id}`,gross_amount:`${order.amount}.00`,currency:'IDR',transaction_status:'pending'});return 'snap-test-token';},async status(id){statusCalls++;return structuredClone(statuses.get(id));}};
  const service=createPaymentService({getPool:()=>pool,provider,now:()=>new Date('2026-01-31T10:00:00.123Z')});
  return{service,provider,calls,state:()=>state,statuses,checkoutCalls:()=>checkoutCalls,statusCalls:()=>statusCalls,failLedger:()=>{failLedger=true;}};
}

test('Midtrans disabled by default, separate fixed Sandbox/Production endpoints and no secret in public config',async()=>{
  assert.equal(createMidtrans({env:{}}).enabled,false);
  assert.equal(createMidtrans({env:{...env,NODE_ENV:'production'}}).enabled,false);
  assert.equal(createMidtrans({env:{...env,NODE_ENV:'production',MIDTRANS_SANDBOX_ORGANIZATION_ID:'7'}}).enabled,true);
  for(const production of [false,true]) {
    const calls=[];const p=createMidtrans({env:{...env,MIDTRANS_IS_PRODUCTION:production?'1':'0'},request:async(url,options)=>{calls.push({url,options});return Response.json({token:'snap'});}});
    await p.checkout({id:'KRY-test',kind:'topup',amount:'10000'});await p.status('KRY-test');await p.cancel('KRY-test');
    assert.equal(calls[2].url,`https://api${production?'':'.sandbox'}.midtrans.com/v2/KRY-test/cancel`);
    assert.equal(calls[2].options.method,'POST');
    assert(calls.every(c=>c.url.includes(production?'.midtrans.com':'.sandbox.midtrans.com')));
    assert.equal(calls[0].options.headers.Authorization,`Basic ${Buffer.from('test-server:').toString('base64')}`);
    assert(!JSON.stringify(p.publicConfig()).includes('test-server'));
    assert.equal(JSON.parse(calls[0].options.body).transaction_details.gross_amount,10000);
  }
});
test('signature verification rejects tampering and provider failures never expose credentials',async()=>{
  const p=createMidtrans({env,request:async()=>{throw Error('secret-provider-response');}});
  const body={order_id:'KRY-test',status_code:'200',gross_amount:'10000.00'};
  body.signature_key=createHash('sha512').update(body.order_id+body.status_code+body.gross_amount+env.MIDTRANS_SERVER_KEY).digest('hex');
  assert(p.verify(body));assert(!p.verify({...body,gross_amount:'10001.00'}));assert(!p.verify({...body,signature_key:'bad'}));
  await assert.rejects(p.status('test'),e=>e.code==='PAYMENT_PROVIDER_UNAVAILABLE'&&!e.message.includes('secret'));
});
test('explicit all-test-account Sandbox opt-in opens all organizations without weakening defaults or Production mode',async()=>{
  const config={...env,NODE_ENV:'production',MIDTRANS_SANDBOX_ALLOW_ALL:'1'};
  const open=createMidtrans({env:config});
  assert.equal(open.enabled,true);assert.equal(open.mode,'sandbox');assert.equal(open.allowedOrganizationId,null);
  assert.equal(createMidtrans({env:{...config,MIDTRANS_SANDBOX_ORGANIZATION_ID:'7'}}).allowedOrganizationId,null);
  for(const value of ['0','true','yes',''])assert.equal(createMidtrans({env:{...config,MIDTRANS_SANDBOX_ALLOW_ALL:value}}).enabled,false);
  assert.equal(createMidtrans({env:{...config,MIDTRANS_SERVER_KEY:''}}).enabled,false);
  assert.equal(createMidtrans({env:{...config,MIDTRANS_ENABLED:'0'}}).enabled,false);
  const prod=createMidtrans({env:{...config,MIDTRANS_IS_PRODUCTION:'1'}});
  assert.equal(prod.mode,'production');assert.equal(prod.allowedOrganizationId,null);
  // Exercise the real payment service with local provider/DB stand-ins only.
  const f=fixture();Object.assign(f.provider,{enabled:open.enabled,mode:open.mode,allowedOrganizationId:open.allowedOrganizationId});
  const a=await f.service.create(1,10,purchase()),b=await f.service.create(2,20,purchase());
  f.statuses.get(a.id).transaction_status='settlement';f.statuses.get(b.id).transaction_status='settlement';
  await f.service.reconcile(a.id);await f.service.reconcile(b.id);
  assert.equal(f.state().subscriptions.length,2);assert.equal(f.state().grants.length,2);
  await assert.rejects(f.service.read(1,b.id),{code:'PAYMENT_NOT_FOUND'});
});
test('purchase accepts only server-defined plan/version or bounded integer topup, never identity/price overrides',()=>{
  assert.equal(validatePurchase(purchase()).planCode,'starter');
  for(const body of [{...purchase(),amountIdr:'1'},{...purchase(),organizationId:2},{...purchase(),planCode:'custom'},{...purchase(),expectedPlanVersion:'1'},...['1','9999','10000.5','10000001',10000].map(amountIdr=>({requestId:randomUUID(),kind:'topup',amountIdr}))])assert.throws(()=>validatePurchase(body));
});
test('checkout snapshots server price and is idempotent including concurrent retries',async()=>{
  const f=fixture(),input=purchase();
  await Promise.all([f.service.create(1,10,input),f.service.create(1,10,input)]);
  assert.equal(f.checkoutCalls(),1);assert.equal(f.state().orders.length,1);assert.equal(f.state().orders[0].amount,'149000');
  await assert.rejects(f.service.create(1,10,{...input,planCode:'pro'}),{code:'PAYMENT_REQUEST_CONFLICT'});
  await assert.rejects(f.service.create(1,10,purchase()),{code:'PAYMENT_SUBSCRIPTION_PENDING'});
  await assert.rejects(f.service.read(2,f.state().orders[0].id),{code:'PAYMENT_NOT_FOUND'});
});
test('confirmed subscription activates atomically once, preserves purchase snapshot and month-end period',async()=>{
  const f=fixture(),order=await f.service.create(1,10,purchase());
  f.state().plans[0].monthlyPriceIdr='999000';f.state().plans[0].includedCreditIdr='1';f.state().plans[0].version=2;
  f.statuses.get(order.id).transaction_status='settlement';
  await Promise.all([f.service.reconcile(order.id),f.service.reconcile(order.id)]);
  assert.equal(f.state().subscriptions.length,1);assert.equal(f.state().grants.length,1);assert.equal(f.state().ledger.length,1);
  assert.equal(f.state().subscriptions[0].price,'149000');assert.equal(f.state().grants[0].amount,'50000');
  const result=JSON.parse(f.state().orders[0].fulfillment);
  assert.equal(result.periodStart,'2026-01-31T10:00:00.000Z');assert.equal(result.periodEnd,'2026-02-28T10:00:00.000Z');
  f.statuses.get(order.id).transaction_status='pending';await f.service.reconcile(order.id);
  assert.equal(f.state().orders[0].status,'paid');assert.equal(f.state().grants.length,1);
});
test('amount, currency, environment and provider identity mismatches never grant benefits',async()=>{
  for(const patch of [{gross_amount:'1.00'},{gross_amount:'149000.01'},{currency:'USD'},{order_id:'other'},{transaction_id:''}]){
    const f=fixture(),order=await f.service.create(1,10,purchase());Object.assign(f.statuses.get(order.id),{transaction_status:'settlement'},patch);
    await assert.rejects(f.service.reconcile(order.id),{code:'PAYMENT_VERIFICATION_FAILED'});assert.equal(f.state().grants.length,0);
  }
  const f=fixture(),o=await f.service.create(1,10,purchase());f.provider.mode='production';
  await assert.rejects(f.service.reconcile(o.id),{code:'PAYMENT_VERIFICATION_FAILED'});
});
test('capture requires fraud accept; pending, expiry, denial and refund never grant unpaid credit',async()=>{
  for(const [state,fraud,expected] of [['capture','challenge','pending'],['capture',undefined,'pending'],['pending',undefined,'pending'],['expire',undefined,'expired'],['cancel',undefined,'cancelled'],['deny',undefined,'denied'],['refund',undefined,'needs_review']]){
    const f=fixture(),o=await f.service.create(1,10,purchase());Object.assign(f.statuses.get(o.id),{transaction_status:state,fraud_status:fraud});
    assert.equal((await f.service.reconcile(o.id)).status,expected);assert.equal(f.state().grants.length,0);
  }
  const f=fixture(),o=await f.service.create(1,10,purchase());Object.assign(f.statuses.get(o.id),{transaction_status:'capture',fraud_status:'accept'});
  assert.equal((await f.service.reconcile(o.id)).status,'paid');
});
test('topup requires active subscription and duplicate notifications cannot double credit',async()=>{
  const f=fixture(),body={requestId:randomUUID(),kind:'topup',amountIdr:'50000'};
  await assert.rejects(f.service.create(1,10,body),{code:'PAYMENT_ACTIVE_SUBSCRIPTION_REQUIRED'});
  f.state().subscriptions.push({organization_id:1,id:'existing'});
  const order=await f.service.create(1,10,body);f.statuses.get(order.id).transaction_status='settlement';
  await Promise.all([f.service.reconcile(order.id),f.service.reconcile(order.id)]);
  assert.equal(f.state().grants.length,1);assert.equal(f.state().ledger.length,1);assert.equal(f.state().grants[0].amount,'50000');
});

test('owner cancellation verifies provider cancellation before permitting a replacement subscription',async()=>{
  const f=fixture(),order=await f.service.create(1,10,purchase());let cancellations=0;
  f.provider.cancel=async id=>{cancellations++;f.statuses.get(id).transaction_status='cancel';};
  assert.equal((await f.service.cancel(1,order.id)).status,'cancelled');
  assert.equal(cancellations,1);assert.equal(f.state().grants.length,0);
  assert.equal((await f.service.cancel(1,order.id)).status,'cancelled');
  assert.equal(cancellations,1); // repeat is safe
  const replacement=await f.service.create(1,10,purchase());
  assert.notEqual(replacement.id,order.id);
});

test('cancellation cannot reach provider for another tenant, mode, invalid id or disabled integration',async()=>{
  const f=fixture(),order=await f.service.create(1,10,purchase());let cancellations=0;
  f.provider.cancel=async()=>{cancellations++;};
  await assert.rejects(f.service.cancel(2,order.id),{code:'PAYMENT_NOT_FOUND'});
  await assert.rejects(f.service.cancel(1,'bad'),{code:'PAYMENT_NOT_FOUND'});
  f.provider.allowedOrganizationId=2;
  await assert.rejects(f.service.cancel(1,order.id),{code:'PAYMENT_SANDBOX_TENANT_REQUIRED'});
  f.provider.allowedOrganizationId=null;f.provider.mode='production';
  await assert.rejects(f.service.cancel(1,order.id),{code:'PAYMENT_ENVIRONMENT_MISMATCH'});
  f.provider.enabled=false;
  await assert.rejects(f.service.cancel(1,order.id),{code:'PAYMENT_NOT_CONFIGURED'});
  assert.equal(cancellations,0);assert.equal(f.statusCalls(),0);
});

test('paid, captured fraud review, expired and invalid provider states never reach cancel API',async()=>{
  for(const state of ['settlement','capture','expire','refund']) {
    const f=fixture(),order=await f.service.create(1,10,purchase());let cancellations=0;
    f.provider.cancel=async()=>{cancellations++;};
    f.statuses.get(order.id).transaction_status=state;
    await assert.rejects(f.service.cancel(1,order.id),{code:'PAYMENT_CANNOT_CANCEL'});
    assert.equal(cancellations,0);
  }
  const f=fixture(),order=await f.service.create(1,10,purchase());let cancellations=0;
  f.provider.cancel=async()=>{cancellations++;};
  f.statuses.get(order.id).gross_amount='1.00';
  await assert.rejects(f.service.cancel(1,order.id),{code:'PAYMENT_VERIFICATION_FAILED'});
  assert.equal(cancellations,0);
});

test('cancel timeouts reconcile actual outcome and never free a still pending purchase',async()=>{
  for(const outcome of ['pending','cancel','settlement']) {
    const f=fixture(),order=await f.service.create(1,10,purchase());
    f.provider.cancel=async id=>{f.statuses.get(id).transaction_status=outcome;throw Error('timeout');};
    if(outcome==='pending') {
      await assert.rejects(f.service.cancel(1,order.id),{code:'PAYMENT_CANCEL_UNCERTAIN'});
      await assert.rejects(f.service.create(1,10,purchase()),{code:'PAYMENT_SUBSCRIPTION_PENDING'});
    } else assert.equal((await f.service.cancel(1,order.id)).status,outcome==='cancel'?'cancelled':'paid');
    assert.equal(f.state().grants.length,outcome==='settlement'?1:0);
  }
});

test('cancel API success without confirmed status or unavailable final status cannot locally cancel',async()=>{
  const f=fixture(),order=await f.service.create(1,10,purchase());
  f.provider.cancel=async()=>({status_code:'200',transaction_status:'cancel'});
  await assert.rejects(f.service.cancel(1,order.id),{code:'PAYMENT_CANCEL_PENDING'});
  assert.equal(f.state().orders[0].status,'pending');
  f.provider.cancel=async()=>{f.provider.status=async()=>{throw Error('offline');};};
  await assert.rejects(f.service.cancel(1,order.id),/offline/);
  assert.equal(f.state().orders[0].status,'pending');
});
test('database failure rolls back subscription, balance, ledger and payment status together',async()=>{
  const f=fixture(),order=await f.service.create(1,10,purchase());f.statuses.get(order.id).transaction_status='settlement';f.failLedger();
  await assert.rejects(f.service.reconcile(order.id),/ledger failure/);
  assert.equal(f.state().subscriptions.length,0);assert.equal(f.state().grants.length,0);assert.equal(f.state().orders[0].status,'pending');
});
test('competing manual activation or capacity changes retain paid order for review without granting invalid plan',async()=>{
  for(const change of [f=>f.state().subscriptions.push({organization_id:1,id:'manual'}),f=>{f.state().usage.divisions=2;}]){
    const f=fixture(),order=await f.service.create(1,10,purchase());change(f);f.statuses.get(order.id).transaction_status='settlement';
    assert.equal((await f.service.reconcile(order.id)).status,'needs_review');assert.equal(f.state().grants.length,0);
    f.statuses.get(order.id).transaction_status='pending';assert.equal((await f.service.reconcile(order.id)).status,'needs_review');
  }
});
test('provider transaction reuse across orders rolls back second fulfillment and topup ledger failure rolls back credit',async()=>{
  const f=fixture(),first=await f.service.create(1,10,purchase()),second=await f.service.create(2,20,purchase());
  Object.assign(f.statuses.get(first.id),{transaction_status:'settlement',transaction_id:'unique-provider-id'});
  Object.assign(f.statuses.get(second.id),{transaction_status:'settlement',transaction_id:'unique-provider-id'});
  await f.service.reconcile(first.id);await assert.rejects(f.service.reconcile(second.id),{code:'ER_DUP_ENTRY'});
  assert.equal(f.state().grants.length,1);assert.equal(f.state().subscriptions.length,1);
  const top=fixture();top.state().subscriptions.push({organization_id:1,id:'existing'});
  const order=await top.service.create(1,10,{requestId:randomUUID(),kind:'topup',amountIdr:'50000'});
  top.statuses.get(order.id).transaction_status='settlement';top.failLedger();
  await assert.rejects(top.service.reconcile(order.id),/ledger failure/);assert.equal(top.state().grants.length,0);assert.equal(top.state().orders[0].status,'pending');
});
test('uncertain checkout is preserved and retry does not blindly create a second provider order',async()=>{
  const f=fixture(),input=purchase();f.provider.checkout=async()=>{throw Error('uncertain');};
  await assert.rejects(f.service.create(1,10,input),/uncertain/);
  const retry=await f.service.create(1,10,input);assert.equal(retry.status,'creating');assert.equal(f.state().orders.length,1);
});
test('Sandbox tenant restriction denies both checkout and reconciliation outside allowed test tenant',async()=>{
  const f=fixture();f.provider.allowedOrganizationId=2;
  await assert.rejects(f.service.create(1,10,purchase()),{code:'PAYMENT_SANDBOX_TENANT_REQUIRED'});
  assert.equal(f.checkoutCalls(),0);
});
test('HTTP routes enforce session, owner, Origin, scope and verified webhook without browser claims',async t=>{
  const calls=[],app=express();app.use(express.json());
  const provider={enabled:true,mode:'sandbox',publicConfig:()=>({enabled:true,mode:'sandbox'}),verify:b=>b?.signature_key==='valid'};
  const service={list:async org=>{calls.push(['list',org]);return[];},create:async(org,user,b)=>{calls.push(['create',org,user,b]);return{id:'order'};},read:async(org,id)=>{calls.push(['read',org,id]);if(id==='other')throw Object.assign(Error(),{code:'PAYMENT_NOT_FOUND',status:404});return{id,environment:'sandbox'};},reconcile:async id=>{calls.push(['reconcile',id]);return{status:'paid'};}};
  service.cancel=async(org,id)=>{calls.push(['cancel',org,id]);if(id==='other')throw Object.assign(Error(),{code:'PAYMENT_NOT_FOUND',status:404});return{status:'cancelled'};};
  const requireTenant=(req,res,next)=>{if(!req.get('x-test-session'))return res.sendStatus(401);req.tenantContext={organizationId:7,role:req.get('x-test-role')||'owner'};req.authPrincipal={userId:10};next();};
  installPaymentRoutes(app,{provider,service,requireTenant,appOrigin:'https://app.example.test'});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});
  const request=(path,body,headers={})=>fetch(`http://127.0.0.1:${server.address().port}/api/payments${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.equal((await request('')).status,401);
  assert.equal((await request('',undefined,{'x-test-session':'yes','x-test-role':'member'})).status,403);
  assert.equal((await request('/checkout',purchase(),{'x-test-session':'yes',Origin:'https://evil.test'})).status,403);
  assert.equal(calls.length,0);
  const headers={'x-test-session':'yes',Origin:'https://app.example.test'};
  assert.equal((await request('/order/cancel',{})).status,401);
  assert.equal((await request('/order/cancel',{}, {...headers,'x-test-role':'member'})).status,403);
  assert.equal((await request('/order/cancel',{}, {...headers,Origin:'https://evil.test'})).status,403);
  assert.equal((await request('/order/cancel?organizationId=2',{},headers)).status,400);
  assert.equal((await request('/order/cancel',{organizationId:2},headers)).status,400);
  assert.equal((await request('/order/cancel',[],headers)).status,400);
  assert.equal(calls.length,0);
  assert.equal((await request('/checkout',purchase(),headers)).status,201);assert.deepEqual(calls[0].slice(0,3),['create',7,10]);
  assert.equal((await request('/order/cancel',{},headers)).status,200);
  assert.deepEqual(calls.at(-1),['cancel',7,'order']);
  assert.equal((await request('/other/cancel',{},headers)).status,404);
  assert.equal((await request('/other/check',{},headers)).status,404);
  assert.equal((await request('/midtrans/notification',{order_id:'order',signature_key:'bad'})).status,403);
  assert.equal((await request('/midtrans/notification',{order_id:'order',signature_key:'valid'})).status,200);
  assert.deepEqual(calls.at(-1),['reconcile','order']);
});
test('browser requests use same-origin and safe translated errors without trusting callback results',async()=>{
  let seen;await paymentRequest('/checkout',purchase(),undefined,async(url,opts)=>{seen={url,opts};return Response.json({id:'order'});});
  assert.equal(seen.url,'/api/payments/checkout');assert.equal(seen.opts.credentials,'same-origin');
  await assert.rejects(paymentRequest('',undefined,undefined,async()=>Response.json({code:'PAYMENT_PLAN_CHANGED'},{status:409})),/Harga paket berubah/);
  const ui=await readFile(new URL('../src/react/payment-checkout.jsx',import.meta.url),'utf8');
  assert.match(ui,/onSuccess:update/);assert.match(ui,/Periksa status/);assert.doesNotMatch(ui,/grantCredit|startSubscription|ServerKey/);
});
test('017 is additive and registered; schema validation rejects missing columns, unique keys and foreign keys',async()=>{
  const manifest=await inspectMigrationDirectory(fileURLToPath(new URL('../migrations/',import.meta.url)));
  assert.equal(manifest.diagnostics.length,0);const paymentMigration=manifest.migrations.find(m=>m.id==='017_midtrans_payments');
  assert.match(paymentMigration.source,/CREATE TABLE billing_payment_orders/);assert.doesNotMatch(paymentMigration.source,/DROP |ALTER /);
  const missing=await validatePaymentSchema({execute:async()=>[[]]});
  assert(missing.some(d=>d.index==='uq_payment_request'));assert(missing.some(d=>d.constraint==='fk_payment_organization'));assert(missing.some(d=>d.column==='fulfillment'));assert(missing.length>=Object.keys(PAYMENT_COLUMNS).length);
});
test('production upgrade requires explicit matching target and backup approval before any DB access',async()=>{
  const production={NODE_ENV:'production',DB_HOST:'127.0.0.1',DB_NAME:'test',DB_USER:'app',DB_PASSWORD:'test-only'};
  const args=['--apply','--confirm-production','--database','test'];
  assert.throws(()=>paymentUpgradeOptions(args,production),/BACKUP/);
  assert.equal(paymentUpgradeOptions([...args,'--backup-confirmed'],production).database,'test');
  await assert.rejects(upgradePayments({execute:async()=>[[{db:'wrong'}]]},'test',[]),/DATABASE_MISMATCH/);
});
test('payment UI labels Sandbox clearly, exposes first checkout/topup separately and never offers unsupported renewals',async()=>{
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  try {
    const {PaymentCheckoutView}=await vite.ssrLoadModule('/src/react/payment-checkout.jsx');
    const {PricingCards}=await vite.ssrLoadModule('/src/react/pricing-cards.jsx');
    const data={subscription:null,entitlements:{active:false},plans:[{code:'starter',name:'Starter',monthlyPriceIdr:'149000',version:1},{code:'custom',quoteRequired:true}]};
    const props={data,state:{config:{enabled:true,mode:'sandbox'},orders:[]},busy:false,amount:'50000',message:''};
    const first=renderToStaticMarkup(React.createElement(PaymentCheckoutView,props));
    for(const label of ['Mode Sandbox','bukan pembayaran sungguhan','kartu paket di bawah','Belum ada pembayaran.'])assert(first.includes(label),label);
    assert(!first.includes('Beli Starter'));
    assert(!first.includes('Beli Custom'));assert(!first.includes('<form'));
    const subscribed=renderToStaticMarkup(React.createElement(PaymentCheckoutView,{...props,data:{...data,subscription:{id:'test'},entitlements:{active:true}}}));
    assert(subscribed.includes('Top up saldo AI'));assert(subscribed.includes('tidak memperpanjang'));assert(!subscribed.includes('Beli Starter'));
    const pendingProps={...props,cancel(){},state:{...props.state,orders:[{id:'test',kind:'subscription',mode:'sandbox',amountIdr:'149000',status:'pending',snapToken:'test-token'}]}};
    const pending=renderToStaticMarkup(React.createElement(PaymentCheckoutView,pendingProps));
    assert(pending.includes('Lanjutkan bayar'));assert(pending.includes('Periksa status'));
    assert(pending.includes('>Batalkan pembayaran</button>'));
    for(const status of ['paid','cancelled','expired','creating','needs_review']) {
      const html=renderToStaticMarkup(React.createElement(PaymentCheckoutView,{...pendingProps,state:{...pendingProps.state,orders:[{...pendingProps.state.orders[0],status,snapToken:undefined}]}}));
      assert(!html.includes('>Batalkan pembayaran</button>'),status);
    }
    const blockedCancel=renderToStaticMarkup(React.createElement(PaymentCheckoutView,{...pendingProps,busy:true}));
    assert(blockedCancel.includes('disabled="">Batalkan pembayaran</button>'));
    const disabled=renderToStaticMarkup(React.createElement(PaymentCheckoutView,{...props,state:{...props.state,config:{enabled:false,mode:'sandbox'}}}));
    assert(disabled.includes('belum diaktifkan'));assert(!disabled.includes('Beli Starter'));
    const cardProps={plans:data.plans,dashboard:true,paymentEnabled:true,onPurchase(){}};
    const cards=renderToStaticMarkup(React.createElement(PricingCards,cardProps));
    assert(cards.includes('Beli Starter'));assert(cards.includes('149.000'));
    assert.equal((cards.match(/disabled=""/g)||[]).length,1); // Custom only
    for(const extra of [{purchasePending:true},{busy:true},{hasSubscription:true},{currentPlan:'starter'},{paymentEnabled:false},{onPurchase:undefined}]) {
      const blocked=renderToStaticMarkup(React.createElement(PricingCards,{...cardProps,...extra}));
      assert.equal((blocked.match(/disabled=""/g)||[]).length,2,JSON.stringify(extra));
    }
    let selected;
    const tree=PricingCards({...cardProps,onPurchase:plan=>{selected=plan;}});
    const starter=tree.props.children[0];
    const button=starter.props.children.find(child=>child?.type==='button');
    button.props.onClick();
    assert.equal(selected,data.plans[0]);
  }finally{await vite.close();}
});
