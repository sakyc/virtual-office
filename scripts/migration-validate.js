import 'dotenv/config';
import { connectApprovedNonProduction, safeDatabaseError } from '../server/migrations/database.js';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';

const args = new Set(process.argv.slice(2));
if (args.size !== 1 || !args.has('--confirm-non-production')) { console.error('Usage: node scripts/migration-validate.js --confirm-non-production'); process.exitCode = 2; }
else {
  let connection;
  try {
    connection = await connectApprovedNonProduction();
    const [rows] = await connection.execute("SELECT migration_id AS migrationId FROM schema_migrations WHERE migration_id IN ('002_tenant_foundation', '003_native_credentials', '004_ai_usage', '005_workspace_team', '006_chat_history', '007_chat_model_selection', '008_billing_foundation', '009_admin_catalog', '010_platform_admin_audit', '011_ai_billing_attempts', '012_billing_administration', '013_ai_model_catalog') AND status IN ('applied', 'adopted')");
    const ids = new Set(rows.map((row) => row.migrationId));
    const [workspaceTaskHistory] = await connection.execute("SELECT migration_id FROM schema_migrations WHERE migration_id = '015_workspace_task_execution' AND status = 'applied'");
    const [templateHistory] = await connection.execute("SELECT migration_id FROM schema_migrations WHERE migration_id = '014_task_templates' AND status = 'applied'");
    const [memberHistory] = await connection.execute("SELECT migration_id FROM schema_migrations WHERE migration_id = '016_tenant_members' AND status = 'applied'");
    const result = await validateCurrentSchema(connection, { requireWorkspaceTasks: workspaceTaskHistory.length > 0, requireTaskTemplates: templateHistory.length > 0, requireTenantFoundation: ids.has('002_tenant_foundation'), requireNativeCredentials: ids.has('003_native_credentials'), requireAiUsage: ids.has('004_ai_usage'), requireWorkspaceTeam: ids.has('005_workspace_team'), requireChatHistory: ids.has('006_chat_history'), requireChatModelSelection: ids.has('007_chat_model_selection'), requireBilling: ids.has('008_billing_foundation'), requireAdminCatalog: ids.has('009_admin_catalog'), requirePlatformAdminAudit: ids.has('010_platform_admin_audit'), requireAiBilling: ids.has('011_ai_billing_attempts'), requireBillingAdmin: ids.has('012_billing_administration'), requireModelCatalog: ids.has('013_ai_model_catalog') });
    if (memberHistory.length) {
      const { validateTenantMemberSchema } = await import('../server/migrations/tenant-member-contract.js');
      result.differences.push(...await validateTenantMemberSchema(connection));
      result.valid = result.differences.length === 0;
    }
    const [paymentHistory] = await connection.execute("SELECT migration_id FROM schema_migrations WHERE migration_id = '017_midtrans_payments' AND status = 'applied'");
    if (paymentHistory.length) {
      const { validatePaymentSchema } = await import('../server/migrations/payment-contract.js');
      result.differences.push(...await validatePaymentSchema(connection));
      result.valid = result.differences.length === 0;
    }
    const [demoHistory] = await connection.execute("SELECT migration_id FROM schema_migrations WHERE migration_id = '018_whatsapp_demo' AND status = 'applied'");
    if (demoHistory.length) {
      const {validateDemoSchema} = await import('../server/migrations/demo-contract.js');
      result.differences.push(...await validateDemoSchema(connection));
      result.valid = result.differences.length === 0;
    }
    const [sharedDemoHistory] = await connection.execute("SELECT migration_id FROM schema_migrations WHERE migration_id = '019_scheduled_demo' AND status = 'applied'");
    if(sharedDemoHistory.length) {
      const {validateSharedDemoSchema}=await import('../server/migrations/shared-demo-contract.js');
      result.differences.push(...await validateSharedDemoSchema(connection));
      result.valid=result.differences.length===0;
    }
    const [guestDemoHistory] = await connection.execute("SELECT migration_id FROM schema_migrations WHERE migration_id = '020_guest_scheduled_demo' AND status = 'applied'");
    if(guestDemoHistory.length) {
      const {validateGuestDemoSchema}=await import('../server/migrations/guest-demo-contract.js');
      result.differences.push(...await validateGuestDemoSchema(connection));
      result.valid=result.differences.length===0;
    }
    const [flexibleDemoHistory] = await connection.execute("SELECT migration_id FROM schema_migrations WHERE migration_id = '021_flexible_shared_demo' AND status = 'applied'");
    if(flexibleDemoHistory.length) {
      const {validateFlexibleDemoSchema}=await import('../server/migrations/flexible-demo-contract.js');
      result.differences.push(...await validateFlexibleDemoSchema(connection));
      result.valid=result.differences.length===0;
    }
    const [managedDemoHistory]=await connection.execute("SELECT migration_id FROM schema_migrations WHERE migration_id='022_managed_demo_account' AND status='applied'");
    if(managedDemoHistory.length){const {validateManagedDemoSchema}=await import('../server/migrations/managed-demo-contract.js');result.differences.push(...await validateManagedDemoSchema(connection));result.valid=result.differences.length===0;}
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  } catch (error) { console.error(JSON.stringify({ error: safeDatabaseError(error) })); process.exitCode = 1; }
  finally { await connection?.end(); }
}
