import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createWhatsapp} from '../server/whatsapp.js';
import {createDemoService,demoConfiguration,demoDigest,installDemoRoutes} from '../server/demo.js';
import {activeDemo,demoEntitlements,readDemoStatus} from '../server/demo-policy.js';
import {readBilling} from '../server/billing.js';
import {assertPaidAccess} from '../server/billing-enforcement.js';
import {TRIAL_DAYS,trialTiming} from '../shared/trial.js';
import {validateDemoSchema} from '../server/migrations/demo-contract.js';
import {inspectMigrationDirectory} from '../server/migrations/status.js';
import {upgradeDemo} from '../scripts/upgrade-deployment-demo.mjs';
import {teamTemplates} from '../shared/workspace-team.js';

const env={DEMO_ENABLED:'1',BLITZMES_API_KEY:'fake-key-for-tests',DEMO_CODE_SECRET:'test-only-secret-not-a-real-secret-32',APP_ORIGIN:'https://app.test'};
function fixture() {
  let db={rows:new Map(),orgs:[],workspaces:[],divisions:[],agents:[],grants:[],ledger:[],memberships:[],sessions:[]};
  const messages=[],users=new Map([[1,{id:1,whatsapp_number:'081234567890',display_name:'Demo'}],[2,{id:2,whatsapp_number:'+6281234567890',display_name:'Other'}]]);
  let queue=Promise.resolve(),failSend=false,failInsert=false;
  const pool={async getConnection(){let snapshot,unlock;return {
    async beginTransaction(){const previous=queue;queue=new Promise(r=>{unlock=r;});await previous;snapshot=structuredClone(db);},
    async commit(){snapshot=null;},async rollback(){if(snapshot)db=snapshot;},release(){unlock?.();},
    async execute(raw,v=[]){const sql=raw.replace(/\s+/g,' ').trim(),row=db.rows.get(v.at(-1));
      if(sql.startsWith('SELECT id, whatsapp_number'))return [[users.get(v[0])].filter(Boolean)];
      if(sql.startsWith('SELECT *, otp_expires_at')){const r=db.rows.get(v[0]);return [r?[{...r,otp_valid:r.otp_expires_at>Date.now(),activation_valid:r.activation_expires_at>Date.now(),cooling:r.last_sent_at>Date.now()-60000,in_window:r.send_window_at>Date.now()-86400000,active:r.expires_at>Date.now()}]:[]];}
      if(sql.startsWith('INSERT INTO demo_access')){
        db.rows.set(v[0],{user_id:v[0],pending_phone_hash:v[1],otp_attempts:0,activation_attempts:0,sends:0,send_window_at:Date.now()});return [{}];
      }
      if(sql.startsWith('UPDATE demo_access SET otp_hash=') || sql.startsWith('UPDATE demo_access SET activation_hash=')){
        const prefix=sql.includes('SET otp_hash=')?'otp':'activation';
        if(sql.includes('_hash=NULL'))row[`${prefix}_hash`]=null;
        else {row[`${prefix}_hash`]=v[0];row[`${prefix}_expires_at`]=Date.now()+(prefix==='otp'?300000:86400000);row[`${prefix}_attempts`]=0;row.sends=row.send_window_at>Date.now()-86400000?row.sends+1:1;row.send_window_at=Date.now();row.last_sent_at=Date.now();}return [{}];
      }
      if(sql.startsWith('UPDATE demo_access SET otp_attempts')){row.otp_attempts++;return [{}];}
      if(sql.startsWith('UPDATE demo_access SET activation_attempts')){row.activation_attempts++;return [{}];}
      if(sql.startsWith('UPDATE demo_access SET verified_at')){
        if([...db.rows.values()].some(r=>r.user_id!==row.user_id && r.phone_hash===row.pending_phone_hash))throw Object.assign(Error(),{code:'ER_DUP_ENTRY'});
        row.phone_hash=row.pending_phone_hash;row.verified_at=Date.now();row.otp_hash=null;row.last_sent_at=null;return [{}];
      }
      if(sql.startsWith('UPDATE users SET whatsapp_verified_at'))return [{}];
      if(sql.startsWith('SELECT organization_id FROM organization_memberships'))return [db.memberships.filter(m=>m===v[0]).map(()=>({organization_id:1}))];
      if(sql.startsWith('SELECT workspace_id FROM workspace_memberships'))return [[]];
      if(sql.startsWith('INSERT INTO organizations')){db.orgs.push(v);return [{insertId:100}];}
      if(sql.startsWith('INSERT INTO workspaces')){db.workspaces.push(v);return [{insertId:200}];}
      if(sql.startsWith('INSERT INTO organization_memberships') || sql.startsWith('INSERT INTO workspace_memberships'))return [{}];
      if(sql.startsWith('INSERT INTO workspace_divisions')){db.divisions.push(v);return [{}];}
      if(sql.startsWith('SELECT id FROM workspace_divisions'))return [[{id:v[2]}]];
      if(sql.startsWith('SELECT COUNT(*) AS count FROM workspace_agents'))return [[{count:db.agents.filter(a=>a[3]===v[2]).length}]];
      if(sql.startsWith('INSERT INTO workspace_agents')){db.agents.push(v);return [{}];}
      if(sql.startsWith('INSERT INTO billing_wallets'))return [{}];
      if(sql.startsWith('INSERT INTO billing_credit_grants')){
        assert.match(sql,/SELECT .*expires_at FROM demo_access WHERE user_id=\?/);
        assert.equal(v[3],1);assert(db.rows.get(v[3]).expires_at);
        db.grants.push({...v,expiresAt:db.rows.get(v[3]).expires_at});return [{}];
      }
      if(sql.startsWith('INSERT INTO billing_ledger')){if(failInsert)throw Error('test database failure');db.ledger.push(v);return [{}];}
      if(sql.startsWith('UPDATE demo_access SET organization_id')){
        assert.match(sql,/INTERVAL 7 DAY/);
        const started=Date.now();Object.assign(row,{organization_id:v[0],workspace_id:v[1],activated_at:started,expires_at:started+7*86400000,activation_hash:null});return [{}];
      }
      if(sql.startsWith('UPDATE sessions SET active_workspace_id')){db.sessions.push(v);return [{}];}
      if(sql.startsWith('SELECT id FROM sessions'))return [[{id:v[0]}]];
      throw Error(`Unexpected test SQL: ${sql}`);
    },
  };}};
  const service=createDemoService({getPool:()=>pool,env,whatsapp:{async send(phone,message){messages.push({phone,message});if(failSend)throw Error('secret-provider-detail');}}});
  return {service,messages,users,db:()=>db,row:(id=1)=>db.rows.get(id),cool(){db.rows.get(1).last_sent_at=Date.now()-61000;},failSend(){failSend=true;},failInsert(){failInsert=true;}};
}
const otp=f=>f.messages.findLast(m=>m.message.includes('OTP Karyora')).message.match(/\b\d{6}\b/)[0];
const activation=f=>f.messages.findLast(m=>m.message.includes('Kode aktivasi')).message.match(/KRY-DEMO-[A-F0-9]{20}/)[0];
async function verified(f){await f.service.send(1,'otp');await f.service.verify(1,otp(f));await f.service.send(1,'activation');}

