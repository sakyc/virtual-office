import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { installBillingAdministrationRoutes,administerBilling,validateActivation,validateTariff,nextMonthlyPeriod,resolveBillingTariff } from '../server/billing-administration.js';
import { hashSessionToken } from '../server/auth/sessions.js';
import { inspectMigrationDirectory } from '../server/migrations/status.js';
import { validateBillingSchema } from '../server/migrations/billing-contract.js';
import { billingOperationRequest } from '../src/react/billing-operations-data.js';
import { createLiveChatModelCatalog } from '../server/live-chat-models.js';
import { defaultModelTariffRows } from '../server/default-model-tariffs.js';
import { modelStatusUpdate, modelTariffRecord } from '../src/react/admin-models-data.js';

const token='a'.repeat(43);
const activation=(change={})=>({requestId:randomUUID(),planCode:'starter',expectedPlanVersion:1,periodStart:new Date().toISOString().slice(0,10)+'T00:00:00.000Z',approvalReference:'fixture-approved-only',customTerms:null,reason:'Fixture manual approval',confirmedManualActivation:true,...change});
const tariff=(change={})=>({requestId:randomUUID(),expectedVersion:0,enabled:true,sourceReference:'https://fixture.invalid/pricing',reason:'Fixture not a real provider price',confirmedProviderPricing:true,tariff:{inputUsdPerMillion:'2',outputUsdPerMillion:'10',cacheReadUsdPerMillion:'0.1',maxInputTokens:100,maxOutputTokens:20,verifiedAt:new Date(Date.now()-60000).toISOString(),validUntil:new Date(Date.now()+86400000).toISOString()},...change});
function fixture() {
  let state={audit:[],tariffs:[],grants:[],subscriptions:[],ledger:[],wallets:[],revoked:false,admin:true,failAudit:false,divisions:0,members:1,orgStatus:'active',planVersion:1},queue=Promise.resolve();
  const calls=[];
  async function execute(sql,v=[]) {
    calls.push({sql,v});
    if(sql.includes('FROM sessions s JOIN users'))return [Buffer.from(v[0]).equals(hashSessionToken(token))?[{id:9,user_id:7,active_workspace_id:null,revoked_at:state.revoked?new Date():null,user_status:'active',idle_expires_at:new Date(Date.now()+60000),absolute_expires_at:new Date(Date.now()+60000)}]:[]];
    if(sql.startsWith('UPDATE sessions SET last_seen'))return [{}];
    if(sql.startsWith('SELECT id FROM ai_models'))return [[{id:'fixture-catalog-id'}]];
    if(sql.includes('FROM platform_admins WHERE'))return [state.admin?[{user_id:7}]:[]];
    if(sql.startsWith('SELECT request_hash,after_snapshot'))return [state.audit.filter(r=>r.actor===v[0]&&r.requestId===v[1])];
    if(sql.startsWith('SELECT id,status FROM organizations'))return [v[0]===3?[{id:3,status:state.orgStatus}]:[]];
    if(sql.startsWith('INSERT INTO billing_wallets')){state.wallets.push(v[0]);return [{}];}
    if(sql.startsWith('SELECT w.organization_id'))return [[{organization_id:v[0]}]];
    if(sql.startsWith('SELECT request_hash, result FROM billing_ledger'))return [state.ledger.filter(r=>r.org===v[0]&&r.key===v[1])];
    if(sql.startsWith('SELECT id FROM billing_subscriptions'))return [state.subscriptions.filter(r=>r.org===v[0])];
    if(sql.includes('FROM billing_plans'))return [[{code:v[0],version:state.planVersion,name:'Starter',monthlyPriceIdr:'149000',includedCreditIdr:'50000',maxDivisions:1,maxMembers:2,agentsPerDivision:4,whatsapp:0,quoteRequired:v[0]==='custom'?1:0,isPublic:1}]];
    if(sql.startsWith('SELECT\n          (SELECT COUNT(*)'))return [[{divisions:state.divisions,members:state.members}]];
    if(sql.startsWith('INSERT INTO billing_subscriptions')){state.subscriptions.push({org:v[0],id:v[1],version:v[3],price:v[4]});return [{}];}
    if(sql.startsWith('INSERT INTO billing_credit_grants')){state.grants.push({id:v[0],org:v[1],amount:v[4]});return [{}];}
    if(sql.startsWith('INSERT INTO billing_ledger')){state.ledger.push({org:v[1],key:v[2],request_hash:v[3],result:v[6]});return [{}];}
    if(sql.startsWith('INSERT INTO billing_operations_audit')){if(state.failAudit)throw new Error('private DB secret');state.audit.push({actor:v[1],requestId:v[5],request_hash:v[6],after_snapshot:v[8],action:v[4]});return [{}];}
    if(sql.includes('FROM billing_operations_audit ORDER BY'))return [state.audit];
    if(sql.includes('FROM billing_model_tariffs'))return [v.length?structuredClone(state.tariffs.filter(r=>r.model===v[0])):structuredClone(state.tariffs)];
    if(sql.startsWith('INSERT INTO billing_model_tariffs')){state.tariffs.push({model:v[0],version:v[1],enabled:v[2],tariff:v[3],sourceReference:v[4]});return [{}];}
    if(sql.startsWith('UPDATE billing_model_tariffs')){Object.assign(state.tariffs.find(r=>r.model===v[5]),{version:v[0],enabled:v[1],tariff:v[2],sourceReference:v[3]});return [{affectedRows:1}];}
    throw Error('Unexpected SQL: '+sql);
  }
  const pool={async getConnection(){let snapshot,unlock;return {execute,async beginTransaction(){const before=queue;queue=new Promise(r=>{unlock=r;});await before;snapshot=structuredClone(state);},async commit(){snapshot=null;},async rollback(){if(snapshot)state=snapshot;},release(){unlock?.();}};}};
  let discoveryCalls=0;
  const seeded=defaultModelTariffRows([{id:'fixture-model',display_name:'Claude Sonnet 5',max_input_tokens:200000,max_tokens:8000}]);
  const readModels=async()=>{const rows=state.tariffs;return rows.length?rows:seeded;};
  const modelCatalog=createLiveChatModelCatalog({models:{team:'fixture-model',leader:'fixture-model'},
    client:{models:{list:async()=>{discoveryCalls++;return {data:[{id:'fixture-model',display_name:'Claude Sonnet 5',max_input_tokens:200000,max_tokens:8000}],has_more:false};}}},
    readTariffs:readModels});
  const app=express();app.use(express.json());installBillingAdministrationRoutes(app,{getPool:()=>pool,modelCatalog,readModels,env:{AUTH_PROVIDER:'native',APP_ORIGIN:'http://localhost:5173'}});
  return {app,pool,execute,calls,state:()=>state,modelCatalog,discoveryCalls:()=>discoveryCalls};
}
async function serve(t,f){const s=f.app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>new Promise(r=>{s.close(r);s.closeAllConnections();}));return(path,method='GET',body,headers={})=>fetch(`http://127.0.0.1:${s.address().port}${path}`,{method,headers:{Cookie:`vo_session=${token}`,Origin:'http://localhost:5173','Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});}

test('manual activation requires real platform grant, active session and same-origin JSON; browser identity claims cannot grant funding',async t=>{
  const f=fixture(),request=await serve(t,f),path='/api/admin/organizations/3/subscription';
  assert.equal((await request(path,'POST',activation(),{Cookie:''})).status,401);
  f.state().admin=false;assert.equal((await request(path,'POST',activation(),{'x-role':'platform_admin','x-user-id':'7'})).status,403);
  f.state().admin=true;f.state().revoked=true;assert.equal((await request(path,'POST',activation())).status,401);f.state().revoked=false;
  for(const headers of [{Origin:'https://evil.invalid'},{Origin:''},{'Content-Type':'text/plain'}])assert.equal((await request(path,'POST',activation(),headers)).status,403);
  assert.equal((await request(path,'POST',activation({actorUserId:7}))).status,400);
  assert.equal((await request(path,'POST',activation({confirmedManualActivation:false}))).status,400);
  assert.equal(f.state().subscriptions.length,0);assert.equal(f.state().grants.length,0);
});
test('activation atomically snapshots plan, grants monthly balance, audits real actor and deduplicates retries',async t=>{
  const f=fixture(),request=await serve(t,f),body=activation(),path='/api/admin/organizations/3/subscription';
  const first=await request(path,'POST',body);assert.equal(first.status,200);const result=await first.json();
  assert.equal(result.terms.credit,'50000');assert.equal(result.activationType,'manual_admin');assert.equal(result.organizationId,3);
  assert.deepEqual(await (await request(path,'POST',body)).json(),result);assert.equal(f.state().grants.length,1);assert.equal(f.state().audit.length,1);assert.equal(f.state().audit[0].actor,7);
  assert.equal((await request(path,'POST',{...body,reason:'Changed payload same key'})).status,409);
  assert.equal((await request(path,'POST',activation())).status,409);assert.equal(f.state().grants.length,1);
  assert.equal((await request('/api/admin/billing/operations')).status,200);
});
test('stale catalog, capacity, inactive/unknown organization and audit failure roll back all activation writes',async t=>{
  for(const change of [s=>{s.planVersion=2;},s=>{s.divisions=2;},s=>{s.members=3;},s=>{s.orgStatus='suspended';},s=>{s.failAudit=true;}]){
    const f=fixture();change(f.state());const request=await serve(t,f);const response=await request('/api/admin/organizations/3/subscription','POST',activation());
    assert([409,503].includes(response.status));assert.doesNotMatch(await response.text(),/private|secret/);assert.equal(f.state().grants.length,0);assert.equal(f.state().subscriptions.length,0);assert.equal(f.state().audit.length,0);
  }
  const f=fixture(),request=await serve(t,f);assert.equal((await request('/api/admin/organizations/99/subscription','POST',activation())).status,404);
});
test('concurrent activations cannot grant twice; Custom requires explicit negotiated values',async t=>{
  const f=fixture(),request=await serve(t,f);
  const responses=await Promise.all([activation(),activation()].map(b=>request('/api/admin/organizations/3/subscription','POST',b)));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(f.state().grants.length,1);
  const custom=fixture(),req=await serve(t,custom);
  assert.equal((await req('/api/admin/organizations/3/subscription','POST',activation({planCode:'custom'}))).status,400);
  const r=await req('/api/admin/organizations/3/subscription','POST',activation({planCode:'custom',customTerms:{price:'1000000',credit:'200000',divisions:4,members:10,whatsapp:true}}));
  assert.equal(r.status,200);assert.equal((await r.json()).terms.credit,'200000');
});
test('monthly periods clamp month ends and reject expired periods, invalid dates and standard-plan price overrides',()=>{
  assert.equal(nextMonthlyPeriod('2028-01-31T00:00:00.000Z'),'2028-02-29T00:00:00.000Z');assert.equal(nextMonthlyPeriod('2027-01-31T00:00:00.000Z'),'2027-02-28T00:00:00.000Z');
  assert.throws(()=>validateActivation(activation({periodStart:'2026-02-30T00:00:00.000Z'})));
  assert.throws(()=>validateActivation(activation({periodStart:'2020-01-01T00:00:00.000Z'})));
  assert.throws(()=>validateActivation(activation({customTerms:{price:'1'}})));
});
test('tariff versions, approval and source are audited; runtime denies missing/disabled/expired tariffs, with no env fallback',async t=>{
  const f=fixture(),request=await serve(t,f),body=tariff(),path='/api/admin/billing/tariffs/fixture-model';
  const r=await request(path,'PUT',body);assert.equal(r.status,200);const saved=await r.json();assert.equal(saved.version,1);
  assert.deepEqual(await (await request(path,'PUT',body)).json(),saved);assert.equal(f.state().audit.length,1);
  assert.equal((await request(path,'PUT',tariff())).status,409);
  const resolved=await resolveBillingTariff({execute:f.execute},'fixture-model');assert.equal(resolved.catalogVersion,1);assert.equal(resolved.inputUsdPerMillion,'2');
  await assert.rejects(resolveBillingTariff({execute:f.execute},'missing'));
  const disabled=await request(path,'PUT',tariff({expectedVersion:1,enabled:false}));assert.equal(disabled.status,200);await assert.rejects(resolveBillingTariff({execute:f.execute},'fixture-model'));
  assert.equal(f.state().tariffs[0].version,2);assert.equal(f.state().audit.length,2);
});
test('tariff validation rejects unconfirmed, unknown fields, wrong units, unsafe source, stale dates; failed audit rolls back',async t=>{
  for(const extra of [{confirmedProviderPricing:false},{actorUserId:7},{sourceReference:'http://fixture.invalid'},{sourceReference:'https://user:secret@fixture.invalid/pricing'},{sourceReference:'https://fixture.invalid/?token=secret'},{tariff:{...tariff().tariff,inputUsdPerMillion:2}},{tariff:{...tariff().tariff,validUntil:'2020-01-01'}}])assert.throws(()=>validateTariff('fixture-model',tariff(extra)));
  const f=fixture(),request=await serve(t,f);f.state().failAudit=true;
  assert.equal((await request('/api/admin/billing/tariffs/fixture-model','PUT',tariff())).status,503);assert.equal(f.state().tariffs.length,0);
});
test('exact historical retries return stored success even after validity expired; new requests fail closed',async t=>{
  const f=fixture(),request=await serve(t,f),body=tariff();await request('/api/admin/billing/tariffs/fixture-model','PUT',body);
  const future=Date.now()+365*86400000;
  const result=await administerBilling({execute:f.execute},{userId:7},'update_tariff','fixture-model',body,{now:future});assert.equal(result.version,1);
  await assert.rejects(resolveBillingTariff({execute:f.execute},'fixture-model',future));
});
test('012 is additive with no seeded rates or funded organizations and validates audit uniqueness/foreign keys',async()=>{
  const report=await inspectMigrationDirectory(fileURLToPath(new URL('../migrations',import.meta.url)));assert.deepEqual(report.diagnostics,[]);
  const m=report.migrations.find(m=>m.id==='012_billing_administration');assert.match(m.checksum,/^[a-f0-9]{64}$/);assert.doesNotMatch(m.source,/^\s*(INSERT|UPDATE|DELETE|DROP|ALTER)\b/im);
  const diff=await validateBillingSchema({execute:async()=>[[]]},{billingAdmin:true});assert(diff.some(d=>d.constraint==='ck_billing_operation_scope'));assert(diff.some(d=>d.index==='uq_billing_operation_request'));assert(diff.some(d=>d.constraint==='fk_model_tariff_actor'));
});
test('browser billing transport uses same-origin credentials and never exposes a generic funding endpoint',async()=>{
  const body=activation();await billingOperationRequest('/api/admin/organizations/3/subscription',{method:'POST',body},async(path,options)=>{assert.equal(options.credentials,'same-origin');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),body);return {ok:true,json:async()=>({})};});
  await assert.rejects(billingOperationRequest('/api/admin/billing/topup',{method:'POST',body}));
});

test('tariff reads/writes require platform privileges and disabled authentication never opens billing administration',async t=>{
  const f=fixture(),request=await serve(t,f);
  f.state().admin=false;
  assert.equal((await request('/api/admin/billing/operations')).status,403);
  assert.equal((await request('/api/admin/billing/tariffs/fixture-model','PUT',tariff(),{'x-role':'platform_admin'})).status,403);
  const app=express();app.use(express.json());let opened=false;
  installBillingAdministrationRoutes(app,{getPool:()=>{opened=true;throw new Error('must not connect');},env:{AUTH_PROVIDER:'auth0',AUTH0_ENABLED:'0',APP_ORIGIN:'http://localhost:5173'}});
  const disabled=await serve(t,{app});
  for(const [path,method,body] of [['/api/admin/billing/operations','GET'],['/api/admin/organizations/3/subscription','POST',activation()],['/api/admin/billing/tariffs/fixture-model','PUT',tariff()]])assert.equal((await disabled(path,method,body)).status,503);
  assert.equal(opened,false);assert.equal(f.state().audit.length,0);
});

test('admin model list is session/grant protected before provider discovery, rejects tenant filters and never writes prices on GET',async t=>{
  const f=fixture(),request=await serve(t,f);
  assert.equal((await request('/api/admin/models','GET',null,{Cookie:''})).status,401);
  f.state().admin=false;assert.equal((await request('/api/admin/models','GET',null,{'x-role':'platform_admin'})).status,403);
  assert.equal(f.discoveryCalls(),0);
  f.state().admin=true;f.state().revoked=true;assert.equal((await request('/api/admin/models')).status,401);
  f.state().revoked=false;
  assert.equal((await request('/api/admin/models?organizationId=3')).status,400);
  const res=await request('/api/admin/models');assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');
  const data=await res.json();assert.equal(data.models.length,1);assert.equal(data.models[0].source,'owner-screenshot-20261025-v1');
  assert.equal(data.models[0].tariff.inputUsdPerMillion,'2');assert.equal(data.models[0].enabled,true);
  assert.equal(data.models[0].version,0);assert.equal(data.models[0].selectable,true);
  assert(!Object.hasOwn(data.models[0].tariff,'approvalReference'));
  assert.equal(f.state().tariffs.length,0);assert.equal(f.state().audit.length,0);
});

test('model status changes persist overrides, deny new use server-side, audit once, recover on enable and reject stale versions',async t=>{
  const f=fixture(),request=await serve(t,f),path='/api/admin/billing/tariffs/fixture-model';
  const initial=(await (await request('/api/admin/models')).json()).models[0];
  const body=modelStatusUpdate(initial,{requestId:randomUUID(),reason:'Disable model for maintenance',confirmed:true});
  assert.equal((await request(path,'PUT',body,{Origin:'https://evil.invalid'})).status,403);
  assert.equal((await request(path,'PUT',body)).status,200);
  assert.equal((await request(path,'PUT',body)).status,200);assert.equal(f.state().audit.length,1);
  await assert.rejects(f.modelCatalog.resolveTariff('fixture-model'),{code:'AI_BILLING_PRICING_REQUIRED'});
  const disabled=(await (await request('/api/admin/models')).json()).models[0];
  assert.equal(disabled.enabled,false);assert.equal(disabled.selectable,false);assert.equal(disabled.version,1);assert.equal(disabled.source,'admin');
  assert.deepEqual(disabled.tariff,initial.tariff,'status change does not change the token prices/limits/dates');
  assert.equal((await request(path,'PUT',{...body,requestId:randomUUID()})).status,409);
  const enabled=modelStatusUpdate(disabled,{requestId:randomUUID(),reason:'Re-enable after maintenance',confirmed:true});
  assert.equal((await request(path,'PUT',enabled)).status,200);
  assert.equal((await f.modelCatalog.resolveTariff('fixture-model')).inputUsdPerMillion,'2');assert.equal(f.state().audit.length,2);
  f.state().admin=false;
  assert.equal((await request(path,'PUT',{...enabled,requestId:randomUUID()})).status,403);
});

test('model edit uses the same versioned audit path; failed audit rolls back status, while expired prices cannot be re-enabled',async t=>{
  const f=fixture(),request=await serve(t,f),path='/api/admin/billing/tariffs/fixture-model';
  const initial=(await (await request('/api/admin/models')).json()).models[0];
  f.state().failAudit=true;
  assert.equal((await request(path,'PUT',modelStatusUpdate(initial,{requestId:randomUUID(),reason:'Try disable while audit is down',confirmed:true}))).status,503);
  assert.equal(f.state().tariffs.length,0);assert.equal((await (await request('/api/admin/models')).json()).models[0].selectable,true);
  f.state().failAudit=false;
  const record=modelTariffRecord(initial);
  assert.equal((await request(path,'PUT',tariff({tariff:{...record.tariff,inputUsdPerMillion:'4'},sourceReference:record.sourceReference}))).status,200);
  assert.equal((await f.modelCatalog.resolveTariff('fixture-model')).inputUsdPerMillion,'4');
  assert.equal((await request(path,'PUT',tariff({expectedVersion:1,enabled:true,tariff:{...record.tariff,validUntil:'2020-01-01'}}))).status,400);
  assert.equal(f.state().audit.length,1);
});
