import 'dotenv/config';
import mysql from 'mysql2/promise';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {paymentUpgradeOptions} from './upgrade-deployment-payments.mjs';
import {validateDeployment} from './bootstrap-deployment.mjs';
import {inspectMigrationDirectory,hasErrors} from '../server/migrations/status.js';
import {acquireMigrationLock,releaseMigrationLock,validateHistory,applyMigrations} from '../server/migrations/framework.js';

export async function upgradeManagedDemo(c,database,migrations,{apply=false,validate=validateDeployment,applyPending=applyMigrations}={}){
  const [[target]]=await c.execute('SELECT DATABASE() AS db');if(target.db!==database)throw Error('DEPLOYMENT_DATABASE_MISMATCH');
  if(migrations.length!==22||migrations.at(-1)?.id!=='022_managed_demo_account')throw Error('DEPLOYMENT_MIGRATION_SOURCE_INVALID');
  await validateHistory(c,migrations);
  const [history]=await c.execute('SELECT migration_id,status FROM schema_migrations ORDER BY migration_id');
  if(![21,22].includes(history.length)||history.some(r=>r.status!=='applied')||migrations.slice(0,history.length).some(m=>!history.some(r=>r.migration_id===m.id)))throw Error('MANAGED_DEMO_UPGRADE_HISTORY_INVALID');
  if(history.length===22){const result=await validate(c,database,migrations);if(!result.validation.valid)throw Error('MANAGED_DEMO_SCHEMA_INVALID');return result;}
  if(!apply)throw Error('MANAGED_DEMO_MIGRATION_PENDING');
  const before=await validate(c,database,migrations.slice(0,21));if(!before.validation.valid)throw Error('MANAGED_DEMO_BASE_SCHEMA_INVALID');
  const [tables]=await c.execute("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('managed_demo_accounts','managed_demo_audit')");if(tables.length)throw Error('MANAGED_DEMO_PARTIAL_SCHEMA');
  const applied=await applyPending(c,migrations);if(applied.length!==1||applied[0].name!=='022_managed_demo_account')throw Error('MANAGED_DEMO_APPLIED_SET_INVALID');
  const result=await validate(c,database,migrations);if(!result.validation.valid)throw Error('MANAGED_DEMO_SCHEMA_INVALID');return {...result,applied:applied.map(m=>m.name)};
}
async function main(){let c,locked=false;try{
  const args=process.argv.slice(2),options=paymentUpgradeOptions(args,process.env),report=await inspectMigrationDirectory(fileURLToPath(new URL('../migrations',import.meta.url)));if(hasErrors(report.diagnostics))throw Error('DEPLOYMENT_MIGRATION_SOURCE_INVALID');
  c=await mysql.createConnection({...options,timezone:'Z'});await acquireMigrationLock(c);locked=true;
  console.log(JSON.stringify(await upgradeManagedDemo(c,options.database,report.migrations,{apply:args.includes('--apply')}),null,2));
}catch(e){const code=e.code||e.message;console.error(JSON.stringify({failed:true,code:/^[A-Z][A-Z0-9_]{2,80}$/.test(code)?code:'MANAGED_DEMO_UPGRADE_FAILED',warning:'Stop on failure. DDL is not transactional; never drop tables or rerun blindly.'}));process.exitCode=1;}finally{if(locked)await releaseMigrationLock(c).catch(()=>{});await c?.end();}}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