test('Blitzmes adapter uses documented fixed POST body and accepts only explicit status true',async()=>{
  let call;
  const sender=createWhatsapp({env,request:async(url,options)=>{call={url,options};return Response.json({status:true,message:'Message sent.'});}});
  await sender.send('+6281234567890','test OTP');
  assert.equal(call.url,'https://api.blitzmes.com/api/send-message');assert.equal(call.options.redirect,'error');
  assert.deepEqual(JSON.parse(call.options.body),{api_key:env.BLITZMES_API_KEY,receiver:'6281234567890',data:{message:'test OTP'}});
  for(const result of [{status:false},{success:true},{status:'true'},{}]) {
    await assert.rejects(createWhatsapp({env,request:async()=>Response.json(result)}).send('6281234567890','test'),/WHATSAPP_DELIVERY_UNCONFIRMED/);
  }
  await assert.rejects(createWhatsapp({env,request:async()=>{throw Error('private-key');}}).send('6281234567890','test'),e=>e.message==='WHATSAPP_DELIVERY_UNCONFIRMED');
  assert.equal(demoConfiguration({}).enabled,false);assert.equal(demoConfiguration({...env,DEMO_CODE_SECRET:'short'}).enabled,false);
});

test('OTP verification and separate activation code provision exactly six private teams once',async()=>{
  const f=fixture();await verified(f);
  assert.equal(demoConfiguration(env).days,7);assert.equal(TRIAL_DAYS,7);
  assert.equal(f.row().activated_at,undefined);assert.equal(f.row().expires_at,undefined);
  assert(f.messages.at(-1).message.includes('Trial 7 hari dimulai setelah aktivasi'));
  assert.notEqual(f.row().otp_hash,otp(f));assert.notEqual(f.row().activation_hash,activation(f));
  assert.equal(f.messages[0].phone,'+6281234567890');
  const publicStatus=JSON.stringify(await f.service.status(1));
  assert(!publicStatus.includes('6281234567890'));assert(!publicStatus.includes('hash'));assert(!publicStatus.includes(activation(f)));
  await Promise.all([f.service.activate(1,77,activation(f)),f.service.activate(1,77,activation(f))]);
  assert.equal(f.db().orgs.length,1);assert.equal(f.db().divisions.length,6);
  assert.equal(f.db().agents.length,teamTemplates.slice(0,6).reduce((n,t)=>n+t.agents.length,0));
  assert.equal(f.db().grants.length,1);assert.equal(f.db().ledger.length,1);
  const originalExpiry=f.row().expires_at;
  assert.equal(originalExpiry-f.row().activated_at,7*86400000);
  assert.equal(f.db().grants[0].expiresAt,originalExpiry);
  assert(f.db().agents.every(a=>a[8]==='team'));
  assert.equal(f.db().sessions[0][1],77);
  assert.equal(f.row().activation_hash,null);assert.equal((await f.service.status(1)).stage,'activated');
  await assert.rejects(f.service.send(1,'activation'),{code:'DEMO_ALREADY_CLAIMED'});
  await assert.rejects(f.service.send(1,'otp'),{code:'DEMO_ALREADY_CLAIMED'});
  const status=await f.service.status(1);assert.equal(status.subscriptionStatus,'trial');
  await f.service.activate(1,88,activation(f));assert.equal(f.row().expires_at,originalExpiry);
});

