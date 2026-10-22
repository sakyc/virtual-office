import 'dotenv/config';
import { connectApprovedNonProduction, safeDatabaseError } from '../server/migrations/database.js';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';

const args = new Set(process.argv.slice(2));
if (args.size !== 1 || !args.has('--confirm-non-production')) { console.error('Usage: node scripts/migration-validate.js --confirm-non-production'); process.exitCode = 2; }
else { let connection; try { connection = await connectApprovedNonProduction(); const [rows] = await connection.execute("SELECT migration_id AS migrationId FROM schema_migrations WHERE migration_id = '002_tenant_foundation' AND status IN ('applied', 'adopted')"); console.log(JSON.stringify(await validateCurrentSchema(connection, { requireTenantFoundation: rows.length > 0 }), null, 2)); } catch (error) { console.error(JSON.stringify({ error: safeDatabaseError(error) })); process.exitCode = 1; } finally { await connection?.end(); } }
