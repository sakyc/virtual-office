import 'dotenv/config';
import mysql from 'mysql2/promise';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasErrors, inspectDatabaseHistory, inspectMigrationDirectory } from '../server/migrations/status.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
const checkDatabase = args.has('--db');
const migrationDir = path.join(root, 'migrations');

if ([...args].some((arg) => !['--db', '--confirm-non-production'].includes(arg))) {
  console.error('Usage: node scripts/migration-status.js [--db --confirm-non-production]');
  process.exitCode = 2;
} else {
  const report = await inspectMigrationDirectory(migrationDir);

  if (checkDatabase) {
    if (!args.has('--confirm-non-production') || process.env.MIGRATION_STATUS_NON_PROD_APPROVED !== '1') {
      report.diagnostics.push({
        level: 'error',
        code: 'non_production_confirmation_required',
        message: 'DB status membutuhkan --confirm-non-production dan MIGRATION_STATUS_NON_PROD_APPROVED=1.',
      });
    } else {
      let connection;
      try {
        connection = await mysql.createConnection({
          host: process.env.DB_HOST || '127.0.0.1',
          port: Number(process.env.DB_PORT || 3306),
          user: process.env.DB_USER || 'root',
          password: process.env.DB_PASSWORD || '',
          database: process.env.DB_NAME || 'kantor_ai',
          multipleStatements: false,
        });
        const databaseReport = await inspectDatabaseHistory(connection, report.migrations);
        report.database = {
          historyAvailable: databaseReport.available,
          history: databaseReport.history.map(({ migration_id, checksum, status, started_at, applied_at, failed_at }) => ({ migration_id, checksum, status, started_at, applied_at, failed_at })),
        };
        report.diagnostics.push(...databaseReport.diagnostics);
      } catch (error) {
        report.diagnostics.push({
          level: 'error',
          code: 'database_unavailable',
          message: 'Koneksi database untuk migration status gagal.',
          databaseCode: error?.code || 'UNKNOWN',
        });
      } finally {
        await connection?.end();
      }
    }
  }

  // Source stays in-process for checksum verification; status output never dumps SQL.
  console.log(JSON.stringify({
    ...report,
    migrations: report.migrations.map(({ id, file, checksum }) => ({ id, file, checksum })),
  }, null, 2));
  if (hasErrors(report.diagnostics)) process.exitCode = 1;
}
