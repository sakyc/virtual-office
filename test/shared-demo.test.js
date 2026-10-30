import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {createSharedDemoService,validateVisitApproval,validateVisitRequest,validateGuestVisitRequest,installSharedDemoRoutes,sharedDemoFirewall} from '../server/shared-demo.js';
import {upgradeGuestDemo} from '../scripts/upgrade-deployment-guest-demo.mjs';
import {validateGuestDemoSchema} from '../server/migrations/guest-demo-contract.js';
import {SHARED_DEMO_ISSUER,sharedDemoRouteAllowed,activeSharedDemo} from '../server/shared-demo-policy.js';
import {resolveSession} from '../server/auth/sessions.js';
import {loadSessionProfile,selectActiveWorkspace} from '../server/auth/profile.js';
import {requirePlatformAdmin} from '../server/billing-catalog.js';
import {inspectMigrationDirectory} from '../server/migrations/status.js';
import {validateSharedDemoSchema} from '../server/migrations/shared-demo-contract.js';
import {upgradeSharedDemo} from '../scripts/upgrade-deployment-shared-demo.mjs';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const env={SHARED_DEMO_ENABLED:'1',BLITZMES_API_KEY:'fake-only',DEMO_CODE_SECRET:'test-only-long-shared-demo-secret-32',APP_ORIGIN:'https://app.test'};
const now=Date.now(),dt=offset=>new Date(now+offset).toISOString().replace(/\.\d{3}Z$/,'.000Z');
const approval={startsAt:dt(60000),endsAt:dt(3600000),creditIdr:1000,reason:'Permintaan presentasi produk'};
function fixture() {
  let db={control:{id:1,enabled:1,user_id:null},bookings:[],users:[{id:1,whatsapp_number:'081234567890',status:'active'},{id:2,whatsapp_number:'081234567891',status:'active'}],sessions:[],orgs:[],workspaces:[],agents:[],divisions:[],grants:[],ledger:[],audit:[],memberships:[]};
  let queue=Promise.resolve(),failSend=false,failProvision=false,time=now;
  const messages=[];
  const pool={async getConnection(){let snapshot,unlock;return {
    async beginTransaction(){const previous=queue;queue=new Promise(r=>{unlock=r;});await previous;snapshot=structuredClone(db);},
    async commit(){snapshot=null;},async rollback(){if(snapshot)db=snapshot;},release(){unlock?.();},
    async execute(raw,v=[]){const sql=raw.replace(/\s+/g,' ').trim(),b=db.bookings.find(r=>r.id===v.at(-1));
      if(sql.startsWith('INSERT INTO ')) {
        assert.equal((sql.match(/\?/g)||[]).length,v.length,'SQL placeholder/bind count must match');
        const insert=sql.match(/^INSERT INTO \w+\(([^)]+)\) VALUES \((.*)\)$/);
        if(insert)assert.equal(insert[1].split(',').length,insert[2].split(',').length,'INSERT column/value arity (MariaDB 1136)');
      }
      if(sql==='SELECT id,enabled,user_id FROM shared_demo_control WHERE id=1 FOR UPDATE')return [[db.control]];
      if(sql.startsWith('SELECT enabled'))return [[db.control]];
      if(sql.startsWith('SELECT b.id,b.company'))return [db.bookings.filter(r=>sql.includes('b.guest_token_hash=')?r.applicant_id===null && r.guest_token_hash===v[0]:r.applicant_id===v[0]).map(r=>({id:r.id,company:r.company,status:r.status}))];
      if(sql.startsWith('SELECT id,whatsapp_number,status FROM users'))return [db.users.filter(u=>u.id===v[0] && u.status==='active')];
      if(sql.startsWith('SELECT *,otp_expires_at')) {
        const found=db.bookings.find(r=>r.id===v[0] && (sql.includes('guest_token_hash=?')?r.applicant_id===null && r.guest_token_hash===v[1]:sql.includes('AND applicant_id IS NULL')?r.applicant_id===null:v.length===1 || r.applicant_id===v[1]));
        return [found?[{...found,otp_valid:found.otp_expires_at>time,cooling:found.last_sent_at>time-60000,in_window:found.send_window_at>time-86400000}]:[]];
      }
      if(sql.startsWith('SELECT id FROM shared_demo_bookings WHERE applicant_id'))return [db.bookings.filter(r=>r.applicant_id===v[0] && ['verifying','pending'].includes(r.status))];
      if(sql.startsWith('SELECT id FROM shared_demo_bookings WHERE guest_token_hash'))return [db.bookings.filter(r=>r.guest_token_hash===v[0] && (['verifying','pending'].includes(r.status) || (['approved','active'].includes(r.status)&&+r.ends_at>time)))];
      if(sql.startsWith('SELECT id FROM shared_demo_bookings WHERE phone='))return [db.bookings.filter(r=>r.phone===v[0] && r.id!==v[1] && (r.status==='pending' || (['approved','active'].includes(r.status)&&+r.ends_at>time)))];
      if(sql.startsWith('INSERT INTO shared_demo_bookings(id,applicant_id,guest_name')){db.bookings.push({id:v[0],applicant_id:null,guest_name:v[1],guest_email:v[2],guest_token_hash:v[3],company:v[4],needs:v[5],requested_at:v[6],phone:v[7],status:'verifying',enabled:1,otp_attempts:0,code_attempts:0,sends:0,send_window_at:time});return [{}];}
      if(sql.startsWith('INSERT INTO shared_demo_bookings')){db.bookings.push({id:v[0],applicant_id:v[1],company:v[2],needs:v[3],requested_at:v[4],phone:v[5],status:'verifying',enabled:1,otp_attempts:0,code_attempts:0,sends:0,send_window_at:time});return [{}];}
      if(sql.startsWith('SELECT COALESCE(SUM(sends)'))return [[{sends:db.bookings.filter(r=>r.phone===v[0] && r.send_window_at>time-86400000).reduce((s,r)=>s+r.sends,0)}]];
      if(sql.startsWith('UPDATE shared_demo_bookings SET otp_hash=') || sql.startsWith('UPDATE shared_demo_bookings SET code_hash=')) {
        const prefix=sql.includes('SET otp_hash=')?'otp':'code';
        if(sql.includes('_hash=NULL'))b[`${prefix}_hash`]=null;
        else {b[`${prefix}_hash`]=v[0];b[`${prefix}_attempts`]=0;b.otp_expires_at=time+300000;b.sends++;b.last_sent_at=time;}
        return [{}];
      }
      if(sql.startsWith('UPDATE shared_demo_bookings SET otp_attempts')){b.otp_attempts++;return [{}];}
      if(sql.startsWith('UPDATE shared_demo_bookings SET code_attempts')){b.code_attempts++;return [{}];}
      if(sql.startsWith('UPDATE shared_demo_bookings SET verified_at')){b.verified_at=time;b.otp_hash=null;b.status='pending';return [{}];}
      if(sql.startsWith('UPDATE users SET whatsapp_verified_at'))return [{}];
      if(sql.startsWith("SELECT id FROM shared_demo_bookings WHERE status IN"))return [db.bookings.filter(r=>['approved','active'].includes(r.status) && +r.starts_at<+v[0] && +r.ends_at>+v[1])];
      if(sql.startsWith("UPDATE shared_demo_bookings SET status='approved'")){Object.assign(b,{status:'approved',starts_at:v[0],ends_at:v[1],credit_idr:v[2]});return [{}];}
      if(sql.startsWith('INSERT INTO shared_demo_audit')){
        const insert=sql.match(/^INSERT INTO shared_demo_audit\(([^)]+)\) VALUES \(([^)]+)\)$/);
        assert.ok(insert,'Audit must use an explicit column list and VALUES');
        assert.equal(insert[1].split(',').length,insert[2].split(',').length,'Audit column and value counts must match (MariaDB error 1136)');
        assert.equal((insert[2].match(/\?/g)||[]).length,v.length,'Audit bind count must match supplied values');
        db.audit.push(v);return [{}];
      }
      if(sql.startsWith('UPDATE shared_demo_control SET enabled')){db.control.enabled=v[0];return [{}];}
      if(sql.startsWith('UPDATE shared_demo_bookings SET enabled')){b.enabled=v[0];return [{}];}
      if(sql.startsWith('UPDATE shared_demo_bookings SET status=?')){b.status=v[0];b.enabled=0;b.code_hash=null;return [{}];}
      if(sql.startsWith("SELECT id FROM shared_demo_bookings WHERE status='active'"))return [db.bookings.filter(r=>r.status==='active' && +r.ends_at>time)];
      if(sql.startsWith('INSERT INTO users')){db.users.push({id:100,provider_issuer:v[0],external_subject:v[1],status:'active'});return [{insertId:100}];}
      if(sql.startsWith('SELECT provider_issuer,external_subject,status FROM users'))return [db.users.filter(u=>u.id===v[0])];
      if(sql.startsWith('UPDATE shared_demo_control SET user_id')){db.control.user_id=v[0];return [{}];}
      if(sql.startsWith('UPDATE organization_memberships SET') || sql.startsWith('UPDATE workspace_memberships SET')){db.memberships.forEach(m=>m.revoked=true);return [{}];}
      if(sql.startsWith('INSERT INTO organizations')){if(failProvision)throw Error('private SQL');const id=200+db.orgs.length;db.orgs.push({id,values:v});return [{insertId:id}];}
      if(sql.startsWith('INSERT INTO workspaces')){const id=300+db.workspaces.length;db.workspaces.push({id,values:v});return [{insertId:id}];}
      if(sql.startsWith('INSERT INTO organization_memberships') || sql.startsWith('INSERT INTO workspace_memberships')){db.memberships.push({values:v,revoked:false});return [{}];}
      if(sql.startsWith('INSERT INTO workspace_divisions')){db.divisions.push(v);return [{}];}
      if(sql.startsWith('SELECT id FROM workspace_divisions'))return [[{id:v[2]}]];
      if(sql.startsWith('SELECT COUNT(*) AS count FROM workspace_agents'))return [[{count:db.agents.filter(a=>a[3]===v[2]).length}]];
      if(sql.startsWith('INSERT INTO workspace_agents')){db.agents.push(v);return [{}];}
      if(sql.startsWith('INSERT INTO billing_wallets'))return [{}];
      if(sql.startsWith('INSERT INTO billing_credit_grants')){db.grants.push(v);return [{}];}
      if(sql.startsWith('INSERT INTO billing_ledger')){db.ledger.push(v);return [{}];}
      if(sql.startsWith('INSERT INTO sessions')){const id=db.sessions.length+1;db.sessions.push({id,userId:v[0],workspaceId:v[2]});return [{insertId:id}];}
      if(sql.startsWith('UPDATE sessions SET absolute_expires_at')){db.sessions.find(s=>s.id===v[2]).endsAt=v[0];return [{}];}
      if(sql.startsWith('UPDATE sessions SET revoked_at')){db.sessions.filter(s=>sql.includes('WHERE id=')?s.id===v[0]:s.userId===v[0]).forEach(s=>s.revoked=true);return [{}];}
      if(sql.startsWith("UPDATE shared_demo_bookings SET status='active'")){Object.assign(b,{status:'active',code_hash:null,organization_id:v[0],workspace_id:v[1],session_id:v[2]});return [{}];}
      throw Error(`Unexpected SQL: ${sql}`);
    },
  };}};
  const service=createSharedDemoService({getPool:()=>pool,env,clock:()=>time,whatsapp:{async send(phone,message){messages.push({phone,message});if(failSend)throw Error('secret gateway key');}}});
  return {service,pool,db:()=>db,messages,time:()=>time,setTime:t=>{time=t;},failSend:v=>{failSend=v;},failProvision:v=>{failProvision=v;}};
}
const otp=f=>f.messages.at(-1).message.match(/\b\d{6}\b/)[0];
const code=f=>f.messages.at(-1).message.match(/KRY-VISIT-[A-F0-9]{32}/)[0];
const guest={guestHash:'b'.repeat(64)},otherGuest={guestHash:'c'.repeat(64)};
const guestBody={name:'Rifki Demo',email:'RIFKI@example.com',phone:'081234567890',company:'Acme',needs:'Mencoba tugas pemasaran',requestedAt:null};
async function guestPending(f,identity=guest,body=guestBody) {
  const {id}=await f.service.request(identity,body);
  await f.service.sendOtp(identity,id);await f.service.verify(identity,id,otp(f));return id;
}

