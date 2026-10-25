export const CHAT_CONTRACT = {
  chat_conversations: {
    columns: ['id', 'organization_id', 'workspace_id', 'user_id', 'agent_id', 'title', 'status', 'pending_turn', 'pending_at', 'created_at', 'updated_at', 'archived_at'],
    enums: { status: "enum('active','archived')" },
    indexes: { PRIMARY: ['id'], idx_chat_owner_agent: ['organization_id', 'workspace_id', 'user_id', 'agent_id', 'status', 'updated_at'] },
    keys: { fk_chat_organization: ['organization_id', 'organizations', 'id'], fk_chat_workspace: ['workspace_id', 'workspaces', 'id'], fk_chat_user: ['user_id', 'users', 'id'], fk_chat_agent: ['agent_id', 'workspace_agents', 'id'] },
  },
  chat_messages: {
    columns: ['id', 'conversation_id', 'turn_id', 'role', 'content', 'status', 'created_at'],
    enums: { role: "enum('user','assistant')", status: "enum('pending','complete','failed')" },
    indexes: { PRIMARY: ['id'], uq_chat_turn_role: ['conversation_id', 'turn_id', 'role'], idx_chat_messages_history: ['conversation_id', 'status', 'id'] },
    keys: { fk_chat_message_conversation: ['conversation_id', 'chat_conversations', 'id'] },
  },
};
export async function validateChatSchema(connection, { requireModelSelection = false } = {}) {
  const differences = [];
  for (const [table, spec] of Object.entries(CHAT_CONTRACT)) {
    const [columns] = await connection.execute('SELECT column_name AS name, column_type AS type, is_nullable AS nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?', [table]);
    for (const name of spec.columns) if (!columns.some((column) => column.name === name)) differences.push({ table, column: name, reason: 'column_missing' });
    if (requireModelSelection && !columns.some((column) => column.name === 'model_id' && column.type === 'varchar(191)' && column.nullable === 'YES')) differences.push({ table, column: 'model_id', reason: 'nullable_model_id_mismatch' });
    for (const [name, type] of Object.entries(spec.enums)) if (columns.find((column) => column.name === name)?.type !== type) differences.push({ table, column: name, reason: 'enum_mismatch' });
    const [indexes] = await connection.execute('SELECT index_name AS name, column_name AS columnName, non_unique AS nonUnique FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? ORDER BY index_name, seq_in_index', [table]);
    for (const [name, required] of Object.entries(spec.indexes)) {
      const entries = indexes.filter((index) => index.name === name);
      if (JSON.stringify(entries.map((entry) => entry.columnName)) !== JSON.stringify(required) || ((name === 'PRIMARY' || name.startsWith('uq_')) && entries.some((entry) => Number(entry.nonUnique) !== 0))) differences.push({ table, index: name, reason: 'index_mismatch' });
    }
    const [keys] = await connection.execute('SELECT constraint_name AS name, column_name AS columnName, referenced_table_name AS targetTable, referenced_column_name AS targetColumn FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND referenced_table_name IS NOT NULL', [table]);
    for (const [name, required] of Object.entries(spec.keys)) {
      const entries = keys.filter((key) => key.name === name);
      if (entries.length !== 1 || JSON.stringify([entries[0].columnName, entries[0].targetTable, entries[0].targetColumn]) !== JSON.stringify(required)) differences.push({ table, constraint: name, reason: 'foreign_key_mismatch' });
    }
  }
  return differences;
}
