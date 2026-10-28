import {portableColumns} from './column-types.js';
export const DEMO_COLUMNS={user_id:['bigint unsigned','NO'],phone_hash:['char(64)','YES'],pending_phone_hash:['char(64)','NO'],otp_hash:['char(64)','YES'],otp_expires_at:['datetime','YES'],otp_attempts:['tinyint unsigned','NO'],verified_at:['datetime','YES'],activation_hash:['char(64)','YES'],activation_expires_at:['datetime','YES'],activation_attempts:['tinyint unsigned','NO'],last_sent_at:['datetime','YES'],send_window_at:['datetime','NO'],sends:['smallint unsigned','NO'],organization_id:['bigint unsigned','YES'],workspace_id:['bigint unsigned','YES'],activated_at:['datetime','YES'],expires_at:['datetime','YES'],credit_idr:['bigint unsigned','NO'],created_at:['datetime','NO']};
export async function validateDemoSchema(c) {
  const table='demo_access',differences=[];
  const [raw]=await c.execute('SELECT column_name AS name,column_type AS type,is_nullable AS nullable FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?',[table]);
  const columns=await portableColumns(c,table,raw);
  for(const [name,[type,nullable]] of Object.entries(DEMO_COLUMNS))if(!columns.some(col=>col.name===name&&col.type===type&&col.nullable===nullable))differences.push({table,column:name,reason:'column_mismatch'});
  const [indexes]=await c.execute('SELECT index_name AS name,column_name AS columnName,non_unique AS nonUnique FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? ORDER BY index_name,seq_in_index',[table]);
  for(const [name,col] of [['PRIMARY','user_id'],['uq_demo_phone','phone_hash'],['uq_demo_organization','organization_id'],['uq_demo_workspace','workspace_id']]) {
    const found=indexes.filter(i=>i.name===name);
    if(found.length!==1 || found[0].columnName!==col || Number(found[0].nonUnique)!==0)differences.push({table,index:name,reason:'index_mismatch'});
  }
  const [keys]=await c.execute('SELECT constraint_name AS name,column_name AS columnName,referenced_table_name AS targetTable,referenced_column_name AS targetColumn FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name=? AND referenced_table_name IS NOT NULL',[table]);
  for(const [name,col,target] of [['fk_demo_user','user_id','users'],['fk_demo_org','organization_id','organizations'],['fk_demo_workspace','workspace_id','workspaces']])if(!keys.some(k=>k.name===name&&k.columnName===col&&k.targetTable===target&&k.targetColumn==='id'))differences.push({table,constraint:name,reason:'foreign_key_mismatch'});
  const [checks]=await c.execute("SELECT constraint_name AS name FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name=? AND constraint_type='CHECK'",[table]);
  for(const name of ['ck_demo_attempts','ck_demo_credit','ck_demo_activation'])if(!checks.some(k=>k.name===name))differences.push({table,constraint:name,reason:'check_missing'});
  return differences;
}