test('guest biodata requires real fields, normalized contacts and optional future schedule; identity/role fields rejected',()=>{
  const result=validateGuestVisitRequest(guestBody,now);
  assert.equal(result.email,'rifki@example.com');assert.equal(result.phone,'+6281234567890');assert.equal(result.requestedAt,null);
  assert.ok(validateGuestVisitRequest({...guestBody,requestedAt:dt(60000)},now).requestedAt instanceof Date);
  for(const extra of [{name:'a'},{email:'bad'},{phone:'abc'},{requestedAt:''},{requestedAt:dt(-60000)},{requestedAt:dt(91*86400000)},{userId:1},{role:'admin'},{guestHash:'forged'}])assert.throws(()=>validateGuestVisitRequest({...guestBody,...extra},now));
});

test('guest request creates no personal account, list/OTP/verification are capability-bound and UUID alone reveals nothing',async()=>{
  const f=fixture(),{id}=await f.service.request(guest,guestBody);
  assert.equal(f.db().users.length,2);assert.equal(f.db().bookings[0].applicant_id,null);
  assert.equal(f.db().bookings[0].requested_at,null);assert.equal(f.db().bookings[0].guest_name,guestBody.name);
  assert.equal((await f.service.list(guest)).rows.length,1);assert.equal((await f.service.list(otherGuest)).rows.length,0);
  await assert.rejects(f.service.sendOtp(otherGuest,id),{code:'VISIT_NOT_FOUND'});
  await f.service.sendOtp(guest,id);
  await assert.rejects(f.service.verify(otherGuest,id,otp(f)),{code:'VISIT_NOT_FOUND'});
  await assert.rejects(f.service.adminAction(99,id,'approve',approval),{code:'VISIT_VERIFY_FIRST'});
  await assert.rejects(f.service.verify(guest,id,'000000'),{code:'VISIT_CODE_INVALID'});
  assert.equal(f.db().bookings[0].otp_attempts,1);
  await f.service.verify(guest,id,otp(f));assert.equal(f.db().bookings[0].status,'pending');
  assert.equal(f.db().users.length,2);assert.equal(f.db().sessions.length,0);
  await assert.rejects(f.service.request(guest,guestBody),{code:'VISIT_REQUEST_EXISTS'});
});

