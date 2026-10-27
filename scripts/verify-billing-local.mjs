import 'dotenv/config';
import mysql from 'mysql2/promise';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { migrationConnectionOptions } from '../server/migrations/database.js';
import { inspectMigrationDirectory, inspectDatabaseHistory } from '../server/migrations/status.js';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';
import { createBillingService } from '../server/billing.js';

// Explicit single-database, rollback-only verification. Never creates a database.
assert.equal(process.env.BILLING_LOCAL_VERIFY, '1', 'Set BILLING_LOCAL_VERIFY=1 explicitly.');
const options = migrationConnectionOptions(process.env);
assert(['127.0.0.1','localhost','::1'].includes(options.host));
assert.equal(options.database, 'virtual_office'); assert.equal(options.port, 3306);
assert.notEqual(process.env.NODE_ENV, 'production');
let c, inTransaction = false;
try {
  c = await mysql.createConnection(options);
  const [[identity]] = await c.query('SELECT DATABASE() AS db, @@datadir AS datadir, VERSION() AS version');
  assert.match(identity.datadir.replaceAll('\\','/'), /^C:\/laragon\/data\/mysql-8\//i);
  const manifest = await inspectMigrationDirectory(new URL('../migrations', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
  assert.deepEqual(manifest.diagnostics, []);
  const history = await inspectDatabaseHistory(c, manifest.migrations);
  assert(history.available); assert.deepEqual(history.diagnostics, []);
  assert(history.history.some((h) => h.migration_id === '009_admin_catalog'));
  const validation = await validateCurrentSchema(c, { requireTenantFoundation:true, requireNativeCredentials:true, requireAiUsage:true, requireWorkspaceTeam:true, requireChatHistory:true, requireChatModelSelection:true, requireBilling:true, requireAdminCatalog:true, requirePlatformAdminAudit:history.history.some((h) => h.migration_id === '010_platform_admin_audit') });
  assert.equal(validation.valid, true);
  const [plans] = await c.execute('SELECT code, CAST(monthly_price_idr AS CHAR) AS price, max_divisions AS divisions, whatsapp_enabled AS whatsapp FROM billing_plans ORDER BY code');
  assert.deepEqual(plans.map(p=>p.code), ['business','custom','pro','starter']);
  assert.equal(plans.find(p=>p.code==='custom').price,null);
  const [[org]] = await c.execute("SELECT o.id FROM organizations o LEFT JOIN billing_subscriptions s ON s.organization_id=o.id WHERE o.status='active' AND s.organization_id IS NULL ORDER BY o.id LIMIT 1");
  assert(org, 'Rollback verification needs an existing active organization with no subscription; no tenant will be created.');
  const tables = ['billing_subscriptions','billing_wallets','billing_credit_grants','billing_holds','billing_ledger'];
  const counts = async () => { const out={}; for (const table of tables) {const [[r]]=await c.execute(`SELECT COUNT(*) AS n FROM ${table}`);out[table]=r.n;}return out; };
  const before = await counts();
  await c.beginTransaction(); inTransaction = true;
  // Stable test terms only inside the outer rollback. Admin's real catalog is preserved.
  await c.execute("UPDATE billing_plans SET monthly_price_idr=149000, included_credit_idr=50000, is_public=1 WHERE code='starter'");
  // Service-level commits release a savepoint, NEVER commit the outer fixture.
  const adapter = { execute:(...args)=>c.execute(...args), beginTransaction:()=>c.query('SAVEPOINT billing_operation'),
    commit:()=>c.query('RELEASE SAVEPOINT billing_operation'), rollback:()=>c.query('ROLLBACK TO SAVEPOINT billing_operation'), release() {} };
  const service = createBillingService(()=>({getConnection:async()=>adapter}));
  const organizationId = Number(org.id), prefix = randomUUID();
  const start = new Date();start.setUTCDate(1);start.setUTCHours(0,0,0,0);const end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);
  const activation={organizationId,key:prefix+'-sub',planCode:'starter',periodStart:start.toISOString(),periodEnd:end.toISOString(),approvalReference:prefix+'-rollback-fixture'};
  const first=await service.startSubscription(activation);assert.deepEqual(await service.startSubscription(activation),first);
  const credit={organizationId,key:prefix+'-credit',source:'topup',amountIdr:'100000',approvalReference:prefix+'-mock-payment'};
  const granted=await service.grantCredit(credit);assert.deepEqual(await service.grantCredit(credit),granted);
  const hold=await service.reserve({organizationId,key:prefix+'-reserve',amountIdr:'60000'});
  const finish={organizationId,key:prefix+'-settle',holdId:hold.holdId,actualIdr:'42000'};
  const settled=await service.finishHold(finish);assert.equal(settled.returnedIdr,'18000');assert.deepEqual(await service.finishHold(finish),settled);
  const [[balance]]=await c.execute('SELECT CAST(SUM(available_idr) AS CHAR) AS available, CAST(SUM(reserved_idr) AS CHAR) AS reserved FROM billing_credit_grants WHERE organization_id=?',[organizationId]);
  assert.equal(balance.available,'108000');assert.equal(balance.reserved,'0');
  await assert.rejects(service.reserve({organizationId,key:prefix+'-over',amountIdr:'108001'}),{code:'INSUFFICIENT_AI_BALANCE'});
  const held=await service.reserve({organizationId,key:prefix+'-release-hold',amountIdr:'1000'});
  await service.finishHold({organizationId,key:prefix+'-release',holdId:held.holdId,actualIdr:'0',release:true});
  await assert.rejects(c.execute('UPDATE billing_credit_grants SET available_idr=original_idr+1 WHERE organization_id=?',[organizationId]),{code:'ER_CHECK_CONSTRAINT_VIOLATED'});
  await assert.rejects(c.execute('INSERT INTO billing_ledger SELECT UUID(), organization_id, idempotency_key, request_hash, kind, amount_idr, result, created_at FROM billing_ledger WHERE organization_id=? LIMIT 1',[organizationId]),{code:'ER_DUP_ENTRY'});
  // A second real connection cannot acquire the wallet lock while the fixture owns it.
  const contender = await mysql.createConnection(options);
  try {
    await contender.query('SET SESSION innodb_lock_wait_timeout=1');
    await contender.beginTransaction();
    await assert.rejects(contender.execute('SELECT organization_id FROM billing_wallets WHERE organization_id=? FOR UPDATE',[organizationId]),{code:'ER_LOCK_WAIT_TIMEOUT'});
  } finally { await contender.rollback(); await contender.end(); }
  await c.rollback(); inTransaction=false;
  assert.deepEqual(await counts(),before);
  const [afterPlans] = await c.execute('SELECT code, CAST(monthly_price_idr AS CHAR) AS price, max_divisions AS divisions, whatsapp_enabled AS whatsapp FROM billing_plans ORDER BY code');
  assert.deepEqual(afterPlans,plans);
  console.log(JSON.stringify({database:identity.db,validation,checks:['catalog','mysql-transactions','idempotency','package-first','settlement','release','insufficient-balance','check-constraint','unique-key','real-wallet-lock-contention','rollback-preserves-original-counts'],allFixtureWritesRolledBack:true,newDatabaseCreated:false,paidProviderCalls:0,realWalletLockContentionTested:true,concurrentServiceSpendsTested:false}));
} catch(error) { console.error(JSON.stringify({failed:true,code:error.code||'BILLING_VERIFICATION_FAILED',message:error.code==='ERR_ASSERTION'?error.message:'Local billing verification failed; inspect migration history before retrying.'}));process.exitCode=1; }
finally {if(inTransaction)await c?.rollback();await c?.end();}
