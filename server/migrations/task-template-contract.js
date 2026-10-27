export const TASK_TEMPLATE_COLUMNS = {
  id: ['char(36)', 'NO'], organization_id: ['bigint unsigned', 'NO'], workspace_id: ['bigint unsigned', 'NO'],
  name: ['varchar(150)', 'NO'], description: ['varchar(500)', 'NO'], definition: ['json', 'NO'], version: ['int unsigned', 'NO'],
  status: ["enum('active','archived')", 'NO'], created_by_user_id: ['bigint unsigned', 'NO'], updated_by_user_id: ['bigint unsigned', 'NO'],
  created_at: ['datetime', 'NO'], updated_at: ['datetime', 'NO'], archived_at: ['datetime', 'YES'],
};
export async function validateTaskTemplateSchema(c) {
  const table = 'workspace_task_templates', differences = [];
  const [columns] = await c.execute('SELECT column_name AS name, column_type AS type, is_nullable AS nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?', [table]);
  for (const [name, [type, nullable]] of Object.entries(TASK_TEMPLATE_COLUMNS)) {
    const column = columns.find(col => col.name === name);
    if (!column || column.type !== type || column.nullable !== nullable) differences.push({ table, column: name, reason: 'column_mismatch' });
  }
  const [indexes] = await c.execute('SELECT index_name AS name, column_name AS columnName, non_unique AS nonUnique FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? ORDER BY index_name, seq_in_index', [table]);
  for (const [name, required] of Object.entries({ PRIMARY: ['id'], idx_task_templates_scope_status: ['organization_id', 'workspace_id', 'status'] })) {
    const entries = indexes.filter(i => i.name === name);
    if (JSON.stringify(entries.map(i => i.columnName)) !== JSON.stringify(required) || (name === 'PRIMARY' && entries.some(i => Number(i.nonUnique) !== 0))) differences.push({ table, index: name, reason: 'index_mismatch' });
  }
  const [keys] = await c.execute('SELECT constraint_name AS name, column_name AS columnName, referenced_table_name AS targetTable, referenced_column_name AS targetColumn FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND referenced_table_name IS NOT NULL ORDER BY constraint_name, ordinal_position', [table]);
  for (const [suffix, column, target] of [['organization', 'organization_id', 'organizations'], ['workspace', 'workspace_id', 'workspaces'], ['creator', 'created_by_user_id', 'users'], ['updater', 'updated_by_user_id', 'users']]) {
    const entries = keys.filter(k => k.name === `fk_task_template_${suffix}`);
    if (entries.length !== 1 || entries[0].columnName !== column || entries[0].targetTable !== target || entries[0].targetColumn !== 'id') differences.push({ table, constraint: `fk_task_template_${suffix}`, reason: 'foreign_key_mismatch' });
  }
  return differences;
}
