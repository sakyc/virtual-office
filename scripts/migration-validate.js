import 'dotenv/config';
import { connectApprovedNonProduction, safeDatabaseError } from '../server/migrations/database.js';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';

const args = new Set(process.argv.slice(2));
if (args.size !== 1 || !args.has('--confirm-non-production')) { console.error('Usage: node scripts/migration-validate.js --confirm-non-production'); process.exitCode = 2; }
else {
  let connection;
  try {
    connection = await connectApprovedNonProduction();
    const [rows] = await connection.execute("SELECT migration_id AS migrationId FROM schema_migrations WHERE migration_id IN ('002_tenant_foundation', '003_native_credentials', '004_ai_usage', '005_workspace_team', '006_chat_history') AND status IN ('applied', 'adopted')");
    const ids = new Set(rows.map((row) => row.migrationId));
    const result = await validateCurrentSchema(connection, { requireTenantFoundation: ids.has('002_tenant_foundation'), requireNativeCredentials: ids.has('003_native_credentials'), requireAiUsage: ids.has('004_ai_usage'), requireWorkspaceTeam: ids.has('005_workspace_team'), requireChatHistory: ids.has('006_chat_history') });
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  } catch (error) { console.error(JSON.stringify({ error: safeDatabaseError(error) })); process.exitCode = 1; }
  finally { await connection?.end(); }
}