test('an expired trial stays readable and never renews through status, activation or resend',async()=>{
  const f=fixture();await verified(f);await f.service.activate(1,77,activation(f));
  f.row().expires_at=Date.now()-1;const deadline=f.row().expires_at;
  const status=await f.service.status(1);
  assert.equal(status.active,false);assert.equal(status.subscriptionStatus,'trial_expired');
  await f.service.activate(1,88,activation(f));
  await assert.rejects(f.service.send(1,'activation'),{code:'DEMO_ALREADY_CLAIMED'});
  assert.equal(f.row().expires_at,deadline);assert.equal(f.db().grants.length,1);
  assert.equal(f.db().divisions.length,6);assert.equal(f.db().orgs.length,1);
});

test('trial timing expires at the exact deadline and displays WIB without resetting older grants',()=>{
  const start=Date.parse('2026-10-30T03:00:00.000Z'),end=start+7*86400000;
  const trial={expiresAt:new Date(end).toISOString(),active:true,status:'trial'};
  assert.equal(trialTiming(trial,start).daysRemaining,7);
  assert.equal(trialTiming(trial,end-1).daysRemaining,1);
  assert.equal(trialTiming(trial,end).label,'Trial berakhir');
  assert.equal(trialTiming(trial,end).active,false);
  assert.equal(trialTiming(trial,start).expiresLabel.includes('WIB'),true);
  assert.equal(trialTiming({...trial,active:false},start).active,false);
  const older={...trial,expiresAt:new Date(start+3*86400000).toISOString()};
  assert.equal(trialTiming(older,start).daysRemaining,3);
});

test('billing exposes trial or expired status without granting expired access; paid plan takes priority',async(t)=>{
  const previous=process.env.DEMO_ENABLED;process.env.DEMO_ENABLED='1';
  t.after(()=>{if(previous===undefined)delete process.env.DEMO_ENABLED;else process.env.DEMO_ENABLED=previous;});
  let active=1,paid=false,trialReads=0;
  const c={execute:async(sql,args)=>{
    if(sql.includes('FROM demo_access')){
      assert.deepEqual(args,[12]);trialReads++;
      if(sql.includes('AND expires_at>UTC_TIMESTAMP()') && !active)return [[]];
      return [[{organization_id:12,workspace_id:2,credit_idr:'3000',active,
        activatedAt:new Date(Date.now()-86400000).toISOString(),expiresAt:new Date(Date.now()+(active?6:-1)*86400000).toISOString()}]];
    }
    if(sql.includes('FROM billing_subscriptions'))return [paid?[{plan_code:'pro',status:'active',max_divisions:3,max_members:6,
      period_start:new Date(Date.now()-86400000).toISOString(),period_end:new Date(Date.now()+86400000).toISOString()}]:[]];
    if(sql.includes('FROM workspace_divisions') || sql.includes('FROM organization_memberships'))return [[{count:1}]];
    return [[]];
  }};
  let data=await readBilling(c,12);
  assert.equal(data.subscription,null);assert.equal(data.subscriptionStatus,'trial');
  assert.equal(data.demo.active,true);assert.equal(data.entitlements.canUseAi,true);
  active=0;data=await readBilling(c,12);
  assert.equal(data.subscriptionStatus,'trial_expired');assert.equal(data.demo.status,'expired');
  assert.equal(data.entitlements.canUseAi,false);
  assert.equal((await readDemoStatus(c,12,env)).active,false);
  await assert.rejects(assertPaidAccess(c,12));
  paid=true;trialReads=0;data=await readBilling(c,12);
  assert.equal(data.subscriptionStatus,'active');assert.equal(data.demo,null);
  assert.equal(data.entitlements.canUseAi,true);assert.equal(trialReads,0);
});

