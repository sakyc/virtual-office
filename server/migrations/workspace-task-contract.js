export async function validateWorkspaceTaskSchema(c) {
  const differences = [];
  for (const table of ['jobs', 'items']) {
    const [columns] = await c.execute('SELECT column_name AS name, column_type AS type, is_nullable AS nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?', [table]);
    if (!columns.some(col => col.name === 'agent_id' && col.type === 'varchar(64)' && col.nullable === 'NO')) differences.push({ table, column: 'agent_id', reason: 'workspace_agent_id_capacity_mismatch' });
    if (table === 'jobs' && !columns.some(col => col.name === 'request_key' && col.type === 'char(36)' && col.nullable === 'YES')) differences.push({ table, column: 'request_key', reason: 'request_key_mismatch' });
  }
  const [indexes] = await c.execute("SELECT column_name AS name, non_unique AS nonUnique FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'jobs' AND index_name = 'uq_jobs_workspace_request' ORDER BY seq_in_index");
  if (JSON.stringify(indexes.map(i => i.name)) !== JSON.stringify(['workspace_id', 'created_by_user_id', 'request_key']) || indexes.some(i => Number(i.nonUnique) !== 0)) differences.push({ table: 'jobs', index: 'uq_jobs_workspace_request', reason: 'idempotency_index_mismatch' });
  return differences;
}
