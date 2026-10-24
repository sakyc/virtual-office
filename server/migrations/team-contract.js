export const TEAM_CONTRACT = {
  workspace_divisions: {
    columns: ['id', 'organization_id', 'workspace_id', 'name', 'template_id', 'slot', 'status', 'created_by_user_id', 'created_at', 'updated_at', 'archived_at'],
    indexes: { PRIMARY: ['id'], uq_division_scope: ['id', 'organization_id', 'workspace_id'], uq_division_slot: ['workspace_id', 'slot'], idx_divisions_scope_status: ['organization_id', 'workspace_id', 'status'] },
    keys: { fk_division_organization: [['organization_id', 'organizations', 'id']], fk_division_workspace: [['workspace_id', 'workspaces', 'id']], fk_division_creator: [['created_by_user_id', 'users', 'id']] },
  },
  workspace_agents: {
    columns: ['id', 'organization_id', 'workspace_id', 'division_id', 'template_id', 'name', 'role', 'instructions', 'model_tier', 'status', 'created_by_user_id', 'created_at', 'updated_at', 'archived_at'],
    indexes: { PRIMARY: ['id'], idx_agents_scope_division: ['organization_id', 'workspace_id', 'division_id', 'status'] },
    keys: { fk_workspace_agent_division: [['division_id', 'workspace_divisions', 'id'], ['organization_id', 'workspace_divisions', 'organization_id'], ['workspace_id', 'workspace_divisions', 'workspace_id']], fk_workspace_agent_creator: [['created_by_user_id', 'users', 'id']] },
  },
};
export async function validateTeamSchema(connection) {
  const differences = [];
  for (const [table, expected] of Object.entries(TEAM_CONTRACT)) {
    const [columns] = await connection.execute('SELECT column_name AS name, column_type AS type, is_nullable AS nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?', [table]);
    for (const name of expected.columns) if (!columns.some((c) => c.name === name)) differences.push({ table, column: name, reason: 'column_missing' });
    if (columns.find((c) => c.name === 'status')?.type !== "enum('active','archived')") differences.push({ table, column: 'status', reason: 'lifecycle_mismatch' });
    if (table === 'workspace_agents' && columns.find((c) => c.name === 'model_tier')?.type !== "enum('leader','team')") differences.push({ table, column: 'model_tier', reason: 'model_tier_mismatch' });
    if (table === 'workspace_divisions' && columns.find((c) => c.name === 'slot')?.nullable !== 'YES') differences.push({ table, column: 'slot', reason: 'archived_slot_must_be_nullable' });
    const [indexes] = await connection.execute('SELECT index_name AS name, column_name AS columnName, non_unique AS nonUnique FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? ORDER BY index_name, seq_in_index', [table]);
    for (const [name, required] of Object.entries(expected.indexes)) {
      const entries = indexes.filter((i) => i.name === name);
      if (JSON.stringify(entries.map((i) => i.columnName)) !== JSON.stringify(required) || ((name === 'PRIMARY' || name.startsWith('uq_')) && entries.some((i) => Number(i.nonUnique) !== 0))) differences.push({ table, index: name, reason: 'index_mismatch' });
    }
    const [keys] = await connection.execute('SELECT constraint_name AS name, column_name AS columnName, referenced_table_name AS targetTable, referenced_column_name AS targetColumn FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND referenced_table_name IS NOT NULL ORDER BY constraint_name, ordinal_position', [table]);
    for (const [name, required] of Object.entries(expected.keys)) {
      if (JSON.stringify(keys.filter((k) => k.name === name).map((k) => [k.columnName, k.targetTable, k.targetColumn])) !== JSON.stringify(required)) differences.push({ table, constraint: name, reason: 'foreign_key_mismatch' });
    }
  }
  return differences;
}
