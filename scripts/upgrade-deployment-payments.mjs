import 'dotenv/config';
import mysql from 'mysql2/promise';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deploymentOptions,validateDeployment } from './bootstrap-deployment.mjs';
import { inspectMigrationDirectory,hasErrors } from '../server/migrations/status.js';
import { acquireMigrationLock,releaseMigrationLock,validateHistory,applyMigrations } from '../server/migrations/framework.js';

export function paymentUpgradeOptions(args,env) {
  const apply=args.includes('--apply');
  if(apply && !args.includes('--backup-confirmed'))throw Error('PAYMENT_BACKUP_CONFIRMATION_REQUIRED');
  if(!apply && args.includes('--backup-confirmed'))throw Error('PAYMENT_UPGRADE_ARGUMENT_INVALID');
  if(args.filter(a=>a==='--backup-confirmed').length>1)throw Error('PAYMENT_UPGRADE_ARGUMENT_INVALID');
  return deploymentOptions(args.filter(a=>a!=='--backup-confirmed'),env);
}
export async function upgradePayments(c,database,migrations,{apply=false}={}) {
  const [[target]]=await c.execute('SELECT DATABASE() AS db');
  if(target.db!==database)throw Error('DEPLOYMENT_DATABASE_MISMATCH');
  if(migrations.length!==17 || migrations.at(-1)?.id!=='017_midtrans_payments')throw Error('DEPLOYMENT_MIGRATION_SOURCE_INVALID');
  await validateHistory(c,migrations);
  const [history]=await c.execute('SELECT migration_id,status FROM schema_migrations ORDER BY migration_id');
  const previous=migrations.slice(0,-1);
  if(history.some(r=>r.status!=='applied') || previous.some(m=>!history.some(r=>r.migration_id===m.id)) || ![16,17].includes(history.length))throw Error('PAYMENT_UPGRADE_HISTORY_INVALID');
  if(history.length===17) return validateDeployment(c,database,migrations);
  if(!apply)throw Error('PAYMENT_MIGRATION_PENDING');
  // Existing 001–016 history/checksums must be fully valid before the one DDL.
  const before=await validateDeployment(c,database,previous);
  // validateDeployment also requests payments in the latest schema contract;
  // only the not-yet-created payment table may be absent before this upgrade.
  if(before.validation.differences.some(d=>d.table!=='billing_payment_orders'))throw Error('PAYMENT_UPGRADE_BASE_SCHEMA_INVALID');
  const [tables]=await c.execute("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='billing_payment_orders'");
  if(tables.length)throw Error('PAYMENT_TABLE_WITHOUT_HISTORY');
  const applied=await applyMigrations(c,migrations);
  if(applied.length!==1 || applied[0].name!=='017_midtrans_payments')throw Error('PAYMENT_UPGRADE_APPLIED_SET_INVALID');
  const result=await validateDeployment(c,database,migrations);
  if(!result.validation.valid)throw Error('PAYMENT_SCHEMA_INVALID');
  return {...result,applied:applied.map(m=>m.name)};
}
async function main() {
  let c,locked=false;
  try {
    const args=process.argv.slice(2),options=paymentUpgradeOptions(args,process.env);
    const report=await inspectMigrationDirectory(fileURLToPath(new URL('../migrations',import.meta.url)));
    if(hasErrors(report.diagnostics))throw Error('DEPLOYMENT_MIGRATION_SOURCE_INVALID');
    c=await mysql.createConnection(options);await acquireMigrationLock(c);locked=true;
    console.log(JSON.stringify(await upgradePayments(c,options.database,report.migrations,{apply:args.includes('--apply')}),null,2));
  }catch(e){const candidate=e.code||e.message;console.error(JSON.stringify({failed:true,code:/^[A-Z][A-Z0-9_]{2,80}$/.test(candidate)?candidate:'PAYMENT_UPGRADE_FAILED',warning:'Stop on failure. DDL is not transactional; never drop tables or rerun blindly.'}));process.exitCode=1;}
  finally{if(locked)await releaseMigrationLock(c).catch(()=>{});await c?.end();}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
