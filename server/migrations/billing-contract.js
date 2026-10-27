import { portableColumns } from './column-types.js';

export const BILLING_CONTRACT = {
  billing_plans: {
    columns: ['code','version','name','monthly_price_idr','included_credit_idr','max_divisions','max_members','agents_per_division','whatsapp_enabled','quote_required','created_at'],
    nullable: ['monthly_price_idr','included_credit_idr','max_divisions','max_members'],
    checks: ['ck_billing_plan_flags'], indexes: { PRIMARY: ['code'] }, keys: {},
  },
  billing_subscriptions: {
    columns: ['organization_id','id','plan_code','plan_version','status','monthly_price_idr','included_credit_idr','max_divisions','max_members','agents_per_division','whatsapp_enabled','period_start','period_end','approval_reference','created_at','updated_at'],
    enums: { status: "enum('active','past_due','suspended','cancelled')" },
    indexes: { PRIMARY: ['organization_id'], uq_billing_subscription_id: ['id'], idx_billing_subscription_expiry: ['status','period_end'] },
    checks: ['ck_billing_subscription_terms'], keys: { fk_billing_subscription_org: ['organization_id','organizations','id'], fk_billing_subscription_plan: ['plan_code','billing_plans','code'] },
  },
  billing_wallets: { columns: ['organization_id','created_at'], indexes: { PRIMARY: ['organization_id'] }, keys: { fk_billing_wallet_org: ['organization_id','organizations','id'] } },
  billing_credit_grants: {
    columns: ['id','organization_id','source','reference_id','original_idr','available_idr','reserved_idr','expires_at','created_at'], nullable: ['expires_at'],
    enums: { source: "enum('package','topup','adjustment')" },
    indexes: { PRIMARY: ['id'], uq_billing_grant_reference: ['organization_id','source','reference_id'], idx_billing_grant_spend: ['organization_id','expires_at','created_at'] },
    checks: ['ck_billing_grant_balance','ck_billing_grant_expiry'], keys: { fk_billing_grant_wallet: ['organization_id','billing_wallets','organization_id'] },
  },
  billing_holds: {
    columns: ['id','organization_id','amount_idr','settled_idr','status','allocations','created_at','finished_at'], nullable: ['settled_idr','finished_at'],
    enums: { status: "enum('reserved','settled','released')" },
    indexes: { PRIMARY: ['id'], idx_billing_hold_org_status: ['organization_id','status','created_at'] },
    checks: ['ck_billing_hold_amount','ck_billing_hold_state'], keys: { fk_billing_hold_wallet: ['organization_id','billing_wallets','organization_id'] },
  },
  billing_ledger: {
    columns: ['id','organization_id','idempotency_key','request_hash','kind','amount_idr','result','created_at'],
    enums: { kind: "enum('subscription','credit','reserve','settle','release')" },
    indexes: { PRIMARY: ['id'], uq_billing_ledger_idempotency: ['organization_id','idempotency_key'], idx_billing_ledger_org_time: ['organization_id','created_at','id'] },
    keys: { fk_billing_ledger_wallet: ['organization_id','billing_wallets','organization_id'] },
  },
};
export const ADMIN_CATALOG_CONTRACT = {
  platform_admins: { columns: ['user_id','approval_reference','granted_at','revoked_at'], nullable: ['revoked_at'], indexes: { PRIMARY: ['user_id'] }, keys: { fk_platform_admin_user: ['user_id','users','id'] } },
  billing_catalog_audit: { columns: ['id','actor_user_id','plan_code','plan_version','before_snapshot','after_snapshot','reason','created_at'], indexes: { PRIMARY: ['id'], uq_catalog_audit_version: ['plan_code','plan_version'], idx_catalog_audit_time: ['created_at','id'] }, keys: { fk_catalog_audit_actor: ['actor_user_id','users','id'], fk_catalog_audit_plan: ['plan_code','billing_plans','code'] } },
};
export const PLATFORM_AUDIT_CONTRACT = {
  platform_admin_audit: {
    columns: ['id','actor_user_id','target_user_id','action','reason','before_snapshot','after_snapshot','created_at'],
    enums: { action: "enum('suspend','activate','revoke_sessions')" },
    indexes: { PRIMARY: ['id'], idx_platform_audit_time: ['created_at','id'], idx_platform_audit_target: ['target_user_id','created_at','id'] },
    keys: { fk_platform_audit_actor: ['actor_user_id','users','id'], fk_platform_audit_target: ['target_user_id','users','id'] },
  },
};
export const AI_BILLING_CONTRACT = {
  ai_billing_attempts: {
    columns: ['usage_id','organization_id','request_key','hold_id','request_hash','pricing_snapshot','provider_evidence','provider_message_id','state','actual_idr','created_at','finished_at'],
    nullable: ['provider_evidence','provider_message_id','actual_idr','finished_at'],
    types: { usage_id:'char(36)', request_key:'char(64)', hold_id:'char(36)', request_hash:'char(64)', pricing_snapshot:'json', provider_evidence:'json', provider_message_id:'varchar(191)' },
    enums: { state: "enum('prepared','dispatched','unresolved','settled','released')" },
    indexes: { PRIMARY: ['usage_id'], uq_ai_billing_request: ['organization_id','request_key'], uq_ai_billing_hold: ['hold_id'], uq_ai_billing_provider_message: ['provider_message_id'], idx_ai_billing_pending: ['state','created_at','usage_id'] },
    keys: { fk_ai_billing_usage: ['usage_id','ai_usage','id'], fk_ai_billing_org: ['organization_id','organizations','id'], fk_ai_billing_hold: ['hold_id','billing_holds','id'] },
    checks: ['ck_ai_billing_final'],
  },
};
export const BILLING_ADMIN_CONTRACT = {
  billing_model_tariffs: {
    columns: ['model','version','enabled','tariff','source_reference','updated_by_user_id','updated_at'],
    types: { model:'varchar(150)',version:'int unsigned',enabled:'tinyint unsigned',tariff:'json',source_reference:'varchar(500)' },
    indexes: { PRIMARY:['model'] },keys: { fk_model_tariff_actor:['updated_by_user_id','users','id'] },checks:['ck_model_tariff_version','ck_model_tariff_enabled'],
  },
  billing_operations_audit: {
    columns:['id','actor_user_id','organization_id','model','action','request_id','request_hash','before_snapshot','after_snapshot','reason','created_at'],nullable:['organization_id','model','before_snapshot'],
    enums:{action:"enum('activate_subscription','update_tariff')"}, types:{before_snapshot:'json',after_snapshot:'json',request_hash:'char(64)'},
    indexes:{PRIMARY:['id'],uq_billing_operation_request:['actor_user_id','request_id'],idx_billing_operation_time:['created_at','id'],idx_billing_operation_org:['organization_id','created_at','id']},
    keys:{fk_billing_operation_actor:['actor_user_id','users','id'],fk_billing_operation_org:['organization_id','organizations','id'],fk_billing_operation_model:['model','billing_model_tariffs','model']}, checks:['ck_billing_operation_scope'],
  },
};
export const MODEL_CATALOG_CONTRACT = {
  ai_models: {
    columns: ['id','provider','provider_model_id','display_name','lifecycle','enabled','seed_tariff','seed_reference','created_at'],
    nullable: ['seed_tariff'],
    types: { id:'char(36)',provider:'varchar(32)',provider_model_id:'varchar(150)',display_name:'varchar(100)',enabled:'tinyint unsigned',seed_tariff:'json',seed_reference:'varchar(100)' },
    enums: { lifecycle: "enum('active','deprecated','retired','unknown')" },
    indexes: { PRIMARY:['id'],uq_ai_model_provider:['provider','provider_model_id'] }, keys: {},
    checks: ['ck_ai_model_provider','ck_ai_model_enabled'],
  },
};
export async function validateBillingSchema(c, { adminCatalog = false, platformAdminAudit = false, aiBilling = false, billingAdmin = false, modelCatalog = false } = {}) {
  const differences = [];
  const contract = adminCatalog ? { ...BILLING_CONTRACT, ...ADMIN_CATALOG_CONTRACT,
    billing_plans: { ...BILLING_CONTRACT.billing_plans, columns: [...BILLING_CONTRACT.billing_plans.columns, 'is_public'], checks: [...BILLING_CONTRACT.billing_plans.checks, 'ck_billing_plan_public'] } } : { ...BILLING_CONTRACT };
  if (platformAdminAudit) Object.assign(contract, PLATFORM_AUDIT_CONTRACT);
  if (aiBilling) Object.assign(contract, AI_BILLING_CONTRACT);
  if (billingAdmin) Object.assign(contract, BILLING_ADMIN_CONTRACT);
  if (modelCatalog) Object.assign(contract, MODEL_CATALOG_CONTRACT);
  for (const [table, spec] of Object.entries(contract)) {
    const [rawColumns] = await c.execute('SELECT column_name AS name, column_type AS type, is_nullable AS nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?', [table]);
    const columns = await portableColumns(c, table, rawColumns);
    for (const name of spec.columns) {
      const column = columns.find((row) => row.name === name);
      if (!column) { differences.push({ table, column: name, reason: 'column_missing' }); continue; }
      if (column.nullable !== ((spec.nullable || []).includes(name) ? 'YES' : 'NO')) differences.push({ table, column: name, reason: 'nullable_mismatch' });
      if ((name.endsWith('_idr') || name === 'organization_id') && !/^bigint(?:\(\d+\))? unsigned$/.test(column.type)) differences.push({ table, column: name, reason: 'unsigned_bigint_required' });
    }
    for (const [name, type] of Object.entries(spec.enums || {})) if (columns.find((row) => row.name === name)?.type !== type) differences.push({ table, column: name, reason: 'enum_mismatch' });
    for (const [name, type] of Object.entries(spec.types || {})) if (columns.find((row) => row.name === name)?.type !== type) differences.push({ table, column: name, reason: 'type_mismatch' });
    const [indexes] = await c.execute('SELECT index_name AS name, column_name AS columnName, non_unique AS nonUnique FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? ORDER BY index_name, seq_in_index', [table]);
    for (const [name, expected] of Object.entries(spec.indexes)) {
      const entries = indexes.filter((row) => row.name === name);
      if (JSON.stringify(entries.map((row) => row.columnName)) !== JSON.stringify(expected) || ((name === 'PRIMARY' || name.startsWith('uq_')) && entries.some((row) => Number(row.nonUnique) !== 0))) differences.push({ table, index: name, reason: 'index_mismatch' });
    }
    const [keys] = await c.execute('SELECT constraint_name AS name, column_name AS columnName, referenced_table_name AS targetTable, referenced_column_name AS targetColumn FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND referenced_table_name IS NOT NULL', [table]);
    for (const [name, expected] of Object.entries(spec.keys)) {
      const entries = keys.filter((row) => row.name === name);
      if (entries.length !== 1 || JSON.stringify([entries[0].columnName,entries[0].targetTable,entries[0].targetColumn]) !== JSON.stringify(expected)) differences.push({ table, constraint: name, reason: 'foreign_key_mismatch' });
    }
    if (spec.checks) {
      const [checks] = await c.execute("SELECT constraint_name AS name FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = ? AND constraint_type = 'CHECK'", [table]);
      for (const name of spec.checks) if (!checks.some((row) => row.name === name)) differences.push({ table, constraint: name, reason: 'check_missing' });
    }
  }
  return differences;
}
