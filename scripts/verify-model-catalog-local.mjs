import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import express from 'express';
import { migrationConnectionOptions, connectApprovedNonProduction } from '../server/migrations/database.js';
import { seedModelCatalog, readModelCatalog } from '../server/model-catalog.js';
import { createLiveChatModelCatalog } from '../server/live-chat-models.js';
import { installBillingAdministrationRoutes } from '../server/billing-administration.js';
import { issueSession } from '../server/auth/sessions.js';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';

let c,server,step='target';
try {
  assert.equal(process.env.MODEL_CATALOG_LOCAL_VERIFY,'1');
  const options=migrationConnectionOptions();assert.notEqual(process.env.NODE_ENV,'production');
  assert(['localhost','127.0.0.1','::1'].includes(options.host));assert.equal(options.port,3306);assert.equal(options.database,'virtual_office');
  c=await connectApprovedNonProduction();
  const [[target]]=await c.execute('SELECT DATABASE() AS db,@@datadir AS datadir');
  assert.equal(target.db,'virtual_office');assert.match(target.datadir.replaceAll('\\','/'),/^C:\/laragon\/data\/mysql-8\//i);
  const validation=await validateCurrentSchema(c,{requireTenantFoundation:true,requireNativeCredentials:true,requireAiUsage:true,requireWorkspaceTeam:true,requireChatHistory:true,requireChatModelSelection:true,requireModelCatalog:true});
  assert.deepEqual(validation,{valid:true,differences:[]});
  const fingerprint=async()=>{
    const result={};for(const table of ['users','sessions','platform_admins','ai_models','billing_model_tariffs','billing_operations_audit']) {
      const [rows]=await c.query('SELECT * FROM `'+table+'`');
      result[table]=createHash('sha256').update(JSON.stringify(rows.map(row=>JSON.stringify(row)).sort())).digest('hex');
    }return result;
  };
  const before=await fingerprint();await c.beginTransaction();
  const tag='catalog-'+randomUUID(),model='fixture-'+randomUUID();
  const [user]=await c.execute('INSERT INTO users(provider_issuer,external_subject,email) VALUES (?,?,?)',['https://fixture.invalid',tag,tag+'@example.invalid']);
  await c.execute('INSERT INTO platform_admins(user_id,approval_reference) VALUES (?,?)',[user.insertId,tag]);
  const session=await issueSession(c,{userId:user.insertId});
  const metadata=[{id:model,display_name:'Claude Sonnet 5',lifecycle:'active',max_input_tokens:200000,max_tokens:8000}];
  step='seed-idempotency';assert.deepEqual(await seedModelCatalog(c,metadata),{inserted:1});
  assert.deepEqual(await seedModelCatalog(c,metadata),{inserted:0});
  const [[record]]=await c.execute('SELECT * FROM ai_models WHERE provider_model_id=?',[model]);assert(record);
  step='database-constraints';
  await assert.rejects(c.execute('INSERT INTO ai_models(id,provider,provider_model_id,display_name,lifecycle,seed_reference) VALUES (?,?,?,?,?,?)',[randomUUID(),'anthropic',model,'duplicate','active','fixture']),e=>e.code==='ER_DUP_ENTRY');
  await assert.rejects(c.execute("UPDATE ai_models SET provider='unimplemented' WHERE id=?",[record.id]),e=>e.code==='ER_CHECK_CONSTRAINT_VIOLATED');
  await assert.rejects(c.execute('UPDATE ai_models SET enabled=2 WHERE id=?',[record.id]),e=>e.code==='ER_CHECK_CONSTRAINT_VIOLATED');
  let failAudit=false;
  const execute=(sql,args)=>{if(failAudit && sql.startsWith('INSERT INTO billing_operations_audit'))throw Error('Injected audit failure');return c.execute(sql,args);};
  const adapter={execute,beginTransaction:()=>c.query('SAVEPOINT model_operation'),commit:()=>c.query('RELEASE SAVEPOINT model_operation'),rollback:()=>c.query('ROLLBACK TO SAVEPOINT model_operation'),release(){}};
  const catalog=createLiveChatModelCatalog({models:{team:model,leader:model},databaseOnly:true,readTariffs:()=>readModelCatalog(c)});
  const app=express();app.use(express.json());installBillingAdministrationRoutes(app,{getPool:()=>({getConnection:async()=>adapter}),modelCatalog:catalog,readModels:readModelCatalog,env:{AUTH_PROVIDER:'native',APP_ORIGIN:'http://localhost:5173'}});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const request=(path,method='GET',body,cookie='vo_session='+session.token)=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{Cookie:cookie,Origin:'http://localhost:5173','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  step='session-and-admin-list';assert.equal((await request('/api/admin/models','GET',null,'')).status,401);
  const response=await request('/api/admin/models');assert.equal(response.status,200);
  const initial=(await response.json()).models.find(row=>row.model===model);assert(initial.selectable);assert.equal(initial.catalogId,record.id);
  const body={requestId:randomUUID(),reason:'Rollback-only model verification',expectedVersion:0,enabled:false,sourceReference:'https://fixture.invalid/pricing',tariff:initial.tariff,confirmedProviderPricing:true};
  const path='/api/admin/billing/tariffs/'+model;
  step='disable-idempotency-and-seed-preservation';
  assert.equal((await request(path,'PUT',body)).status,200);assert.equal((await request(path,'PUT',body)).status,200);
  await seedModelCatalog(c,metadata);await assert.rejects(catalog.resolveTariff(model));
  const disabled=(await readModelCatalog(c)).find(row=>row.model===model);assert.equal(disabled.enabled,0);assert.equal(disabled.version,1);
  const [[audit]]=await c.execute('SELECT COUNT(*) AS n FROM billing_operations_audit WHERE model=?',[model]);assert.equal(audit.n,1);
  const enable={...body,requestId:randomUUID(),expectedVersion:1,enabled:true};
  step='audit-failure-rolls-back-enable';failAudit=true;assert.equal((await request(path,'PUT',enable)).status,503);await assert.rejects(catalog.resolveTariff(model));
  failAudit=false;assert.equal((await request(path,'PUT',enable)).status,200);assert.equal((await catalog.resolveTariff(model)).inputUsdPerMillion,'2');
  step='missing-catalog-and-revoked-session';
  assert.equal((await request('/api/admin/billing/tariffs/unpersisted-fixture-model','PUT',{...body,requestId:randomUUID()})).status,409);
  await c.execute('UPDATE sessions SET revoked_at=UTC_TIMESTAMP() WHERE id=?',[session.id]);assert.equal((await request('/api/admin/models')).status,401);
  await c.rollback();assert.deepEqual(await fingerprint(),before,'FIXTURE_DATA_NOT_ROLLED_BACK');
  console.log(JSON.stringify({database:target.db,validation,checks:8,fixtureChangesRolledBack:true,paidProviderCalls:0}));
} catch(error) {
  await c?.rollback().catch(()=>{});console.error(JSON.stringify({failed:true,step,code:error.code||'MODEL_CATALOG_LOCAL_FAILED'}));process.exitCode=1;
} finally {
  if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
  await c?.end();
}