test('verified phone cannot have duplicate pending bookings; send budget persists across browser capabilities',async()=>{
  const f=fixture(),id=await guestPending(f),second=(await f.service.request(otherGuest,guestBody)).id;
  f.setTime(now+61000);await f.service.sendOtp(otherGuest,second);
  await assert.rejects(f.service.verify(otherGuest,second,otp(f)),{code:'VISIT_REQUEST_EXISTS'});
  f.db().bookings.find(b=>b.id===id).sends=10;f.setTime(now+122000);
  await assert.rejects(f.service.sendOtp(otherGuest,second),{code:'VISIT_SEND_LIMIT'});
});

test('guest access works on another device without applicant/capability, remains scheduled, single-use and audited',async()=>{
  const f=fixture(),id=await guestPending(f);
  await f.service.adminAction(99,id,'approve',approval);f.setTime(now+61000);
  await f.service.adminAction(99,id,'send-code',{reason:'Kirim kode untuk presentasi'});
  const access=code(f),message=f.messages.at(-1).message;
  assert.match(message,new RegExp(`/scheduled-demo\\?booking=${id}`));assert.match(message,/Tidak perlu login/);
  assert.doesNotMatch(message,/guest_token|guestHash/);
  const results=await Promise.allSettled([f.service.enter({guestEntry:true},id,access),f.service.enter({guestEntry:true},id,access)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(f.db().divisions.length,6);assert.equal(f.db().grants.length,1);assert.equal(f.db().sessions.length,1);
  assert.equal(f.db().audit.find(a=>a[3]==='enter')[2],null);
  assert.equal(f.db().users.filter(u=>u.provider_issuer===SHARED_DEMO_ISSUER).length,1);
});

test('guest access rejects legacy account bookings and persists five failed code attempts across browsers',async()=>{
  const legacy=fixture(),a=await approved(legacy);
  await assert.rejects(legacy.service.enter({guestEntry:true},a.id,a.code),{code:'VISIT_NOT_FOUND'});
  const f=fixture(),id=await guestPending(f);await f.service.adminAction(99,id,'approve',approval);f.setTime(now+61000);
  await f.service.adminAction(99,id,'send-code',{reason:'Kode untuk pengujian'});
  const access=code(f);
  f.setTime(now);await assert.rejects(f.service.enter({guestEntry:true},id,access),{code:'VISIT_WINDOW_CLOSED'});f.setTime(now+61000);
  for(let i=0;i<5;i++)await assert.rejects(f.service.enter({guestEntry:true},id,'wrong'),{code:'VISIT_CODE_INVALID'});
  assert.equal(f.db().bookings[0].code_attempts,5);
  await assert.rejects(f.service.enter({guestEntry:true},id,access),{code:'VISIT_CODE_EXPIRED'});
});

test('guest OTP expiration, send failures and provisioning rollback remain fail-closed without personal accounts',async()=>{
  const f=fixture(),{id}=await f.service.request(guest,guestBody);
  f.failSend(true);await assert.rejects(f.service.sendOtp(guest,id),{code:'VISIT_SEND_UNCONFIRMED'});
  assert.equal(f.db().bookings[0].sends,1);assert.equal(f.db().bookings[0].otp_hash,null);
  f.failSend(false);f.setTime(now+61000);await f.service.sendOtp(guest,id);const oldOtp=otp(f);
  f.setTime(now+400000);await assert.rejects(f.service.verify(guest,id,oldOtp),{code:'VISIT_CODE_EXPIRED'});
  await f.service.sendOtp(guest,id);await f.service.verify(guest,id,otp(f));
  const terms={...approval,startsAt:dt(500000),endsAt:dt(3600000)};
  await f.service.adminAction(99,id,'approve',terms);f.setTime(now+501000);await f.service.adminAction(99,id,'send-code',{reason:'Kode pengujian rollback'});
  f.failProvision(true);await assert.rejects(f.service.enter({guestEntry:true},id,code(f)));
  assert.equal(f.db().users.length,2);assert.equal(f.db().orgs.length,0);assert.equal(f.db().sessions.length,0);assert.ok(f.db().bookings[0].code_hash);
});
async function pending(f,user=1) {
  const {id}=await f.service.request(user,{company:'Acme',needs:'Mencoba tugas pemasaran',requestedAt:dt(240000)});
  await f.service.sendOtp(user,id);await f.service.verify(user,id,otp(f));return id;
}
async function approved(f,user=1,terms=approval) {
  const id=await pending(f,user);await f.service.adminAction(99,id,'approve',terms);
  f.setTime(f.time()+61000);await f.service.adminAction(99,id,'send-code',{reason:'Kirim kode demo'});return {id,code:code(f)};
}

test('request and approval enforce exact fields, future schedule, bounded duration and rupiah budget',()=>{
  assert.equal(validateVisitRequest({company:'Acme',needs:'Tes produk',requestedAt:dt(60000)},now).company,'Acme');
  for(const body of [{company:'A',needs:'x',requestedAt:dt(60000)},{company:'Acme',needs:'Tes produk',requestedAt:dt(-60000)},{company:'Acme',needs:'Tes produk',requestedAt:dt(60000),userId:9}])assert.throws(()=>validateVisitRequest(body,now));
  assert.equal(validateVisitApproval(approval,now).creditIdr,1000);
  for(const extra of [{creditIdr:10001},{creditIdr:'1000'},{endsAt:dt(12*3600000)},{startsAt:dt(-60000)},{reason:'x'},{userId:9}])assert.throws(()=>validateVisitApproval({...approval,...extra},now));
});

test('global activation/deactivation binds exactly five audit values including nullable booking, and persists both actions',async()=>{
  const f=fixture();
  await f.service.adminAction(99,null,'control',{enabled:false,reason:'Nonaktifkan demo bersama'});
  assert.equal(f.db().control.enabled,false);
  await f.service.adminAction(99,null,'control',{enabled:true,reason:'Aktifkan demo bersama'});
  assert.equal(f.db().control.enabled,true);
  assert.deepEqual(f.db().audit.map(row=>row.slice(1)),[
    [null,99,'disable_global','Nonaktifkan demo bersama'],
    [null,99,'enable_global','Aktifkan demo bersama'],
  ]);
  assert.ok(f.db().audit.every(row=>row.length===5));
});

test('OTP and access codes are distinct, hashed, applicant-bound; failed attempts persist and messages never return secrets',async()=>{
  const f=fixture();const {id}=await f.service.request(1,{company:'Acme',needs:'Tes produk',requestedAt:dt(60000)});
  await f.service.sendOtp(1,id);const original=otp(f),b=f.db().bookings[0];assert.notEqual(b.otp_hash,original);
  await assert.rejects(f.service.verify(2,id,original),{code:'VISIT_NOT_FOUND'});
  await assert.rejects(f.service.verify(1,id,'000000'),{code:'VISIT_CODE_INVALID'});assert.equal(f.db().bookings[0].otp_attempts,1);
  await f.service.verify(1,id,original);assert.equal(f.db().bookings[0].status,'pending');assert.equal(f.db().bookings[0].otp_hash,null);
  await f.service.adminAction(99,id,'approve',approval);f.setTime(now+61000);
  const result=await f.service.adminAction(99,id,'send-code',{reason:'Kode akses'});
  assert.deepEqual(result,{sent:true});assert.notEqual(f.db().bookings[0].code_hash,code(f));
  await assert.rejects(f.service.enter(2,id,code(f)),{code:'VISIT_NOT_FOUND'});
  assert.doesNotMatch(JSON.stringify(result),/KRY-VISIT|hash|token/);
});

test('failed WA sends commit send budgets but invalidate the undelivered code',async()=>{
  const f=fixture();const {id}=await f.service.request(1,{company:'Acme',needs:'Tes produk',requestedAt:dt(60000)});
  f.failSend(true);await assert.rejects(f.service.sendOtp(1,id),{code:'VISIT_SEND_UNCONFIRMED'});
  assert.equal(f.db().bookings[0].otp_hash,null);assert.equal(f.db().bookings[0].sends,1);
  await assert.rejects(f.service.sendOtp(1,id),{code:'VISIT_SEND_LIMIT'});
  f.setTime(now+61000);f.failSend(false);await f.service.sendOtp(1,id);assert.equal(f.db().bookings[0].sends,2);
  f.db().bookings[0].sends=10;f.setTime(now+122000);await assert.rejects(f.service.sendOtp(1,id),{code:'VISIT_SEND_LIMIT'});
});

test('five wrong OTP attempts block verification; phone changes cannot redirect codes or redeem access',async()=>{
  const f=fixture();const {id}=await f.service.request(1,{company:'Acme',needs:'Tes produk',requestedAt:dt(60000)});
  await f.service.sendOtp(1,id);const original=otp(f);
  for(let i=0;i<5;i++)await assert.rejects(f.service.verify(1,id,'000000'),{code:'VISIT_CODE_INVALID'});
  await assert.rejects(f.service.verify(1,id,original),{code:'VISIT_CODE_EXPIRED'});
  f.db().users[0].whatsapp_number='081299999999';await assert.rejects(f.service.sendOtp(1,id),{code:'VISIT_PHONE_CHANGED'});
});

test('concurrent admin approvals serialize and reject overlapping visits, including paused reservations',async()=>{
  const f=fixture(),one=await pending(f),two=await pending(f,2);
  const results=await Promise.allSettled([f.service.adminAction(99,one,'approve',approval),f.service.adminAction(99,two,'approve',approval)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'VISIT_SCHEDULE_CONFLICT');
  await f.service.adminAction(99,one,'pause',{reason:'Jeda sebentar'});
  await assert.rejects(f.service.adminAction(99,two,'approve',approval),{code:'VISIT_SCHEDULE_CONFLICT'});
  await f.service.adminAction(99,one,'end',{reason:'Jadwal dibatalkan'});
  await f.service.adminAction(99,two,'approve',approval);
});

test('single use entry atomically creates one internal user, six divisions, credit, one session and consumed code',async()=>{
  const f=fixture(),a=await approved(f);
  const results=await Promise.allSettled([f.service.enter(1,a.id,a.code),f.service.enter(1,a.id,a.code)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const db=f.db();assert.equal(db.users.filter(u=>u.provider_issuer===SHARED_DEMO_ISSUER).length,1);
  assert.equal(db.orgs.length,1);assert.equal(db.divisions.length,6);assert.equal(db.agents.length,21);
  assert.equal(db.grants.length,1);assert.equal(db.grants[0][3],1000);assert.equal(+db.grants[0].at(-1),+new Date(approval.endsAt));
  assert.equal(db.sessions.length,1);assert.equal(+db.sessions[0].endsAt,+new Date(approval.endsAt));assert.equal(db.bookings[0].code_hash,null);
  assert.equal(db.audit.filter(a=>a[3]==='enter').length,1);
});

test('next visitor reuses the same account but cannot inherit old office, membership, session or credit',async()=>{
  const f=fixture(),a=await approved(f);await f.service.enter(1,a.id,a.code);
  await f.service.adminAction(99,a.id,'end',{reason:'Sesi pertama selesai'});
  // Advance the later visit without changing the real fixture's approval clock.
  const b=await approved(f,2,{...approval,startsAt:dt(120000),endsAt:dt(3700000),creditIdr:500});
  f.setTime(now+121000);await f.service.enter(2,b.id,b.code);
  const db=f.db();assert.equal(db.users.filter(u=>u.provider_issuer===SHARED_DEMO_ISSUER).length,1);
  assert.equal(db.orgs.length,2);assert.notEqual(db.bookings[0].organization_id,db.bookings[1].organization_id);
  assert.notEqual(db.bookings[0].workspace_id,db.bookings[1].workspace_id);assert.equal(db.sessions[0].revoked,true);
  assert.equal(db.memberships.filter(m=>!m.revoked).length,2);assert.equal(db.grants.length,2);assert.equal(db.grants[1][3],500);
  assert.equal(db.divisions.length,12);assert.equal(db.bookings[0].status,'ended');
});

test('misconfigured shared account pointer never repurposes a real customer account',async()=>{
  const f=fixture(),a=await approved(f);f.db().control.user_id=1;
  await assert.rejects(f.service.enter(1,a.id,a.code),{code:'VISIT_INTERNAL_ACCOUNT_INVALID'});
  assert.equal(f.db().orgs.length,0);assert.equal(f.db().sessions.length,0);assert.ok(f.db().bookings[0].code_hash);
});

test('entry rejects early/expired windows, paused booking/global switch, wrong codes, and rolls back failed provisioning',async()=>{
  const f=fixture(),a=await approved(f);f.setTime(now);
  await assert.rejects(f.service.enter(1,a.id,a.code),{code:'VISIT_WINDOW_CLOSED'});f.setTime(now+61000);
  await f.service.adminAction(99,a.id,'pause',{reason:'Pause akses'});await assert.rejects(f.service.enter(1,a.id,a.code),{code:'VISIT_PAUSED'});
  await f.service.adminAction(99,a.id,'resume',{reason:'Buka kembali'});
  await f.service.adminAction(99,null,'control',{enabled:false,reason:'Tutup global'});await assert.rejects(f.service.enter(1,a.id,a.code),{code:'VISIT_PAUSED'});
  await f.service.adminAction(99,null,'control',{enabled:true,reason:'Buka global'});
  await assert.rejects(f.service.enter(1,a.id,'wrong'),{code:'VISIT_CODE_INVALID'});assert.equal(f.db().bookings[0].code_attempts,1);
  f.failProvision(true);await assert.rejects(f.service.enter(1,a.id,a.code));assert.equal(f.db().orgs.length,0);assert.equal(f.db().users.length,2);assert.ok(f.db().bookings[0].code_hash);
  f.failProvision(false);f.setTime(now+3600001);await assert.rejects(f.service.enter(1,a.id,a.code),{code:'VISIT_WINDOW_CLOSED'});
});

test('every shared session resolution requires enabled control, live booking, matching session/workspace; off switch fails closed',async t=>{
  const old=process.env.SHARED_DEMO_ENABLED;t.after(()=>{if(old===undefined)delete process.env.SHARED_DEMO_ENABLED;else process.env.SHARED_DEMO_ENABLED=old;});
  const row={id:7,user_id:100,active_workspace_id:300,provider_issuer:SHARED_DEMO_ISSUER,user_status:'active',idle_expires_at:new Date(now+3600000),absolute_expires_at:new Date(now+3600000)};
  let visit={id:'booking',ends_at:new Date(now+3600000)},calls=[];
  const c={execute:async(sql,v)=>{calls.push({sql,v});return sql.includes('JOIN users')?[[row]]:sql.startsWith('SELECT b.id')?[visit?[visit]:[]]:[{}];}};
  process.env.SHARED_DEMO_ENABLED='0';assert.equal(await resolveSession(c,'a'.repeat(43)),null);
  process.env.SHARED_DEMO_ENABLED='1';const p=await resolveSession(c,'a'.repeat(43));assert.equal(p.sharedDemo.bookingId,'booking');
  const q=calls.find(q=>q.sql.startsWith('SELECT b.id'));assert.match(q.sql,/d.enabled=1/);assert.match(q.sql,/b.status='active' AND b.enabled=1/);assert.deepEqual(q.v.slice(0,3),[100,7,300]);
  visit=null;assert.equal(await resolveSession(c,'a'.repeat(43)),null);
  assert.equal(await selectActiveWorkspace(c,p,999),false);
});

test('profile hides old workspaces even if stale membership rows survive',async()=>{
  const c={execute:async sql=>sql.includes('SELECT id, email')?[[{id:100,email:'demo@internal.invalid'}]]:[[{workspace_id:300,organization_id:200,organization_role:'owner'},{workspace_id:301,organization_id:201,organization_role:'owner'}]]};
  const p=await loadSessionProfile(c,{userId:100,activeWorkspaceId:301,sharedDemo:{bookingId:'b'}});
  assert.equal(p.workspaces.length,1);assert.equal(p.workspaces[0].id,301);assert.equal(p.sharedDemo.bookingId,'b');
});

test('shared identity is default-denied from billing purchases, invitations, password/profile changes, workspace switching and admin',()=>{
  for(const [method,path] of [['POST','/api/account/password'],['POST','/api/account/profile'],['POST','/api/onboarding'],['POST','/auth/active-workspace'],['POST','/api/payments/checkout'],['GET','/api/payments'],['POST','/api/workspace/members/invitations'],['GET','/api/admin/demo'],['GET','/api/shared-demo'],['POST','/api/future-endpoint']])assert.equal(sharedDemoRouteAllowed(method,path),false,path);
  for(const [method,path] of [['GET','/auth/me'],['POST','/auth/logout'],['POST','/api/office/chat'],['GET','/api/team'],['POST','/api/dashboard/jobs'],['GET','/api/billing']])assert.equal(sharedDemoRouteAllowed(method,path),true,path);
});

test('shared demo entitlement is server-side and expires before any new AI reserve',async()=>{
  let calls=0;
  const c={execute:async(sql,v)=>{calls++;assert.match(sql,/b.status='active' AND b.enabled=1/);assert.match(sql,/b.ends_at>UTC_TIMESTAMP/);assert.deepEqual(v,[200]);return [[{organization_id:200,workspace_id:300}]];}};
  assert.equal(await activeSharedDemo(c,200,{}),null);assert.equal(calls,0);
  assert.equal((await activeSharedDemo(c,200,env)).shared,true);
});

async function http(app,t) {
  const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>s.close());return `http://127.0.0.1:${s.address().port}`;
}

test('public HTTP guest flow issues only private cookie, never returns capability/token; another browser cannot view or verify it',async t=>{
  const f=fixture(),app=express();app.use(express.json());
  installSharedDemoRoutes(app,{env:{...env,NODE_ENV:'production'},getPool:()=>f.pool,service:f.service});
  const base=await http(app,t),headers={Origin:env.APP_ORIGIN,'Content-Type':'application/json'};
  const post=(path,body,cookie)=>fetch(base+path,{method:'POST',headers:{...headers,...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  const response=await post('/api/shared-demo',guestBody),body=await response.json();
  assert.equal(response.status,200);assert.deepEqual(Object.keys(body),['id']);
  const cookieHeader=response.headers.get('set-cookie'),cookie=cookieHeader.split(';')[0];
  assert.match(cookieHeader,/HttpOnly/);assert.match(cookieHeader,/SameSite=Lax/);assert.match(cookieHeader,/Secure/);assert.match(cookieHeader,/Path=\/api\/shared-demo/);
  assert.match(cookie,/vo_demo_guest=[a-f0-9]{64}$/);assert.notEqual(cookie.split('=')[1],f.db().bookings[0].guest_token_hash);
  assert.equal((await (await fetch(base+'/api/shared-demo')).json()).rows.length,0);
  assert.equal((await (await fetch(base+'/api/shared-demo',{headers:{Cookie:cookie}})).json()).rows.length,1);
  assert.equal((await post(`/api/shared-demo/${body.id}/otp`,{})).status,404);
  assert.equal((await post(`/api/shared-demo/${body.id}/otp`,{},cookie)).status,200);
  assert.equal((await post(`/api/shared-demo/${body.id}/verify`,{code:otp(f)})).status,404);
  assert.equal((await post(`/api/shared-demo/${body.id}/verify`,{code:otp(f)},cookie)).status,200);
  await f.service.adminAction(99,body.id,'approve',approval);f.setTime(now+61000);await f.service.adminAction(99,body.id,'send-code',{reason:'Kode HTTP guest flow'});
  const entered=await post(`/api/shared-demo/${body.id}/enter`,{code:code(f)});
  assert.equal(entered.status,200);assert.match(entered.headers.get('set-cookie'),/^vo_session=/);
  assert.doesNotMatch(JSON.stringify(await entered.json()),/token|hash|KRY-VISIT/);
});

test('public HTTP rejects forged identity, missing origin, malformed biodata; service/storage failures are not reported as missing config',async t=>{
  const f=fixture(),app=express();app.use(express.json());
  installSharedDemoRoutes(app,{env,getPool:()=>f.pool,service:f.service});const base=await http(app,t);
  for(const body of [{...guestBody,userId:1},{...guestBody,phone:'bad'},{...guestBody,creditIdr:10000}]) {
    const r=await fetch(base+'/api/shared-demo',{method:'POST',headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal(r.status,400);
  }
  assert.equal((await fetch(base+'/api/shared-demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(guestBody)})).status,403);
  assert.equal(f.db().bookings.length,0);assert.equal(f.messages.length,0);
  const broken=express();broken.use(express.json());installSharedDemoRoutes(broken,{env,getPool:()=>f.pool,service:{list:async()=>{throw Error('private SQL/password');}}});
  const r=await fetch((await http(broken,t))+'/api/shared-demo');assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'VISIT_SERVICE_ERROR'});
  const disabled=express();installSharedDemoRoutes(disabled,{env:{...env,SHARED_DEMO_ENABLED:'0'},getPool:()=>f.pool});
  assert.deepEqual(await (await fetch((await http(disabled,t))+'/api/shared-demo')).json(),{code:'VISIT_UNAVAILABLE'});
});
test('HTTP allows public guest status but rejects unauthenticated admin, cross origin and forged fields',async t=>{
  let calls=0;const app=express();app.use(express.json());
  installSharedDemoRoutes(app,{env,getPool:()=>({getConnection:async()=>({execute:async()=>[[]],release(){}})}),service:new Proxy({},{get(){return ()=>{calls++;return {rows:[],accepting:true};};}})});
  const base=await http(app,t);
  assert.equal((await fetch(base+'/api/shared-demo')).status,200);
  for(const [body,origin,status] of [[{},'https://evil.test',403],[{code:'x',userId:1},env.APP_ORIGIN,400]]) {
    const r=await fetch(base+'/api/shared-demo/00000000-0000-0000-0000-000000000000/enter',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,status);
  }
  assert.equal((await fetch(base+'/api/admin/demo')).status,401);assert.equal(calls,1);
});

test('HTTP firewall and platform guard deny the real shared principal while allowing scoped chat and logout',async t=>{
  const old=process.env.SHARED_DEMO_ENABLED;process.env.SHARED_DEMO_ENABLED='1';t.after(()=>{if(old===undefined)delete process.env.SHARED_DEMO_ENABLED;else process.env.SHARED_DEMO_ENABLED=old;});
  const c={release(){},execute:async sql=>{
    if(sql.includes('JOIN users'))return [[{id:7,user_id:100,provider_issuer:SHARED_DEMO_ISSUER,active_workspace_id:300,user_status:'active',idle_expires_at:new Date(Date.now()+60000),absolute_expires_at:new Date(Date.now()+60000)}]];
    if(sql.startsWith('SELECT b.id'))return [[{id:'visit',ends_at:new Date(Date.now()+60000)}]];
    if(sql.includes('FROM platform_admins'))assert.fail('Shared principal must be denied before checking grants');
    return [{}];
  }};
  const app=express();app.use(sharedDemoFirewall({getPool:()=>({getConnection:async()=>c})}));
  app.get('/api/admin/demo',(_r,s)=>s.json({leak:true}));app.post('/api/account/password',(_r,s)=>s.json({leak:true}));app.post('/api/office/chat',(_r,s)=>s.json({ok:true}));
  const base=await http(app,t),headers={Cookie:`vo_session=${'a'.repeat(43)}`};
  assert.equal((await fetch(base+'/api/admin/demo',{headers})).status,403);
  assert.equal((await fetch(base+'/api/account/password',{method:'POST',headers})).status,403);
  assert.equal((await fetch(base+'/api/office/chat',{method:'POST',headers})).status,200);
  await assert.rejects(requirePlatformAdmin(c,{headers:{cookie:headers.Cookie}}),{code:'PLATFORM_ADMIN_REQUIRED'});
});

test('019 migration is additive, guarded, no destructive reset or hardcoded model allowlist; schema catches missing security structures',async()=>{
  const m=await inspectMigrationDirectory(fileURLToPath(new URL('../migrations',import.meta.url)));
  assert.equal(m.diagnostics.length,0);
  assert.doesNotMatch(m.migrations.find(m=>m.id==='019_scheduled_demo').source,/DROP |ALTER |DELETE FROM|INSERT INTO users/i);
  const missing=await validateSharedDemoSchema({execute:async sql=>sql.startsWith('SELECT COUNT')?[[{count:0}]]:[[]]});
  assert.ok(missing.some(d=>d.index==='uq_shared_demo_session'));assert.ok(missing.some(d=>d.constraint==='ck_shared_demo_window'));assert.ok(missing.some(d=>d.constraint==='fk_shared_booking_applicant'));
  const source=await readFile(new URL('../server/shared-demo.js',import.meta.url),'utf8');assert.doesNotMatch(source,/claude-haiku|claude-sonnet|allowedModels|DELETE FROM/);
});

test('upgrade validates exact target and prior history, refuses pending/partial schema, and applies only 019',async()=>{
  const report=await inspectMigrationDirectory(fileURLToPath(new URL('../migrations',import.meta.url))),migrations=report.migrations.slice(0,19);
  let partial=false,applied=0;
  const c={execute:async sql=>{
    if(sql.startsWith('SELECT DATABASE'))return [[{db:'app'}]];
    if(sql.includes('FROM schema_migrations'))return [migrations.slice(0,18).map(m=>({migration_id:m.id,status:'applied',checksum:m.checksum}))];
    if(sql.includes('information_schema.tables'))return [partial?[{table_name:'shared_demo_bookings'}]:[]];
    throw Error(sql);
  }};
  const options={apply:true,validate:async()=>({validation:{valid:true,differences:[]}}),applyPending:async()=>{applied++;return [{name:'019_scheduled_demo'}];}};
  await assert.rejects(upgradeSharedDemo(c,'other',migrations,options),/MISMATCH/);
  await assert.rejects(upgradeSharedDemo(c,'app',migrations),/PENDING/);
  partial=true;await assert.rejects(upgradeSharedDemo(c,'app',migrations,options),/WITHOUT_HISTORY/);assert.equal(applied,0);
  partial=false;const result=await upgradeSharedDemo(c,'app',migrations,options);assert.deepEqual(result.applied,['019_scheduled_demo']);assert.equal(applied,1);
});

test('020 upgrade refuses wrong target, missing history, partial DDL; applies only additive guest migration and validates',async()=>{
  const {migrations,diagnostics}=await inspectMigrationDirectory(fileURLToPath(new URL('../migrations',import.meta.url)));
  assert.equal(diagnostics.length,0);assert.equal(migrations.at(-1).id,'020_guest_scheduled_demo');
  assert.doesNotMatch(migrations.at(-1).source,/DROP |DELETE FROM|INSERT INTO users|TRUNCATE/i);
  let partial=false,nullable=false,historyLength=19,applied=0,valid=true;
  const c={execute:async sql=>{
    if(sql.startsWith('SELECT DATABASE'))return [[{db:'app'}]];
    if(sql.includes('FROM schema_migrations'))return [migrations.slice(0,historyLength).map(m=>({migration_id:m.id,status:'applied',checksum:m.checksum}))];
    if(sql.includes('is_nullable='))return [nullable?[{column_name:'applicant_id'}]:[]];
    if(sql.includes('information_schema.columns'))return [partial?[{column_name:'guest_name'}]:[]];
    throw Error(sql);
  }};
  const options={apply:true,validate:async()=>({validation:{valid,differences:[]}}),applyPending:async()=>{applied++;return [{name:'020_guest_scheduled_demo'}];}};
  await assert.rejects(upgradeGuestDemo(c,'other',migrations,options),/MISMATCH/);
  await assert.rejects(upgradeGuestDemo(c,'app',migrations),/PENDING/);
  historyLength=18;await assert.rejects(upgradeGuestDemo(c,'app',migrations,options),/HISTORY/);historyLength=19;
  partial=true;await assert.rejects(upgradeGuestDemo(c,'app',migrations,options),/PARTIAL/);partial=false;
  nullable=true;await assert.rejects(upgradeGuestDemo(c,'app',migrations,options),/PARTIAL/);nullable=false;
  valid=false;await assert.rejects(upgradeGuestDemo(c,'app',migrations,options),/BASE_SCHEMA/);valid=true;assert.equal(applied,0);
  assert.deepEqual((await upgradeGuestDemo(c,'app',migrations,options)).applied,['020_guest_scheduled_demo']);
  historyLength=20;await upgradeGuestDemo(c,'app',migrations,options);assert.equal(applied,1);
  valid=false;await assert.rejects(upgradeGuestDemo(c,'app',migrations,options),/SCHEMA_INVALID/);
  const missing=await validateGuestDemoSchema({execute:async()=>[[]]});
  assert.ok(missing.some(d=>d.column==='guest_token_hash'));assert.ok(missing.some(d=>d.constraint==='ck_shared_demo_guest_identity'));
});

test('public and admin UI expose request, OTP, scheduling and audit without mixing up Trial',async()=>{
  const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'silent'});
  try {
    const {ScheduledDemoPage}=await vite.ssrLoadModule('/src/react/shared-demo.jsx');
    const {AdminDemo}=await vite.ssrLoadModule('/src/react/admin-demo.jsx');
    const {AdminSidebar}=await vite.ssrLoadModule('/src/react/admin-billing.jsx');
    assert.match(renderToStaticMarkup(React.createElement(ScheduledDemoPage)),/DEMO TERJADWAL/);
    assert.match(renderToStaticMarkup(React.createElement(AdminDemo,{onDenied(){}})),/satu pengunjung aktif/);
    assert.match(renderToStaticMarkup(React.createElement(AdminSidebar,{section:'demo',onNavigate(){}})),/href="\/admin\/demo"/);
  }finally{await vite.close();}
});
