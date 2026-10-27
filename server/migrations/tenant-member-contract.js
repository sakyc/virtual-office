const scope = { organization_id: ['bigint unsigned', 'NO'], workspace_id: ['bigint unsigned', 'NO'] };
const user = { user_id: ['bigint unsigned', 'NO'] };
const id = ['char(36)', 'NO'];
export const MEMBER_COLUMNS = {
  users: { whatsapp_number: ['varchar(16)', 'YES'], whatsapp_verified_at: ['datetime', 'YES'] },
  workspace_memberships: { membership_version: ['int unsigned', 'NO'] },
  workspace_member_divisions: { ...scope, ...user, division_id: id },
  workspace_member_agents: { ...scope, ...user, agent_id: id },
  workspace_division_reviewers: { ...scope, ...user, division_id: id, updated_by_user_id: ['bigint unsigned', 'NO'], updated_at: ['datetime', 'NO'] },
  workspace_invitations: { ...scope, id, email_normalized: ['varchar(254)', 'NO'], role: ["enum('admin','member','viewer')", 'NO'], assignments: ['json', 'NO'], token_hash: ['binary(32)', 'NO'], created_by_user_id: ['bigint unsigned', 'NO'], expires_at: ['datetime', 'NO'], consumed_at: ['datetime', 'YES'], revoked_at: ['datetime', 'YES'], created_at: ['datetime', 'NO'] },
  workspace_member_audit: { ...scope, id: ['bigint unsigned', 'NO'], actor_user_id: ['bigint unsigned', 'NO'], action: ['varchar(40)', 'NO'], details: ['json', 'NO'], created_at: ['datetime', 'NO'] },
};
export const MEMBER_INDEXES = {
  workspace_agents: { uq_workspace_agent_scope: [0, ['id', 'organization_id', 'workspace_id']] },
  workspace_member_divisions: { PRIMARY: [0, ['workspace_id', 'user_id', 'division_id']] },
  workspace_member_agents: { PRIMARY: [0, ['workspace_id', 'user_id', 'agent_id']], idx_member_agent_scope: [1, ['agent_id', 'organization_id', 'workspace_id']] },
  workspace_division_reviewers: { PRIMARY: [0, ['division_id']] },
  workspace_invitations: { PRIMARY: [0, ['id']], uq_invitation_token: [0, ['token_hash']], idx_invitation_workspace: [1, ['organization_id', 'workspace_id', 'expires_at']], idx_invitation_email: [1, ['workspace_id', 'email_normalized']] },
  workspace_member_audit: { PRIMARY: [0, ['id']], idx_member_audit_scope: [1, ['organization_id', 'workspace_id', 'id']] },
};
const membership = ['workspace_memberships', ['workspace_id', 'user_id'], ['workspace_id', 'user_id']];
const division = ['workspace_divisions', ['division_id', 'organization_id', 'workspace_id'], ['id', 'organization_id', 'workspace_id']];
export const MEMBER_KEYS = {
  workspace_member_divisions: { fk_member_division_membership: membership, fk_member_division_scope: division },
  workspace_member_agents: { fk_member_agent_membership: membership, fk_member_agent_agent: ['workspace_agents', ['agent_id', 'organization_id', 'workspace_id'], ['id', 'organization_id', 'workspace_id']] },
  workspace_division_reviewers: { fk_reviewer_division: division, fk_reviewer_membership: membership, fk_reviewer_actor: ['users', ['updated_by_user_id'], ['id']] },
  workspace_invitations: { fk_invitation_workspace: ['workspaces', ['workspace_id'], ['id']], fk_invitation_organization: ['organizations', ['organization_id'], ['id']], fk_invitation_creator: ['users', ['created_by_user_id'], ['id']] },
  workspace_member_audit: { fk_member_audit_workspace: ['workspaces', ['workspace_id'], ['id']], fk_member_audit_actor: ['users', ['actor_user_id'], ['id']] },
};
export async function validateTenantMemberSchema(c) {
  const differences = [];
  for (const table of new Set([...Object.keys(MEMBER_COLUMNS), ...Object.keys(MEMBER_INDEXES)])) {
    const [columns] = await c.execute('SELECT column_name AS name, column_type AS type, is_nullable AS nullable FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?', [table]);
    for (const [name, [type, nullable]] of Object.entries(MEMBER_COLUMNS[table] || {})) {
      if (!columns.some(col => col.name === name && col.type === type && col.nullable === nullable)) differences.push({ table, column: name, reason: 'column_mismatch' });
    }
    const [indexes] = await c.execute('SELECT index_name AS name, column_name AS columnName, non_unique AS nonUnique FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? ORDER BY index_name, seq_in_index', [table]);
    for (const [name, [unique, cols]] of Object.entries(MEMBER_INDEXES[table] || {})) {
      const found = indexes.filter(i => i.name === name);
      if (JSON.stringify(found.map(i => i.columnName)) !== JSON.stringify(cols) || found.some(i => Number(i.nonUnique) !== unique)) differences.push({ table, index: name, reason: 'index_mismatch' });
    }
    const [keys] = await c.execute('SELECT constraint_name AS name, column_name AS columnName, referenced_table_name AS targetTable, referenced_column_name AS targetColumn FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name=? AND referenced_table_name IS NOT NULL ORDER BY constraint_name, ordinal_position', [table]);
    for (const [name, [target, cols, targets]] of Object.entries(MEMBER_KEYS[table] || {})) {
      const found = keys.filter(k => k.name === name);
      if (JSON.stringify(found.map(k => k.columnName)) !== JSON.stringify(cols) || JSON.stringify(found.map(k => k.targetColumn)) !== JSON.stringify(targets) || found.some(k => k.targetTable !== target)) differences.push({ table, constraint: name, reason: 'foreign_key_mismatch' });
    }
  }
  return differences;
}
