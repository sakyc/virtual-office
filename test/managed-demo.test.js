import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createManagedDemoAccount,changeManagedDemo,managedDemoFirewall,installManagedDemoRoutes} from '../server/managed-demo.js';
import {MANAGED_DEMO_ISSUER,assertManagedDemoAi} from '../server/managed-demo-policy.js';
import {hashSessionToken,resolveSession} from '../server/auth/sessions.js';
import {verifyPassword} from '../server/auth/passwords.js';
import {installAuthRoutes} from '../server/auth/auth-routes.js';
import {activeDemo,demoEntitlements} from '../server/demo-policy.js';
import {createBillingService} from '../server/billing.js';
import {trialTiming} from '../shared/trial.js';
import {teamTemplates} from '../shared/workspace-team.js';
import {inspectMigrationDirectory} from '../server/migrations/status.js';
import {upgradeManagedDemo} from '../scripts/upgrade-deployment-managed-demo.mjs';
import {validateManagedDemoSchema} from '../server/migrations/managed-demo-contract.js';

const password='Lentera!9Kantor',adminToken='a'.repeat(40),demoToken='d'.repeat(40),env={AUTH_PROVIDER:'native',APP_ORIGIN:'http://localhost:5173'};
const body={name:'Kantor Demo',email:'demo@example.test',password,creditIdr:1000,reason:'Pembuatan akun untuk presentasi'};
function fixture(){
  let state={account:null,hash:null,status:'active',divisions:[],agents:[],audit:[],grants:[],ledger:[],sessions:[],failAudit:false};const calls=[];let snapshot;
  const c={release(){},async beginTransaction(){snapshot=structuredClone(state);},async commit(){snapshot=null;},async rollback(){if(snapshot)state=snapshot;},async execute(raw,v=[]){const sql=raw.replace(/\s+/g,' ').trim();calls.push({sql,v});assert.equal((sql.match(/\?/g)||[]).length,v.length,sql);
    if(sql.startsWith('SELECT s.id')){const isAdmin=Buffer.from(v[0]).equals(hashSessionToken(adminToken));const isDemo=Buffer.from(v[0]).equals(hashSessionToken(demoToken))||state.sessions.some(s=>Buffer.from(s.hash).equals(v[0]));if(!isAdmin&&!isDemo)return [[]];return [[{id:isAdmin?99:20,user_id:isAdmin?99:7,active_workspace_id:isAdmin?null:9,user_status:isAdmin?'active':state.status,provider_issuer:isAdmin?'urn:virtual-office:native':MANAGED_DEMO_ISSUER,revoked_at:!isAdmin&&state.revoked?new Date():null,idle_expires_at:new Date(Date.now()+60000),absolute_expires_at:new Date(Date.now()+60000)}]];}
    if(sql.startsWith('SELECT user_id FROM platform_admins'))return [[{user_id:99}]];
    if(sql.startsWith('SELECT c.user_id'))return [state.hash&&v[0]===body.email?[{user_id:7,password_hash:state.hash,status:state.status,provider_issuer:MANAGED_DEMO_ISSUER}]:[]];
    if(sql.startsWith('SELECT id FROM users'))return [state.status==='active'?[{id:7}]:[]];
    if(sql.startsWith('SELECT id, email, display_name'))return [[{id:7,email:body.email,display_name:body.name}]];
    if(sql.includes('FROM workspaces w'))return [[{workspace_id:9,workspace_name:'Kantor Demo',workspace_slug:'main',organization_id:8,organization_slug:'demo',organization_name:'Kantor Demo',organization_role:'owner'}]];
    if(sql.startsWith('SELECT d.user_id AS userId'))return [state.account?[{userId:7,email:body.email,name:body.name,loginStatus:state.status,aiEnabled:state.account.ai_enabled,version:state.account.version,availableIdr:'1000'}]:[]];
    if(sql.startsWith('SELECT id,actor_user_id'))return [state.audit];
    if(sql.includes('FROM managed_demo_accounts')){if(!state.account)return [[]];if(sql.startsWith('SELECT d.user_id'))return [[{...state.account,provider_issuer:MANAGED_DEMO_ISSUER}]];return [[state.account]];}
    if(sql.startsWith('SELECT id FROM organizations'))return [[{id:8}]];
    if(sql.startsWith('SELECT id FROM workspace_divisions'))return [state.divisions.filter(d=>d.id===v[2])];
    if(sql.startsWith('SELECT COUNT(*) AS count FROM workspace_agents'))return [[{count:state.agents.filter(a=>a.division===v[2]).length}]];
    if(sql.startsWith('INSERT INTO users'))return [{insertId:7}];
    if(sql.startsWith('INSERT INTO native_credentials')){state.hash=v[2];return [{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO organizations'))return [{insertId:8}];
    if(sql.startsWith('INSERT INTO workspaces'))return [{insertId:9}];
    if(sql.startsWith('INSERT INTO organization_memberships')||sql.startsWith('INSERT INTO workspace_memberships'))return [{}];
    if(sql.startsWith('INSERT INTO workspace_divisions')){state.divisions.push({id:v[0]});return [{}];}
    if(sql.startsWith('INSERT INTO workspace_agents')){state.agents.push({division:v[3]});return [{}];}
    if(sql.startsWith('INSERT INTO billing_wallets'))return [{}];
    if(sql.startsWith('INSERT INTO billing_credit_grants')){state.grants.push(v);return [{}];}
    if(sql.startsWith('INSERT INTO billing_ledger')){state.ledger.push(v);return [{}];}
    if(sql.startsWith('INSERT INTO managed_demo_accounts')){state.account={id:1,user_id:7,organization_id:8,workspace_id:9,ai_enabled:0,version:1};return [{}];}
    if(sql.startsWith('INSERT INTO managed_demo_audit')){if(state.failAudit)throw Error('secret DB detail');state.audit.push({id:v[0],action:v[2],reason:v[3]});return [{}];}
    if(sql.startsWith('UPDATE managed_demo_accounts SET ai_enabled')){state.account.ai_enabled=v[0];return [{}];}
    if(sql.startsWith('UPDATE managed_demo_accounts SET version')){state.account.version++;return [{}];}
    if(sql.startsWith('UPDATE users SET status')){state.status=v[0];return [{}];}
    if(sql.startsWith('UPDATE users SET last_login'))return [{}];
    if(sql.startsWith('UPDATE native_credentials')){state.hash=v[0];return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE sessions SET revoked_at')){state.revoked=true;return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE sessions SET last_seen'))return [{}];
    if(sql.startsWith('INSERT INTO sessions')){state.sessions.push({hash:v[1],workspace:v[2]});state.revoked=false;return [{insertId:20}];}
    throw Error(`Unexpected SQL: ${sql}`);
  }};
  return {c,calls,state:()=>state,pool:{getConnection:async()=>c}};
}
async function server(t,f){const app=express();app.use(express.json());app.use(managedDemoFirewall({getPool:()=>f.pool}));installAuthRoutes(app,{getPool:()=>f.pool,env});installManagedDemoRoutes(app,{getPool:()=>f.pool,env});let providerCalls=0;app.all(['/api/office/chat','/api/dashboard/jobs','/api/dashboard/items/1/revise'],(_q,r)=>{providerCalls++;r.json({ok:true});});app.get('/api/office/conversations',(_q,r)=>r.json({ok:true}));const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>{s.closeAllConnections();s.close();});return {providerCalls:()=>providerCalls,request:(path,{method='GET',token=adminToken,body,origin=env.APP_ORIGIN}={})=>fetch(`http://127.0.0.1:${s.address().port}${path}`,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Cookie:`vo_session=${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})})};}

test('create managed demo seeds six divisions, hashes password, grants finite credit once and audits without secrets',async()=>{const f=fixture();const result=await createManagedDemoAccount(f.c,99,body);assert.equal(result.aiEnabled,false);assert.equal(f.state().divisions.length,6);assert.equal(f.state().agents.length,teamTemplates.slice(0,6).reduce((n,t)=>n+Math.min(4,t.agents.length),0));assert(await verifyPassword(password,f.state().hash));assert.notEqual(f.state().hash,password);assert.equal(f.state().grants.length,1);assert.equal(f.state().ledger.length,1);assert.equal(f.state().grants[0].at(-1),1000);assert(!JSON.stringify([result,f.state().audit]).includes(password));await assert.rejects(createManagedDemoAccount(f.c,99,body),{code:'MANAGED_DEMO_EXISTS'});});

test('creation rejects invalid or forged fields before inserts',async()=>{for(const invalid of [{...body,userId:4},{...body,creditIdr:100001},{...body,password:'weak'},{...body,reason:'x'},{...body,email:'invalid'}]){const f=fixture();await assert.rejects(createManagedDemoAccount(f.c,99,invalid));assert.equal(f.calls.filter(q=>q.sql.startsWith('INSERT')).length,0);}});

test('AI toggle keeps sessions and credits; login/password actions revoke sessions, conflict guard protects updates',async()=>{const f=fixture();await createManagedDemoAccount(f.c,99,body);const change=(action,extra)=>changeManagedDemo(f.c,99,action,{expectedVersion:f.state().account.version,reason:'Presentasi oleh admin',...extra});await change('ai',{enabled:true});assert.equal(f.state().account.ai_enabled,true);assert(!f.state().revoked);await change('ai',{enabled:false});assert(!f.state().revoked);assert.equal(f.state().grants.length,1);await assert.rejects(changeManagedDemo(f.c,99,'ai',{expectedVersion:1,reason:'Data versi lama',enabled:true}),{code:'MANAGED_DEMO_VERSION_CONFLICT'});await change('password',{password:'Ruang!8Kantor'});assert(await verifyPassword('Ruang!8Kantor',f.state().hash));assert(f.state().revoked);await change('login',{enabled:false});assert.equal(f.state().status,'suspended');await change('login',{enabled:true});assert.equal(f.state().status,'active');assert.equal(f.state().audit.length,6);});

test('native login selects demo workspace; AI disabled retains authenticated profile and session; suspended login fails',async t=>{const f=fixture();await createManagedDemoAccount(f.c,99,body);const s=await server(t,f);let r=await s.request('/auth/login',{method:'POST',token:null,body:{email:body.email,password}});assert.equal(r.status,200);assert.equal(f.state().sessions.at(-1).workspace,9);r=await s.request('/auth/me',{token:demoToken});assert.equal(r.status,200);const profile=await r.json();assert.equal(profile.managedDemo.aiEnabled,false);assert.equal(profile.activeWorkspace.id,9);assert.equal(profile.workspaces.length,1);f.state().status='suspended';assert.equal(await resolveSession(f.c,demoToken),null);assert.equal((await s.request('/auth/login',{method:'POST',token:null,body:{email:body.email,password}})).status,401);});

test('demo firewall denies paid work before handler while retaining history; default denies privileged mutations',async t=>{const f=fixture();await createManagedDemoAccount(f.c,99,body);const s=await server(t,f);for(const path of ['/api/office/chat','/api/dashboard/jobs','/api/dashboard/items/1/revise']){const r=await s.request(path,{method:'POST',token:demoToken,body:{}});assert.equal(r.status,402);assert.equal((await r.json()).code,'MANAGED_DEMO_AI_DISABLED');}assert.equal(s.providerCalls(),0);assert.equal((await s.request('/api/office/conversations',{token:demoToken})).status,200);for(const path of ['/api/admin/managed-demo','/api/payments/checkout','/auth/password','/auth/profile','/api/members','/auth/active-workspace'])assert.equal((await s.request(path,{method:'POST',token:demoToken,body:{}})).status,403);f.state().account.ai_enabled=true;assert.equal((await s.request('/api/office/chat',{method:'POST',token:demoToken,body:{}})).status,200);assert.equal(s.providerCalls(),1);});

test('AI disabled is enforced at wallet reservation even if another paid subscription exists',async()=>{const calls=[];const c={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},async execute(sql){calls.push(sql);if(sql.includes('FROM managed_demo_accounts'))return [[{ai_enabled:0}]];if(sql.includes('SELECT w.organization_id'))return [[{organization_id:8}]];if(sql.startsWith('SELECT request_hash'))return [[]];if(sql.startsWith('INSERT INTO billing_wallets'))return [{}];throw Error('No paid query or provider must run');}};const billing=createBillingService(()=>({getConnection:async()=>c}));await assert.rejects(billing.reserve({organizationId:8,key:'managed:test-reserve',amountIdr:'100'}),{code:'MANAGED_DEMO_AI_DISABLED'});assert(!calls.some(q=>q.includes('FROM billing_subscriptions')));await assert.rejects(assertManagedDemoAi(c,8),{status:402});const demo=await activeDemo(c,8,{});assert.equal(demoEntitlements(demo).canUseAi,false);assert.equal(demoEntitlements(demo).maxDivisions,6);assert.equal(trialTiming(demo).label,'Demo · AI nonaktif');});

test('admin endpoints require platform session and same origin; failed audit rolls back entire creation',async t=>{const f=fixture(),s=await server(t,f);assert.equal((await s.request('/api/admin/managed-demo',{token:null})).status,401);assert.equal((await s.request('/api/admin/managed-demo',{method:'POST',body,origin:'https://evil.test'})).status,403);f.state().failAudit=true;const failed=await s.request('/api/admin/managed-demo',{method:'POST',body});assert.equal(failed.status,503);assert(!JSON.stringify(await failed.json()).includes('secret'));assert.equal(f.state().account,null);assert.equal(f.state().divisions.length,0);f.state().failAudit=false;assert.equal((await s.request('/api/admin/managed-demo',{method:'POST',body})).status,200);const r=await s.request('/api/admin/managed-demo');const data=await r.json();assert.equal(data.account.email,body.email);assert(!JSON.stringify(data).includes(password));});

test('022 is additive; upgrade validates source, history, backup target and refuses partial DDL',async()=>{const report=await inspectMigrationDirectory(fileURLToPath(new URL('../migrations',import.meta.url))),migrations=report.migrations;assert.equal(report.diagnostics.length,0);assert.equal(migrations.at(-1).id,'022_managed_demo_account');assert.doesNotMatch(migrations.at(-1).source,/DROP |DELETE FROM|INSERT INTO users|TRUNCATE/i);let length=21,partial=false,valid=true,applied=0;const c={async execute(sql){if(sql.startsWith('SELECT DATABASE'))return [[{db:'app'}]];if(sql.includes('FROM schema_migrations'))return [migrations.slice(0,length).map(m=>({migration_id:m.id,status:'applied',checksum:m.checksum}))];if(sql.includes('information_schema.tables'))return [partial?[{table_name:'managed_demo_accounts'}]:[]];throw Error(sql);}};const options={apply:true,validate:async()=>({validation:{valid,differences:[]}}),applyPending:async()=>{applied++;return [{name:'022_managed_demo_account'}];}};await assert.rejects(upgradeManagedDemo(c,'other',migrations,options),/MISMATCH/);await assert.rejects(upgradeManagedDemo(c,'app',migrations),/PENDING/);partial=true;await assert.rejects(upgradeManagedDemo(c,'app',migrations,options),/PARTIAL/);partial=false;valid=false;await assert.rejects(upgradeManagedDemo(c,'app',migrations,options),/BASE_SCHEMA/);valid=true;assert.equal(applied,0);assert.deepEqual((await upgradeManagedDemo(c,'app',migrations,options)).applied,['022_managed_demo_account']);length=22;await upgradeManagedDemo(c,'app',migrations,options);assert.equal(applied,1);length=20;await assert.rejects(upgradeManagedDemo(c,'app',migrations,options),/HISTORY/);assert((await validateManagedDemoSchema({execute:async()=>[[]]})).some(d=>d.constraint==='fk_managed_demo_user'));});

test('managed demo UI distinguishes AI toggle from login and never presents Trial expiry or purchase',async()=>{const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',logLevel:'silent'});try{const {ManagedDemoBanner}=await vite.ssrLoadModule('/src/react/managed-demo-banner.jsx');const {AdminManagedDemo}=await vite.ssrLoadModule('/src/react/admin-managed-demo.jsx');const {BillingContent}=await vite.ssrLoadModule('/src/react/billing-page.jsx');assert.match(renderToStaticMarkup(React.createElement(AdminManagedDemo)),/login dengan password/);assert.match(renderToStaticMarkup(React.createElement(ManagedDemoBanner,{demo:{aiEnabled:false}})),/AI nonaktif/);const html=renderToStaticMarkup(React.createElement(BillingContent,{data:{demo:{managed:true,active:true,aiEnabled:false},plans:[],grants:[],entitlements:{active:true}}}));assert.match(html,/AI sedang dinonaktifkan/);assert.doesNotMatch(html,/Trial berakhir|Pilih ruang untuk berkembang|undefined hari/);}finally{await vite.close();}});
