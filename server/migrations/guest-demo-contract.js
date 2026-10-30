export async function validateGuestDemoSchema(c) {
  const differences=[];
  for(const [table,wanted] of Object.entries({shared_demo_bookings:{applicant_id:'bigint',requested_at:'datetime',guest_name:'varchar(150)',guest_email:'varchar(254)',guest_token_hash:'char(64)'},shared_demo_audit:{actor_user_id:'bigint'}})) {
    const [rows]=await c.execute('SELECT column_name AS name,column_type AS type,is_nullable AS nullable,character_set_name AS charset,collation_name AS collation FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?',[table]);
    for(const [name,type] of Object.entries(wanted)) {
      const row=rows.find(r=>r.name===name);
      if(!row || row.nullable!=='YES' || (type==='bigint'?!/^bigint(?:\(\d+\))? unsigned$/.test(row.type):row.type!==type)
        || (name==='guest_token_hash' && (row.charset!=='ascii' || row.collation!=='ascii_bin')))differences.push({table,column:name,reason:'guest_column_mismatch'});
    }
  }
  const [indexes]=await c.execute("SELECT index_name AS name,column_name AS col FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='shared_demo_bookings' ORDER BY index_name,seq_in_index");
  for(const [name,columns] of Object.entries({idx_shared_demo_guest:['guest_token_hash','created_at'],idx_shared_demo_phone:['phone','send_window_at']}))if(JSON.stringify(indexes.filter(r=>r.name===name).map(r=>r.col))!==JSON.stringify(columns))differences.push({index:name,reason:'guest_index_mismatch'});
  const [checks]=await c.execute("SELECT constraint_name AS name FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name='shared_demo_bookings' AND constraint_type='CHECK'");
  if(!checks.some(r=>r.name==='ck_shared_demo_guest_identity'))differences.push({constraint:'ck_shared_demo_guest_identity',reason:'check_missing'});
  return differences;
}
