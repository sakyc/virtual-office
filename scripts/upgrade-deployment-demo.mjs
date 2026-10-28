import 'dotenv/config';
import mysql from 'mysql2/promise';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {paymentUpgradeOptions} from './upgrade-deployment-payments.mjs';
import {validateDeployment} from './bootstrap-deployment.mjs';
import {inspectMigrationDirectory,hasErrors} from '../server/migrations/status.js';
import {acquireMigrationLock,releaseMigrationLock,validateHistory,applyMigrations} from '../server/migrations/framework.js';

export async function upgradeDemo(c,database,migrations,{apply=false}={}) {
  const [[target]]=await c.execute('SELECT DATABASE() AS db');
  if(target.db!==database)throw Error('DEPLOYMENT_DATABASE_MISMATCH');
  if(migrations.length!==18 || migrations.at(-1)?.id!=='018_whatsapp_demo')throw Error('DEPLOYMENT_MIGRATION_SOURCE_INVALID');
  await validateHistory(c,migrations);
  const [history]=await c.execute('SELECT migration_id,status FROM schema_migrations ORDER BY migration_id');
  const previous=migrations.slice(0,-1);
  if(history.some(r=>r.status!=='applied') || previous.some(m=>!history.some(r=>r.migration_id===m.id)) || ![17,18].includes(history.length))throw Error('DEMO_UPGRADE_HISTORY_INVALID');
  if(history.length===18)return validateDeployment(c,database,migrations);
  if(!apply)throw Error('DEMO_MIGRATION_PENDING');
  const before=await validateDeployment(c,database,previous);
  if(!before.validation.valid)throw Error('DEMO_UPGRADE_BASE_SCHEMA_INVALID');
  const [tables]=await c.execute("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='demo_access'");
  if(tables.length)throw Error('DEMO_TABLE_WITHOUT_HISTORY');
  const applied=await applyMigrations(c,migrations);
  if(applied.length!==1 || applied[0].name!=='018_whatsapp_demo')throw Error('DEMO_UPGRADE_APPLIED_SET_INVALID');
  const result=await validateDeployment(c,database,migrations);
  if(!result.validation.valid)throw Error('DEMO_SCHEMA_INVALID');
  return {...result,applied:applied.map(m=>m.name)};
}
async function main() {
  let c,locked=false;
  try {
    const args=process.argv.slice(2),options=paymentUpgradeOptions(args,process.env);
    const report=await inspectMigrationDirectory(fileURLToPath(new URL('../migrations',import.meta.url)));
    if(hasErrors(report.diagnostics))throw Error('DEPLOYMENT_MIGRATION_SOURCE_INVALID');
    c=await mysql.createConnection(options);await acquireMigrationLock(c);locked=true;
    console.log(JSON.stringify(await upgradeDemo(c,options.database,report.migrations,{apply:args.includes('--apply')}),null,2));
  }catch(e){const candidate=e.code||e.message;console.error(JSON.stringify({failed:true,code:/^[A-Z][A-Z0-9_]{2,80}$/.test(candidate)?candidate:'DEMO_UPGRADE_FAILED',warning:'Stop on failure. DDL is not transactional; never drop tables or rerun blindly.'}));process.exitCode=1;}
  finally{if(locked)await releaseMigrationLock(c).catch(()=>{});await c?.end();}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
