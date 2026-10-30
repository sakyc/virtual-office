import {normalizeIntegerType} from './column-types.js';
export const MANAGED_DEMO_TABLES={managed_demo_accounts:{id:'tinyint unsigned',user_id:'bigint unsigned',organization_id:'bigint unsigned',workspace_id:'bigint unsigned',ai_enabled:'tinyint',version:'int unsigned',created_at:'datetime',updated_at:'datetime'},managed_demo_audit:{id:'char(36)',actor_user_id:'bigint unsigned',action:'varchar(40)',reason:'varchar(500)',created_at:'datetime'}};
export async function validateManagedDemoSchema(c){
  const differences=[];
  const indexes={managed_demo_accounts:{PRIMARY:['id'],uq_managed_demo_user:['user_id'],uq_managed_demo_org:['organization_id'],uq_managed_demo_workspace:['workspace_id']},managed_demo_audit:{PRIMARY:['id'],idx_managed_demo_audit_time:['created_at','id']}};
  const keys={managed_demo_accounts:[['fk_managed_demo_user','user_id','users'],['fk_managed_demo_org','organization_id','organizations'],['fk_managed_demo_workspace','workspace_id','workspaces']],managed_demo_audit:[['fk_managed_demo_audit_actor','actor_user_id','users']]};
  for(const [table,columns] of Object.entries(MANAGED_DEMO_TABLES)){
    const [actual]=await c.execute('SELECT column_name AS name,column_type AS type,is_nullable AS nullable FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?',[table]);
    for(const [name,type] of Object.entries(columns))if(!actual.some(r=>r.name===name&&normalizeIntegerType(r.type||'')===type&&r.nullable==='NO'))differences.push({table,column:name,reason:'column_contract_mismatch'});
    const [found]=await c.execute('SELECT index_name AS name,column_name AS columnName,non_unique AS nonUnique FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? ORDER BY index_name,seq_in_index',[table]);
    for(const [name,columns] of Object.entries(indexes[table])){const parts=found.filter(r=>r.name===name);if(JSON.stringify(parts.map(r=>r.columnName))!==JSON.stringify(columns)||(!name.startsWith('idx_')&&parts.some(r=>Number(r.nonUnique)!==0)))differences.push({table,index:name,reason:'index_mismatch'});}
    const [foreign]=await c.execute('SELECT constraint_name AS name,column_name AS col,referenced_table_name AS target,referenced_column_name AS targetCol FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name=? AND referenced_table_name IS NOT NULL',[table]);
    for(const [name,col,target] of keys[table])if(!foreign.some(r=>r.name===name&&r.col===col&&r.target===target&&r.targetCol==='id'))differences.push({table,constraint:name,reason:'foreign_key_mismatch'});
  }
  const [checks]=await c.execute("SELECT constraint_name AS name FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name='managed_demo_accounts' AND constraint_type='CHECK'");
  for(const name of ['ck_managed_demo_singleton','ck_managed_demo_version'])if(!checks.some(r=>r.name===name))differences.push({constraint:name,reason:'check_missing'});
  return differences;
}
