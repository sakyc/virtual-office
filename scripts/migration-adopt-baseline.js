import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectApprovedNonProduction, safeDatabaseError } from '../server/migrations/database.js';
import { acquireMigrationLock, ensureHistoryTable, releaseMigrationLock, validateHistory } from '../server/migrations/framework.js';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';
import { hasErrors, inspectMigrationDirectory } from '../server/migrations/status.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const backup = process.argv.find((arg) => arg.startsWith('--backup-reference='))?.slice(19);
const args = new Set(process.argv.slice(2));
if (!args.has('--confirm-baseline-adoption') || !args.has('--confirm-non-production') || !backup || args.size !== 3) { console.error('Usage: node scripts/migration-adopt-baseline.js --confirm-baseline-adoption --confirm-non-production --backup-reference=<approved-id>'); process.exitCode = 2; }
else { const report = await inspectMigrationDirectory(path.join(root, 'migrations')); let connection; try {
  if (hasErrors(report.diagnostics)) throw Object.assign(new Error('Migration source invalid.'), { code: 'MIGRATION_SOURCE_INVALID' });
  connection = await connectApprovedNonProduction(); await acquireMigrationLock(connection);
  const contract = await validateCurrentSchema(connection); if (!contract.valid) throw Object.assign(new Error('Schema contract tidak cocok.'), { code: 'SCHEMA_CONTRACT_MISMATCH' });
  if (report.migrations.length !== 1 || report.migrations[0].id !== '001_current_schema_baseline') throw Object.assign(new Error('Adoption hanya berlaku untuk baseline awal immutable.'), { code: 'BASELINE_ADOPTION_INVALID' });
  await ensureHistoryTable(connection); await validateHistory(connection, report.migrations);
  const [[historyCount]] = await connection.execute('SELECT COUNT(*) AS count FROM schema_migrations');
  if (Number(historyCount.count) !== 0) throw Object.assign(new Error('History migration sudah ada; adoption baseline ditolak.'), { code: 'BASELINE_HISTORY_NOT_EMPTY' });
  const migration = report.migrations[0];
  await connection.execute(`INSERT INTO schema_migrations (migration_id, file_name, checksum, status, applied_at) VALUES (?, ?, ?, 'adopted', CURRENT_TIMESTAMP)`, [migration.id, migration.file, migration.checksum]);
  console.log(JSON.stringify({ adopted: [migration.id], backupReference: backup }, null, 2));
} catch (error) { console.error(JSON.stringify({ error: safeDatabaseError(error) })); process.exitCode = 1; } finally { if (connection) { try { await releaseMigrationLock(connection); } catch {} await connection.end(); } } }
