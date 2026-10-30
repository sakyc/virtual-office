import { validateTeamSchema } from './team-contract.js';
import { validateChatSchema } from './chat-contract.js';
import { validateBillingSchema } from './billing-contract.js';
import { validateTaskTemplateSchema } from './task-template-contract.js';
import { validateWorkspaceTaskSchema } from './workspace-task-contract.js';
import { validateTenantMemberSchema } from './tenant-member-contract.js';
import { validatePaymentSchema } from './payment-contract.js';
import { validateDemoSchema } from './demo-contract.js';
import {validateSharedDemoSchema} from './shared-demo-contract.js';
import {validateGuestDemoSchema} from './guest-demo-contract.js';
import {validateFlexibleDemoSchema} from './flexible-demo-contract.js';

export async function validateDeploymentFlexibleDemo(connection,result) {
  const differences=[...result.differences,...await validateFlexibleDemoSchema(connection)];
  return {valid:differences.length===0,differences};
}

export async function validateDeploymentGuestDemo(connection,result) {
  const differences=[...result.differences,...await validateGuestDemoSchema(connection)];
  return {valid:differences.length===0,differences};
}

export async function validateDeploymentSharedDemo(connection, result) {
  const differences=[...result.differences,...await validateSharedDemoSchema(connection)];
  return {valid:differences.length===0,differences};
}

const CONTRACT = {
  clients: ['id', 'name', 'brief', 'created_at'],
  jobs: ['id', 'agent_id', 'job_type', 'client_id', 'parent_item_id', 'params', 'status', 'error', 'model', 'tokens_in', 'tokens_out', 'created_at', 'finished_at'],
  items: ['id', 'job_id', 'parent_id', 'client_id', 'agent_id', 'type', 'title', 'tag', 'content', 'status', 'version', 'reject_reason', 'last_error', 'approved_at', 'deleted_at', 'created_at', 'updated_at'],
  revisions: ['id', 'item_id', 'version', 'reason', 'title_before', 'content_before', 'created_at'],
};

const INDEXES = {
  clients: ['PRIMARY'],
  jobs: ['PRIMARY', 'idx_jobs_agent'],
  items: ['PRIMARY', 'idx_items_board', 'idx_items_type', 'idx_items_job', 'idx_items_parent'],
  revisions: ['PRIMARY', 'idx_rev_item'],
};

const FOREIGN_KEYS = ['fk_jobs_client', 'fk_items_job', 'fk_items_parent', 'fk_items_client', 'fk_rev_item'];

const TENANT_TABLES = {
  users: ['id', 'provider_issuer', 'external_subject', 'email', 'display_name', 'status', 'created_at', 'updated_at', 'last_login_at'],
  organizations: ['id', 'slug', 'name', 'status', 'created_by_user_id', 'created_at', 'updated_at', 'deleted_at'],
  organization_memberships: ['organization_id', 'user_id', 'role', 'created_by_user_id', 'created_at', 'revoked_at'],
  workspaces: ['id', 'organization_id', 'slug', 'name', 'status', 'created_by_user_id', 'created_at', 'updated_at', 'archived_at'],
  workspace_memberships: ['workspace_id', 'user_id', 'role', 'created_by_user_id', 'created_at', 'revoked_at'],
  sessions: ['id', 'user_id', 'token_hash', 'active_workspace_id', 'created_at', 'last_seen_at', 'idle_expires_at', 'absolute_expires_at', 'revoked_at', 'revoked_reason', 'ip_hash', 'user_agent_hash'],
};
const TENANT_OWNERSHIP = { clients: ['organization_id', 'workspace_id', 'created_by_user_id', 'updated_by_user_id'], jobs: ['organization_id', 'workspace_id', 'created_by_user_id'], items: ['organization_id', 'workspace_id', 'created_by_user_id', 'updated_by_user_id'], revisions: ['organization_id', 'workspace_id', 'created_by_user_id'] };
const TENANT_INDEXES = { users: ['PRIMARY', 'uq_users_provider_subject', 'idx_users_email', 'idx_users_status_id'], organizations: ['PRIMARY', 'uq_organizations_slug', 'idx_organizations_status_id'], organization_memberships: ['PRIMARY', 'idx_org_memberships_user', 'idx_org_memberships_role'], workspaces: ['PRIMARY', 'uq_workspaces_organization_slug', 'idx_workspaces_organization_status_id'], workspace_memberships: ['PRIMARY', 'idx_workspace_memberships_user', 'idx_workspace_memberships_role'], sessions: ['PRIMARY', 'uq_sessions_token_hash', 'idx_sessions_user_expiry', 'idx_sessions_workspace'], clients: ['idx_clients_workspace_name_id'], jobs: ['idx_jobs_workspace_created_id', 'idx_jobs_workspace_agent_id'], items: ['idx_items_workspace_board', 'idx_items_workspace_job', 'idx_items_workspace_parent'], revisions: ['idx_revisions_workspace_item_id'] };
const TENANT_FOREIGN_KEYS = ['fk_organizations_creator', 'fk_org_memberships_organization', 'fk_org_memberships_user', 'fk_org_memberships_creator', 'fk_workspaces_organization', 'fk_workspaces_creator', 'fk_workspace_memberships_workspace', 'fk_workspace_memberships_user', 'fk_workspace_memberships_creator', 'fk_sessions_user', 'fk_sessions_workspace', 'fk_clients_organization', 'fk_clients_workspace', 'fk_clients_creator', 'fk_clients_updater', 'fk_jobs_organization', 'fk_jobs_workspace', 'fk_jobs_creator', 'fk_items_organization', 'fk_items_workspace', 'fk_items_creator', 'fk_items_updater', 'fk_revisions_organization', 'fk_revisions_workspace', 'fk_revisions_creator'];

