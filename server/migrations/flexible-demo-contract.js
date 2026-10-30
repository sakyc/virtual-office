import {normalizeIntegerType} from './column-types.js';
export async function validateFlexibleDemoSchema(c) {
  const differences=[];
  const [columns]=await c.execute("SELECT column_name AS name,column_type AS type,is_nullable AS nullable FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='shared_demo_bookings'");
  for(const [name,type] of Object.entries({duration_minutes:'smallint unsigned',code_expires_at:'datetime'}))if(!columns.some(r=>r.name===name && normalizeIntegerType(r.type||'')===type && r.nullable==='YES'))differences.push({table:'shared_demo_bookings',column:name,reason:'flexible_demo_column_mismatch'});
  const [checks]=await c.execute("SELECT constraint_name AS name FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name='shared_demo_bookings' AND constraint_type='CHECK'");
  for(const name of ['ck_shared_demo_duration','ck_shared_demo_activation'])if(!checks.some(r=>r.name===name))differences.push({constraint:name,reason:'check_missing'});
  return differences;
}
