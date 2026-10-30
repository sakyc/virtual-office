import 'dotenv/config';
import mysql from 'mysql2/promise';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {paymentUpgradeOptions} from './upgrade-deployment-payments.mjs';
import {validateDeployment} from './bootstrap-deployment.mjs';
import {inspectMigrationDirectory,hasErrors} from '../server/migrations/status.js';
import {acquireMigrationLock,releaseMigrationLock,validateHistory,applyMigrations} from '../server/migrations/framework.js';

export async function upgradeFlexibleDemo(c,database,migrations,{apply=false,validate=validateDeployment,applyPending=applyMigrations}={}) {
  const [[target]]=await c.execute('SELECT DATABASE() AS db');
  if(target.db!==database)throw Error('DEPLOYMENT_DATABASE_MISMATCH');
  if(migrations.length!==21 || migrations.at(-1)?.id!=='021_flexible_shared_demo')throw Error('DEPLOYMENT_MIGRATION_SOURCE_INVALID');
  await validateHistory(c,migrations);
  const [history]=await c.execute('SELECT migration_id,status FROM schema_migrations ORDER BY migration_id');
  if(![19,20,21].includes(history.length) || history.some(r=>r.status!=='applied') || migrations.slice(0,history.length).some(m=>!history.some(r=>r.migration_id===m.id)))throw Error('FLEXIBLE_DEMO_UPGRADE_HISTORY_INVALID');
  if(history.length===21) {
    const result=await validate(c,database,migrations);
    if(!result.validation.valid)throw Error('FLEXIBLE_DEMO_SCHEMA_INVALID');
    return result;
  }
  if(!apply)throw Error('FLEXIBLE_DEMO_MIGRATION_PENDING');
  const before=await validate(c,database,migrations.slice(0,history.length));
  if(!before.validation.valid)throw Error('FLEXIBLE_DEMO_BASE_SCHEMA_INVALID');
  const [columns]=await c.execute("SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='shared_demo_bookings' AND column_name IN ('duration_minutes','code_expires_at')");
  if(columns.length)throw Error('FLEXIBLE_DEMO_PARTIAL_SCHEMA');
  if(history.length===19) {
    const [guest]=await c.execute("SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND ((table_name='shared_demo_bookings' AND column_name IN ('guest_name','guest_email','guest_token_hash')) OR (is_nullable='YES' AND ((table_name='shared_demo_bookings' AND column_name IN ('applicant_id','requested_at')) OR (table_name='shared_demo_audit' AND column_name='actor_user_id'))))");
    if(guest.length)throw Error('GUEST_DEMO_PARTIAL_SCHEMA');
  }
  const expected=migrations.slice(history.length).map(m=>m.id),applied=await applyPending(c,migrations);
  if(JSON.stringify(applied.map(m=>m.name))!==JSON.stringify(expected))throw Error('FLEXIBLE_DEMO_APPLIED_SET_INVALID');
  const result=await validate(c,database,migrations);
  if(!result.validation.valid)throw Error('FLEXIBLE_DEMO_SCHEMA_INVALID');
  return {...result,applied:applied.map(m=>m.name)};
}
async function main() {
  let c,locked=false;
  try {
    const args=process.argv.slice(2),options=paymentUpgradeOptions(args,process.env);
    const report=await inspectMigrationDirectory(fileURLToPath(new URL('../migrations',import.meta.url)));
    if(hasErrors(report.diagnostics))throw Error('DEPLOYMENT_MIGRATION_SOURCE_INVALID');
    c=await mysql.createConnection({...options,timezone:'Z'});await acquireMigrationLock(c);locked=true;
    console.log(JSON.stringify(await upgradeFlexibleDemo(c,options.database,report.migrations.slice(0,21),{apply:args.includes('--apply')}),null,2));
  }catch(e){const code=e.code||e.message;console.error(JSON.stringify({failed:true,code:/^[A-Z][A-Z0-9_]{2,80}$/.test(code)?code:'FLEXIBLE_DEMO_UPGRADE_FAILED',warning:'Stop on failure. DDL is not transactional; never drop tables or rerun blindly.'}));process.exitCode=1;}
  finally{if(locked)await releaseMigrationLock(c).catch(()=>{});await c?.end();}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