test('same normalized phone cannot claim a second demo or transfer codes between accounts',async()=>{
  const f=fixture();await verified(f);
  await f.service.send(2,'otp');
  await assert.rejects(f.service.verify(2,otp(f)),{code:'ER_DUP_ENTRY'});
  await assert.rejects(f.service.activate(2,2,activation(f)),{code:'DEMO_CODE_EXPIRED'});
  assert.equal(demoDigest(env.DEMO_CODE_SECRET,1,'otp','123456')===demoDigest(env.DEMO_CODE_SECRET,2,'otp','123456'),false);
  f.users.get(1).whatsapp_number='081999999999';
  await assert.rejects(f.service.activate(1,1,activation(f)),{code:'DEMO_PHONE_CHANGED'});
});

test('wrong code attempts persist, expire after five, and correct OTP cannot activate a demo',async()=>{
  const f=fixture();await f.service.send(1,'otp');const correct=otp(f),wrong=correct==='111111'?'222222':'111111';
  for(let i=0;i<5;i++)await assert.rejects(f.service.verify(1,wrong),{code:'DEMO_CODE_INVALID'});
  assert.equal(f.row().otp_attempts,5);
  await assert.rejects(f.service.verify(1,correct),{code:'DEMO_CODE_EXPIRED'});
  await assert.rejects(f.service.activate(1,1,correct),{code:'DEMO_CODE_EXPIRED'});
  const a=fixture();await verified(a);
  for(let i=0;i<5;i++)await assert.rejects(a.service.activate(1,1,'WRONG'),{code:'DEMO_CODE_INVALID'});
  assert.equal(a.row().activation_attempts,5);
  await assert.rejects(a.service.activate(1,1,activation(a)),{code:'DEMO_CODE_EXPIRED'});
});

test('codes expire and resending invalidates previous activation without resetting trial benefits',async()=>{
  const f=fixture();await f.service.send(1,'otp');f.row().otp_expires_at=Date.now()-1;
  await assert.rejects(f.service.verify(1,otp(f)),{code:'DEMO_CODE_EXPIRED'});
  f.cool();await f.service.send(1,'otp');await f.service.verify(1,otp(f));await f.service.send(1,'activation');
  const previous=activation(f);f.cool();await f.service.send(1,'activation');
  await assert.rejects(f.service.activate(1,1,previous),{code:'DEMO_CODE_INVALID'});
  f.row().activation_expires_at=Date.now()-1;
  await assert.rejects(f.service.activate(1,1,activation(f)),{code:'DEMO_CODE_EXPIRED'});
  assert.equal(f.db().grants.length,0);
});

test('sending failures persist cooldown and quota, invalidate uncertain codes and never verify phone',async()=>{
  const f=fixture();f.failSend();
  await assert.rejects(f.service.send(1,'otp'),{code:'DEMO_SEND_UNCONFIRMED'});
  assert.equal(f.row().sends,1);assert.equal(f.row().otp_hash,null);assert(!f.row().verified_at);
  await assert.rejects(f.service.send(1,'otp'),{code:'DEMO_SEND_LIMIT'});
  f.cool();f.row().sends=10;
  await assert.rejects(f.service.send(1,'otp'),{code:'DEMO_SEND_LIMIT'});
});

test('existing tenant and activation database failures never leave partial teams or free credit',async()=>{
  const f=fixture();await verified(f);f.db().memberships.push(1);
  await assert.rejects(f.service.activate(1,1,activation(f)),{code:'DEMO_FRESH_ACCOUNT_REQUIRED'});
  assert.equal(f.db().orgs.length,0);
  const g=fixture();await verified(g);g.failInsert();
  await assert.rejects(g.service.activate(1,1,activation(g)),/database failure/);
  assert.equal(g.db().orgs.length,0);assert.equal(g.db().agents.length,0);assert.equal(g.db().grants.length,0);assert(!g.row().activated_at);
});