export async function validateCurrentSchema(connection, { requireDemo = false, requirePayments = false, requireTenantMembers = false, requireWorkspaceTasks = false, requireTaskTemplates = false, requireTenantFoundation = false, requireNativeCredentials = false, requireAiUsage = false, requireWorkspaceTeam = false, requireChatHistory = false, requireChatModelSelection = false, requireBilling = false, requireAdminCatalog = false, requirePlatformAdminAudit = false, requireAiBilling = false, requireBillingAdmin = false, requireModelCatalog = false } = {}) {
  const [rows] = await connection.execute(
    "SELECT table_name AS tableName, column_name AS columnName FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name IN ('clients', 'jobs', 'items', 'revisions', 'users', 'organizations', 'organization_memberships', 'workspaces', 'workspace_memberships', 'sessions', 'native_credentials') ORDER BY table_name, ordinal_position",
  );
  const actual = new Map();
  for (const row of rows) actual.set(row.tableName, [...(actual.get(row.tableName) || []), row.columnName]);
  const missing = [];
  if (requireAiUsage) {
    const [usageColumns] = await connection.execute("SELECT column_name AS name, is_nullable AS nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_usage'");
    for (const column of ['id', 'organization_id', 'workspace_id', 'user_id', 'operation', 'resource_id', 'agent_id', 'provider', 'model', 'provider_message_id', 'status', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_creation_tokens', 'started_at', 'finished_at']) {
      if (!usageColumns.some((row) => row.name === column)) missing.push({ table: 'ai_usage', column, reason: 'column_missing' });
    }
    for (const column of ['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_creation_tokens']) {
      if (usageColumns.find((row) => row.name === column)?.nullable !== 'YES') missing.push({ table: 'ai_usage', column, reason: 'unknown_usage_must_be_nullable' });
    }
    const [usageIndexes] = await connection.execute("SELECT index_name AS name, column_name AS columnName, non_unique AS nonUnique FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'ai_usage' ORDER BY index_name, seq_in_index");
    for (const [name, columns] of Object.entries({ PRIMARY: ['id'], idx_ai_usage_workspace_time: ['organization_id', 'workspace_id', 'started_at'], idx_ai_usage_user_time: ['user_id', 'started_at'], idx_ai_usage_status_time: ['status', 'started_at'] })) {
      const entries = usageIndexes.filter((row) => row.name === name);
      if (JSON.stringify(entries.map((row) => row.columnName)) !== JSON.stringify(columns) || (name === 'PRIMARY' && Number(entries[0]?.nonUnique) !== 0)) missing.push({ table: 'ai_usage', index: name, reason: 'index_mismatch' });
    }
    const [usageKeys] = await connection.execute("SELECT constraint_name AS name, column_name AS columnName, referenced_table_name AS referencedTable, referenced_column_name AS referencedColumn FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = 'ai_usage' AND referenced_table_name IS NOT NULL");
    for (const [suffix, column, table] of [['organization', 'organization_id', 'organizations'], ['workspace', 'workspace_id', 'workspaces'], ['user', 'user_id', 'users']]) {
      if (!usageKeys.some((row) => row.name === `fk_ai_usage_${suffix}` && row.columnName === column && row.referencedTable === table && row.referencedColumn === 'id')) missing.push({ table: 'ai_usage', constraint: `fk_ai_usage_${suffix}`, reason: 'foreign_key_mismatch' });
    }
  }
  if (requireNativeCredentials) {
    if (!actual.has('native_credentials')) missing.push({ table: 'native_credentials', reason: 'table_missing' });
    else for (const column of ['user_id', 'email_normalized', 'password_hash', 'created_at', 'password_changed_at']) {
      if (!actual.get('native_credentials').includes(column)) missing.push({ table: 'native_credentials', column, reason: 'column_missing' });
    }
    const [nativeIndexes] = await connection.execute("SELECT index_name AS name, column_name AS columnName, non_unique AS nonUnique, seq_in_index AS position FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'native_credentials' ORDER BY index_name, seq_in_index");
    for (const [name, column] of [['PRIMARY', 'user_id'], ['uq_native_credentials_email', 'email_normalized']]) {
      const entries = nativeIndexes.filter((entry) => entry.name === name);
      if (entries.length !== 1 || entries[0].columnName !== column || Number(entries[0].nonUnique) !== 0) missing.push({ table: 'native_credentials', index: name, reason: 'unique_index_mismatch' });
    }
    const [nativeKeys] = await connection.execute("SELECT column_name AS columnName, referenced_table_name AS referencedTable, referenced_column_name AS referencedColumn FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = 'native_credentials' AND constraint_name = 'fk_native_credentials_user'");
    if (nativeKeys.length !== 1 || nativeKeys[0].columnName !== 'user_id' || nativeKeys[0].referencedTable !== 'users' || nativeKeys[0].referencedColumn !== 'id') missing.push({ constraint: 'fk_native_credentials_user', reason: 'foreign_key_mismatch' });
  }
  for (const [table, columns] of Object.entries(CONTRACT)) {
    if (!actual.has(table)) missing.push({ table, reason: 'table_missing' });
    else for (const column of columns) if (!actual.get(table).includes(column)) missing.push({ table, column, reason: 'column_missing' });
  }
  if (requireTenantFoundation) {
    for (const [table, columns] of Object.entries(TENANT_TABLES)) {
      if (!actual.has(table)) missing.push({ table, reason: 'table_missing' });
      else for (const column of columns) if (!actual.get(table).includes(column)) missing.push({ table, column, reason: 'column_missing' });
    }
    for (const [table, columns] of Object.entries(TENANT_OWNERSHIP)) {
      for (const column of columns) if (!actual.get(table)?.includes(column)) missing.push({ table, column, reason: 'ownership_column_missing' });
    }
  }
  const [indexes] = await connection.execute(
    "SELECT table_name AS tableName, index_name AS indexName FROM information_schema.statistics WHERE table_schema = DATABASE()",
  );
  const indexNames = new Map();
  for (const row of indexes) indexNames.set(row.tableName, new Set([...(indexNames.get(row.tableName) || []), row.indexName]));
  for (const [table, names] of Object.entries(INDEXES)) {
    for (const name of names) if (!indexNames.get(table)?.has(name)) missing.push({ table, index: name, reason: 'index_missing' });
  }
  if (requireTenantFoundation) for (const [table, names] of Object.entries(TENANT_INDEXES)) for (const name of names) if (!indexNames.get(table)?.has(name)) missing.push({ table, index: name, reason: 'index_missing' });
  const [foreignKeys] = await connection.execute(
    "SELECT constraint_name AS constraintName FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL",
  );
  const keyNames = new Set(foreignKeys.map((row) => row.constraintName));
  for (const name of FOREIGN_KEYS) if (!keyNames.has(name)) missing.push({ constraint: name, reason: 'foreign_key_missing' });
  if (requireTenantFoundation) for (const name of TENANT_FOREIGN_KEYS) if (!keyNames.has(name)) missing.push({ constraint: name, reason: 'foreign_key_missing' });
  if (requireWorkspaceTeam) missing.push(...await validateTeamSchema(connection));
  if (requireTaskTemplates) missing.push(...await validateTaskTemplateSchema(connection));
  if (requireWorkspaceTasks) missing.push(...await validateWorkspaceTaskSchema(connection));
  if (requireTenantMembers) missing.push(...await validateTenantMemberSchema(connection));
  if (requirePayments) missing.push(...await validatePaymentSchema(connection));
  if (requireDemo) missing.push(...await validateDemoSchema(connection));
  if (requireChatHistory || requireChatModelSelection) missing.push(...await validateChatSchema(connection, { requireModelSelection: requireChatModelSelection }));
  if (requireBilling || requireAdminCatalog || requirePlatformAdminAudit || requireAiBilling || requireBillingAdmin || requireModelCatalog) missing.push(...await validateBillingSchema(connection, { adminCatalog: requireAdminCatalog || requirePlatformAdminAudit || requireAiBilling || requireBillingAdmin || requireModelCatalog, platformAdminAudit: requirePlatformAdminAudit || requireAiBilling || requireBillingAdmin || requireModelCatalog, aiBilling: requireAiBilling || requireBillingAdmin || requireModelCatalog, billingAdmin: requireBillingAdmin || requireModelCatalog, modelCatalog: requireModelCatalog }));
  return { valid: missing.length === 0, differences: missing };
}
