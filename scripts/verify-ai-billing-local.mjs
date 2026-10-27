import 'dotenv/config';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { migrationConnectionOptions } from '../server/migrations/database.js';
import { inspectMigrationDirectory, inspectDatabaseHistory } from '../server/migrations/status.js';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';
import { createBillingService } from '../server/billing.js';
import { createAiBilling } from '../server/ai-billing.js';
import { createUsageStore, trackedClient } from '../server/ai-usage.js';
import { issueSession } from '../server/auth/sessions.js';
import { addDivision } from '../server/workspace-team.js';
import { assertPaidAccess } from '../server/billing-enforcement.js';

// No second database, no provider network, no persisted subscription/funding.
// Savepoint adapter is for this verifier ONLY, never application runtime.
assert.equal(process.env.AI_BILLING_LOCAL_VERIFY, '1');
const options = migrationConnectionOptions();
assert(['127.0.0.1','localhost','::1'].includes(options.host));
assert.equal(options.port,3306); assert.equal(options.database,'virtual_office'); assert.notEqual(process.env.NODE_ENV,'production');
let c, outer=false;
try {
  c=await mysql.createConnection(options);
  const [[identity]]=await c.execute('SELECT DATABASE() AS db,@@datadir AS datadir');
  assert.equal(identity.db,'virtual_office');assert.match(identity.datadir.replaceAll('\\','/'),/^C:\/laragon\/data\/mysql-8\//i);
  const manifest=await inspectMigrationDirectory(fileURLToPath(new URL('../migrations',import.meta.url)));
  const history=await inspectDatabaseHistory(c,manifest.migrations);
  assert.deepEqual(manifest.diagnostics,[]);assert.deepEqual(history.diagnostics,[]);
  assert(history.history.some(h=>h.migration_id==='011_ai_billing_attempts' && h.status==='applied'));
  const validation=await validateCurrentSchema(c,{requireTenantFoundation:true,requireNativeCredentials:true,requireAiUsage:true,requireWorkspaceTeam:true,requireChatHistory:true,requireChatModelSelection:true,requireBilling:true,requireAdminCatalog:true,requirePlatformAdminAudit:true,requireAiBilling:true});
  assert.deepEqual(validation,{valid:true,differences:[]});
  const tables=['users','organizations','workspaces','organization_memberships','sessions','workspace_divisions','ai_usage','ai_billing_attempts','billing_subscriptions','billing_wallets','billing_holds','billing_credit_grants','billing_ledger'];
  const counts=async()=>{const rows={};for(const table of tables){const [[r]]=await c.execute(`SELECT COUNT(*) AS n FROM ${table}`);rows[table]=r.n;}return rows;};
  const before=await counts(), tag=`aibill-${randomUUID()}`;
  await c.beginTransaction();outer=true;
  const [user]=await c.execute('INSERT INTO users(provider_issuer,external_subject,email) VALUES (?,?,?)',['https://fixture.invalid',tag,`${tag}@example.invalid`]);
  const userId=user.insertId;
  const [org]=await c.execute('INSERT INTO organizations(slug,name,created_by_user_id) VALUES (?,?,?)',[tag,tag,userId]);
  const organizationId=org.insertId;
  await c.execute("INSERT INTO organization_memberships(organization_id,user_id,created_by_user_id) VALUES (?,?,?)",[organizationId,userId,userId]);
  const workspace=async slug=>{const [w]=await c.execute('INSERT INTO workspaces(organization_id,slug,name,created_by_user_id) VALUES (?,?,?,?)',[organizationId,slug,slug,userId]);return w.insertId;};
  const workspaceId=await workspace('one'), secondWorkspace=await workspace('two');
  const session=await issueSession(c,{userId,activeWorkspaceId:workspaceId});
  await c.execute(`INSERT INTO billing_subscriptions(organization_id,id,plan_code,plan_version,status,monthly_price_idr,included_credit_idr,max_divisions,max_members,agents_per_division,whatsapp_enabled,period_start,period_end,approval_reference)
    VALUES (?,?,'starter',1,'active',149000,0,1,2,4,0,DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY),'rollback-fixture-no-payment')`,[organizationId,randomUUID()]);
  const adapter={execute:(...args)=>c.execute(...args),beginTransaction:()=>c.query('SAVEPOINT billing_operation'),commit:()=>c.query('RELEASE SAVEPOINT billing_operation'),rollback:()=>c.query('ROLLBACK TO SAVEPOINT billing_operation'),release(){}};
  const pool={execute:(...args)=>c.execute(...args),getConnection:async()=>adapter};
  const service=createBillingService(()=>pool);
  await service.grantCredit({organizationId,key:tag,source:'adjustment',amountIdr:'100',approvalReference:'rollback-fixture-no-payment'});
  const now=Date.now(), date=new Date(now).toISOString().slice(0,10);
  const env={BILLING_MODEL_RATES_JSON:JSON.stringify({'fixture-model':{inputUsdPerMillion:'2',outputUsdPerMillion:'10',cacheReadUsdPerMillion:'0.1',maxInputTokens:100,maxOutputTokens:20,approvalReference:'fixture-only-not-provider-prices',verifiedAt:new Date(now-1000).toISOString(),validUntil:new Date(now+86400000).toISOString()}})};
  const billing=createAiBilling(()=>pool,{service,pricing:{snapshot:async()=>({fx:{available:true,date,idrPerUsd:'16000'}})},env});
  const store=createUsageStore(()=>pool,{billing});
  const scope={organizationId,workspaceId,userId,sessionId:session.id,operation:'job',resourceId:1,agentId:'fixture'};
  const input={model:'fixture-model',max_tokens:20,messages:[{role:'user',content:'fixture'}]};
  let providerCalls=0;
  const fake={messages:{create:async()=>{providerCalls++;return {id:`${tag}-${providerCalls}`,model:input.model,usage:{input_tokens:10,output_tokens:2}};}}};
  const client=trackedClient(fake,store,scope);
  await client.messages.create(input);
  const [[first]]=await c.execute('SELECT usage_id,state,CAST(actual_idr AS CHAR) AS actual FROM ai_billing_attempts WHERE organization_id=?',[organizationId]);
  assert.equal(first.state,'settled');assert.equal(first.actual,'2');
  await billing.reconcile(first.usage_id);
  const balance=async()=>{const [[r]]=await c.execute('SELECT CAST(SUM(available_idr) AS CHAR) AS available,CAST(SUM(reserved_idr) AS CHAR) AS reserved FROM billing_credit_grants WHERE organization_id=?',[organizationId]);return r;};
  assert.deepEqual(await balance(),{available:'98',reserved:'0'});
  await assert.rejects(trackedClient(fake,store,scope).messages.create(input));assert.equal(providerCalls,1);
  await client.messages.create(input);assert.equal(providerCalls,2);assert.equal((await balance()).available,'96');
  const unknown=await store.start({...scope,operation:'chat'},input.model,input,1);await billing.dispatched(unknown);await store.finish(unknown,null);
  assert.deepEqual(await balance(),{available:'83',reserved:'13'});
  await assert.rejects(billing.reconcile(unknown));
  const [[hold]]=await c.execute('SELECT hold_id FROM ai_billing_attempts WHERE usage_id=?',[unknown]);
  // Relational and CHECK guarantees are exercised on the real engine.
  await assert.rejects(c.execute("UPDATE ai_billing_attempts SET state='settled' WHERE usage_id=?",[unknown]),{code:'ER_CHECK_CONSTRAINT_VIOLATED'});
  await assert.rejects(c.execute('UPDATE ai_billing_attempts SET organization_id=? WHERE usage_id=?',[9007199254740991,unknown]),{code:'ER_NO_REFERENCED_ROW_2'});
  await assert.rejects(c.execute('UPDATE ai_billing_attempts SET hold_id=? WHERE usage_id=?',[hold.hold_id,first.usage_id]),{code:'ER_DUP_ENTRY'});
  await c.execute('UPDATE sessions SET revoked_at=UTC_TIMESTAMP() WHERE id=?',[session.id]);
  await assert.rejects(client.messages.create(input));assert.equal(providerCalls,2);assert.deepEqual(await balance(),{available:'83',reserved:'13'});
  await c.execute('UPDATE sessions SET revoked_at=NULL WHERE id=?',[session.id]);
  await assert.rejects(trackedClient(fake,store,{...scope,workspaceId:secondWorkspace}).messages.create(input));assert.equal(providerCalls,2);
  await c.query('SAVEPOINT insufficient_balance_fixture');
  await c.execute('UPDATE billing_credit_grants SET available_idr=12 WHERE organization_id=?',[organizationId]);
  await assert.rejects(client.messages.create(input),{status:402});assert.equal(providerCalls,2);
  await c.query('ROLLBACK TO SAVEPOINT insufficient_balance_fixture');
  const contender=await mysql.createConnection(options);
  try {
    await contender.query('SET SESSION innodb_lock_wait_timeout=1');await contender.beginTransaction();
    await assert.rejects(contender.execute('SELECT organization_id FROM billing_wallets WHERE organization_id=? FOR UPDATE',[organizationId]),{code:'ER_LOCK_WAIT_TIMEOUT'});
  } finally {await contender.rollback();await contender.end();}
  await addDivision(c,{organizationId,workspaceId},userId,{name:'Fixture'});
  await assert.rejects(addDivision(c,{organizationId,workspaceId:secondWorkspace},userId,{name:'Over organization limit'}),{status:402});
  await assert.rejects(assertPaidAccess(c,organizationId,{whatsapp:true}),{status:402});
  await c.execute("UPDATE billing_subscriptions SET status='suspended' WHERE organization_id=?",[organizationId]);
  await assert.rejects(client.messages.create(input));assert.equal(providerCalls,2);
  await c.rollback();outer=false;assert.deepEqual(await counts(),before);
  console.log(JSON.stringify({database:identity.db,validation,checks:['real-session-before-dispatch','actual-2x-rupiah-debit','unused-reservation-return','idempotent-settlement','duplicate-job-denial','distinct-retry-debit','unknown-outcome-keeps-reservation','real-check-foreign-key-and-unique-constraints','revoked-session-denial','wrong-workspace-denial','insufficient-balance-before-provider','real-wallet-lock-contention','organization-wide-division-limit','starter-whatsapp-denial','inactive-plan-denial','rollback-preserves-counts'],allFixtureWritesRolledBack:true,newDatabaseCreated:false,paidProviderCalls:0,mockProviderCalls:providerCalls,concurrentCommittedServiceSpendsTested:false}));
} catch(error) {console.error(JSON.stringify({failed:true,code:error.code||'AI_BILLING_LOCAL_FAILED',message:'Local AI billing verification failed; no paid provider was called.'}));process.exitCode=1;}
finally {if(outer)await c?.rollback();await c?.end();}
