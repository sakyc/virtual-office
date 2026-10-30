import 'dotenv/config';
import mysql from 'mysql2/promise';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {paymentUpgradeOptions} from './upgrade-deployment-payments.mjs';
import {validateDeployment} from './bootstrap-deployment.mjs';
import {inspectMigrationDirectory,hasErrors} from '../server/migrations/status.js';
import {acquireMigrationLock,releaseMigrationLock,validateHistory,applyMigrations} from '../server/migrations/framework.js';

export async function upgradeSharedDemo(c,database,migrations,{apply=false,validate=validateDeployment,applyPending=applyMigrations}={}) {
  const [[target]]=await c.execute('SELECT DATABASE() AS db');
  if(target.db!==database)throw Error('DEPLOYMENT_DATABASE_MISMATCH');
  if(migrations.length!==19 || migrations.at(-1)?.id!=='019_scheduled_demo')throw Error('DEPLOYMENT_MIGRATION_SOURCE_INVALID');
  await validateHistory(c,migrations);
  const [history]=await c.execute('SELECT migration_id,status FROM schema_migrations ORDER BY migration_id');
  const previous=migrations.slice(0,-1);
  if(history.some(r=>r.status!=='applied') || previous.some(m=>!history.some(r=>r.migration_id===m.id)) || ![18,19].includes(history.length))throw Error('VISIT_UPGRADE_HISTORY_INVALID');
  if(history.length===19)return validate(c,database,migrations);
  if(!apply)throw Error('VISIT_MIGRATION_PENDING');
  const before=await validate(c,database,previous);
  if(!before.validation.valid)throw Error('VISIT_BASE_SCHEMA_INVALID');
  const [tables]=await c.execute("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('shared_demo_control','shared_demo_bookings','shared_demo_audit')");
  if(tables.length)throw Error('VISIT_TABLE_WITHOUT_HISTORY');
  const applied=await applyPending(c,migrations);
  if(applied.length!==1 || applied[0].name!=='019_scheduled_demo')throw Error('VISIT_APPLIED_SET_INVALID');
  const result=await validate(c,database,migrations);
  if(!result.validation.valid)throw Error('VISIT_SCHEMA_INVALID');
  return {...result,applied:applied.map(m=>m.name)};
}
async function main() {
  let c,locked=false;
  try {
    const args=process.argv.slice(2),options=paymentUpgradeOptions(args,process.env);
    const report=await inspectMigrationDirectory(fileURLToPath(new URL('../migrations',import.meta.url)));
    if(hasErrors(report.diagnostics))throw Error('DEPLOYMENT_MIGRATION_SOURCE_INVALID');
    c=await mysql.createConnection({...options,timezone:'Z'});await acquireMigrationLock(c);locked=true;
    console.log(JSON.stringify(await upgradeSharedDemo(c,options.database,report.migrations,{apply:args.includes('--apply')}),null,2));
  }catch(e){const code=e.code||e.message;console.error(JSON.stringify({failed:true,code:/^[A-Z][A-Z0-9_]{2,80}$/.test(code)?code:'VISIT_UPGRADE_FAILED',warning:'Stop on failure. DDL is not transactional; never drop tables or rerun blindly.'}));process.exitCode=1;}
  finally{if(locked)await releaseMigrationLock(c).catch(()=>{});await c?.end();}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
