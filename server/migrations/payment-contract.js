import { portableColumns } from './column-types.js';

export const PAYMENT_COLUMNS = {
  id:['varchar(50)','NO'], organization_id:['bigint unsigned','NO'], created_by_user_id:['bigint unsigned','NO'],
  request_id:['char(36)','NO'], request_hash:['char(64)','NO'], environment:["enum('sandbox','production')",'NO'],
  kind:["enum('subscription','topup')",'NO'],amount_idr:['bigint unsigned','NO'],purchase_snapshot:['json','NO'],
  status:["enum('creating','pending','paid','expired','cancelled','denied','needs_review')",'NO'],
  snap_token:['varchar(255)','YES'],provider_status:['varchar(30)','YES'],provider_transaction_id:['varchar(100)','YES'],
  fulfillment:['json','YES'],created_at:['datetime','NO'],paid_at:['datetime','YES'],updated_at:['datetime','NO'],
};
export async function validatePaymentSchema(c) {
  const table='billing_payment_orders',differences=[];
  const [raw]=await c.execute('SELECT column_name AS name,column_type AS type,is_nullable AS nullable FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?',[table]);
  const columns=await portableColumns(c,table,raw);
  for(const [name,[type,nullable]] of Object.entries(PAYMENT_COLUMNS))if(!columns.some(col=>col.name===name&&col.type===type&&col.nullable===nullable))differences.push({table,column:name,reason:'column_mismatch'});
  const [indexes]=await c.execute('SELECT index_name AS name,column_name AS columnName,non_unique AS nonUnique FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? ORDER BY index_name,seq_in_index',[table]);
  for(const [name,[nonUnique,names]] of Object.entries({PRIMARY:[0,['id']],uq_payment_request:[0,['organization_id','request_id']],uq_payment_provider_transaction:[0,['environment','provider_transaction_id']],idx_payment_org_time:[1,['organization_id','created_at','id']]})) {
    const found=indexes.filter(i=>i.name===name);
    if(JSON.stringify(found.map(i=>i.columnName))!==JSON.stringify(names)||found.some(i=>Number(i.nonUnique)!==nonUnique))differences.push({table,index:name,reason:'index_mismatch'});
  }
  const [keys]=await c.execute('SELECT constraint_name AS name,column_name AS columnName,referenced_table_name AS targetTable,referenced_column_name AS targetColumn FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name=? AND referenced_table_name IS NOT NULL',[table]);
  for(const [name,col,target] of [['fk_payment_organization','organization_id','organizations'],['fk_payment_creator','created_by_user_id','users']])if(!keys.some(k=>k.name===name&&k.columnName===col&&k.targetTable===target&&k.targetColumn==='id'))differences.push({table,constraint:name,reason:'foreign_key_mismatch'});
  const [checks]=await c.execute('SELECT constraint_name AS name FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name=? AND constraint_type=\'CHECK\'',[table]);
  if(!checks.some(k=>k.name==='ck_payment_positive'))differences.push({table,constraint:'ck_payment_positive',reason:'check_missing'});
  return differences;
}