test('trial entitlement lookup is feature gated, checks expiry and has no model restriction',async()=>{
  let queries=0;
  const c={execute:async(sql)=>{queries++;assert(sql.includes('expires_at>UTC_TIMESTAMP()'));assert(!sql.includes('model_id'));return [[{workspace_id:2}]];}};
  assert.equal(await activeDemo(c,1,{}),null);assert.equal(queries,0);
  assert.equal((await activeDemo(c,1,env)).workspace_id,2);
  assert.deepEqual(demoEntitlements(),{active:true,canUseAi:true,maxDivisions:6,maxMembers:1,agentsPerDivision:4,whatsapp:false,demo:true});
});

test('demo HTTP writes require session, same-origin JSON, no forged fields and send activation after verification',async(t)=>{
  const calls=[];
  const service={status:async id=>({stage:'otp',user:id}),send:async(id,kind)=>{calls.push(['send',id,kind]);return{sent:true};},verify:async(id,code)=>{calls.push(['verify',id,code]);},activate:async(id,session,code)=>{calls.push(['activate',id,session,code]);return{activated:true};}};
  const pool={getConnection:async()=>({release(){},execute:async sql=>sql.startsWith('SELECT s.id')?[[{id:77,user_id:1,user_status:'active',idle_expires_at:new Date(Date.now()+60000),absolute_expires_at:new Date(Date.now()+60000)}]]:[{}]})};
  const app=express();app.use(express.json());installDemoRoutes(app,{getPool:()=>pool,env,service});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});
  const headers={Origin:env.APP_ORIGIN,'Content-Type':'application/json',Cookie:`vo_session=${'a'.repeat(40)}`};
  const request=(path,body,h=headers)=>fetch(`http://127.0.0.1:${server.address().port}/api/demo${path}`,{method:body===undefined?'GET':'POST',headers:h,...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.equal((await request('/otp',{},{})).status,403);
  assert.equal((await request('/otp',{}, {...headers,Cookie:''})).status,401);
  assert.equal((await request('/otp',{userId:2})).status,400);
  assert.equal((await request('/otp?userId=2',{})).status,400);
  assert.equal((await request('/activate',{code:'x',organizationId:2})).status,400);
  assert.equal((await request('/activate',[])).status,400);
  assert.equal(calls.length,0);
  assert.equal((await request('/verify',{code:'123456'})).status,200);
  assert.deepEqual(calls,[['verify',1,'123456'],['send',1,'activation']]);
  assert.equal((await request('/activate',{code:'kry-demo-test'})).status,200);
  assert.deepEqual(calls.at(-1),['activate',1,77,'KRY-DEMO-TEST']);
});

test('018 is additive and schema validation checks security columns, uniqueness and foreign keys',async()=>{
  const manifest=await inspectMigrationDirectory(fileURLToPath(new URL('../migrations',import.meta.url)));
  assert.equal(manifest.diagnostics.length,0);const migration=manifest.migrations.find(m=>m.id==='018_whatsapp_demo');assert.ok(migration);
  assert.doesNotMatch(migration.source,/DROP |ALTER |INSERT INTO users/);
  const missing=await validateDemoSchema({execute:async()=>[[]]});
  assert(missing.some(m=>m.index==='uq_demo_phone'));assert(missing.some(m=>m.column==='otp_hash'));assert(missing.some(m=>m.constraint==='fk_demo_user'));
  await assert.rejects(upgradeDemo({execute:async()=>[[{db:'other'}]]},'expected',[]),/DATABASE_MISMATCH/);
});

test('demo React entry explains both codes, trial limits and exposes no provider credentials',async()=>{
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  try {
    const {DemoPage,demoRequest}=await vite.ssrLoadModule('/src/react/demo-page.jsx');
    const html=renderToStaticMarkup(React.createElement(DemoPage,{}));
    for(const text of ['6 divisi','Rp3.000','7 hari','OTP WhatsApp','Kode aktivasi'])assert(html.includes(text),text);
    assert(html.includes('katalog aktif'));assert(!html.includes('model hemat khusus demo'));
    assert(!html.includes(env.BLITZMES_API_KEY));assert(!html.includes(env.DEMO_CODE_SECRET));
    let options;await demoRequest('/verify',{code:'123456'},undefined,async(_url,o)=>{options=o;return Response.json({verified:true});});
    assert.equal(options.credentials,'same-origin');assert.deepEqual(JSON.parse(options.body),{code:'123456'});
    await assert.rejects(demoRequest('/verify',{},undefined,async()=>Response.json({code:'DEMO_CODE_INVALID'},{status:400})),/Kode salah/);
  }finally{await vite.close();}
});
