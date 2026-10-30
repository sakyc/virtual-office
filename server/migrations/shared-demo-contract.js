import {normalizeIntegerType} from './column-types.js';
export const SHARED_DEMO_TABLES={
  shared_demo_control:['id','enabled','user_id'],
  shared_demo_bookings:['id','applicant_id','company','needs','requested_at','phone','status','enabled','otp_hash','otp_expires_at','otp_attempts','verified_at','code_hash','code_attempts','last_sent_at','send_window_at','sends','starts_at','ends_at','credit_idr','organization_id','workspace_id','session_id','entered_at','created_at'],
  shared_demo_audit:['id','booking_id','actor_user_id','action','reason','created_at'],
};
const indexes={shared_demo_control:{PRIMARY:['id']},shared_demo_bookings:{PRIMARY:['id'],uq_shared_demo_org:['organization_id'],uq_shared_demo_workspace:['workspace_id'],uq_shared_demo_session:['session_id'],idx_shared_demo_applicant:['applicant_id','created_at'],idx_shared_demo_schedule:['status','starts_at','ends_at']},shared_demo_audit:{PRIMARY:['id'],idx_shared_demo_audit_time:['created_at','id']}};
const keys={shared_demo_control:[['fk_shared_demo_user','user_id','users']],shared_demo_bookings:[['fk_shared_booking_applicant','applicant_id','users'],['fk_shared_booking_org','organization_id','organizations'],['fk_shared_booking_workspace','workspace_id','workspaces'],['fk_shared_booking_session','session_id','sessions']],shared_demo_audit:[['fk_shared_audit_booking','booking_id','shared_demo_bookings'],['fk_shared_audit_actor','actor_user_id','users']]};
const criticalTypes={
  shared_demo_control:{id:'tinyint unsigned',enabled:'tinyint',user_id:'bigint unsigned'},
  shared_demo_bookings:{id:'char(36)',applicant_id:'bigint unsigned',enabled:'tinyint',status:"enum('verifying','pending','approved','active','ended','rejected')",otp_hash:'char(64)',code_hash:'char(64)',otp_attempts:'tinyint unsigned',code_attempts:'tinyint unsigned',sends:'smallint unsigned',credit_idr:'bigint unsigned',organization_id:'bigint unsigned',workspace_id:'bigint unsigned',session_id:'bigint unsigned',starts_at:'datetime',ends_at:'datetime',otp_expires_at:'datetime',verified_at:'datetime',send_window_at:'datetime',last_sent_at:'datetime'},
  shared_demo_audit:{id:'char(36)',booking_id:'char(36)',actor_user_id:'bigint unsigned',created_at:'datetime'},
};
export async function validateSharedDemoSchema(c) {
  const differences=[];
  for(const [table,columns] of Object.entries(SHARED_DEMO_TABLES)) {
    const [actual]=await c.execute('SELECT column_name AS name,column_type AS type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?',[table]);
    for(const name of columns)if(!actual.some(r=>r.name===name))differences.push({table,column:name,reason:'column_missing'});
    for(const [name,type] of Object.entries(criticalTypes[table]))if(!actual.some(r=>r.name===name && normalizeIntegerType(r.type||'')===type))differences.push({table,column:name,reason:'column_type_mismatch'});
    const [found]=await c.execute('SELECT index_name AS name,column_name AS columnName,non_unique AS nonUnique FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? ORDER BY index_name,seq_in_index',[table]);
    for(const [name,wanted] of Object.entries(indexes[table])) {
      const parts=found.filter(r=>r.name===name);
      if(JSON.stringify(parts.map(r=>r.columnName))!==JSON.stringify(wanted) || (!name.startsWith('idx_') && parts.some(r=>Number(r.nonUnique)!==0)))differences.push({table,index:name,reason:'index_mismatch'});
    }
    const [foreign]=await c.execute('SELECT constraint_name AS name,column_name AS col,referenced_table_name AS target,referenced_column_name AS targetCol FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name=? AND referenced_table_name IS NOT NULL',[table]);
    for(const [name,col,target] of keys[table])if(!foreign.some(r=>r.name===name && r.col===col && r.target===target && r.targetCol==='id'))differences.push({table,constraint:name,reason:'foreign_key_mismatch'});
  }
  const [checks]=await c.execute("SELECT constraint_name AS name FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name IN ('shared_demo_control','shared_demo_bookings') AND constraint_type='CHECK'");
  for(const name of ['ck_shared_demo_singleton','ck_shared_demo_attempts','ck_shared_demo_budget','ck_shared_demo_window'])if(!checks.some(r=>r.name===name))differences.push({constraint:name,reason:'check_missing'});
  const [[singleton]]=await c.execute('SELECT COUNT(*) AS count FROM shared_demo_control WHERE id=1');
  if(Number(singleton.count)!==1)differences.push({table:'shared_demo_control',reason:'singleton_missing'});
  return differences;
}
