import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectApprovedNonProduction, safeDatabaseError } from '../server/migrations/database.js';
import { acquireMigrationLock, applyMigrations, releaseMigrationLock } from '../server/migrations/framework.js';
import { hasErrors, inspectMigrationDirectory } from '../server/migrations/status.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
if (![...args].every((arg) => arg === '--apply' || arg === '--confirm-non-production') || !args.has('--apply') || !args.has('--confirm-non-production')) {
  console.error('Usage: node scripts/migrate.js --apply --confirm-non-production'); process.exitCode = 2;
} else {
  const report = await inspectMigrationDirectory(path.join(root, 'migrations'));
  if (hasErrors(report.diagnostics)) { console.log(JSON.stringify(report, null, 2)); process.exitCode = 1; }
  else {
    let connection;
    try {
      connection = await connectApprovedNonProduction();
      await acquireMigrationLock(connection);
      const applied = await applyMigrations(connection, report.migrations);
      console.log(JSON.stringify({ applied: applied.map((migration) => migration.name) }, null, 2));
    } catch (error) { console.error(JSON.stringify({ error: safeDatabaseError(error) })); process.exitCode = 1; }
    finally { if (connection) { try { await releaseMigrationLock(connection); } catch {} await connection.end(); } }
  }
}
