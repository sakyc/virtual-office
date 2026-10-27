import 'dotenv/config';
import mysql from 'mysql2/promise';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectMigrationDirectory, hasErrors } from '../server/migrations/status.js';
import { acquireMigrationLock, releaseMigrationLock, applyMigrations, validateHistory } from '../server/migrations/framework.js';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';

const root = fileURLToPath(new URL('..', import.meta.url));

export function deploymentOptions(args, env) {
  if (args.length !== 4 || !args.includes('--apply') || !args.includes('--confirm-production')
    || args.filter(a => a === '--database').length !== 1) throw new Error('EXPLICIT_DEPLOYMENT_CONFIRMATION_REQUIRED');
  const database = args[args.indexOf('--database') + 1];
  if (!/^[a-zA-Z0-9_]+$/.test(database || '') || database !== env.DB_NAME
    || env.NODE_ENV !== 'production' || !env.DB_USER || !env.DB_PASSWORD
    || !['127.0.0.1', 'localhost', '::1'].includes(env.DB_HOST)
    || env.DB_USER === 'root') throw new Error('DEPLOYMENT_TARGET_REJECTED');
  return { host: env.DB_HOST, port: Number(env.DB_PORT || 3306), database,
    user: env.DB_USER, password: env.DB_PASSWORD, multipleStatements: false };
}

// Fresh databases only. Deliberately not an upgrade/retry/recovery command.
export async function bootstrapDeployment(connection, database, migrations, operations = {}) {
  const apply = operations.apply || applyMigrations;
  const validate = operations.validate || validateCurrentSchema;
  const history = operations.history || validateHistory;
  const [[target]] = await connection.execute('SELECT DATABASE() AS db');
  if (target.db !== database) throw new Error('DEPLOYMENT_DATABASE_MISMATCH');
  const [tables] = await connection.execute(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()');
  if (tables.length) throw new Error('DEPLOYMENT_DATABASE_NOT_EMPTY');
  const applied = await apply(connection, migrations);
  await history(connection, migrations);
  const validation = await validate(connection, {
    requireTenantFoundation: true, requireNativeCredentials: true, requireAiUsage: true,
    requireWorkspaceTeam: true, requireChatHistory: true, requireChatModelSelection: true,
    requireBilling: true, requireAdminCatalog: true, requirePlatformAdminAudit: true,
    requireAiBilling: true, requireBillingAdmin: true, requireModelCatalog: true,
    requireTaskTemplates: true, requireWorkspaceTasks: true, requireTenantMembers: true,
  });
  if (!validation.valid) {
    console.log(JSON.stringify({ validation }, null, 2));
    throw new Error('DEPLOYMENT_SCHEMA_INVALID');
  }
  return { database, applied: applied.map(m => m.name), validation };
}

async function main() {
  let connection, locked = false;
  try {
    const options = deploymentOptions(process.argv.slice(2), process.env);
    const report = await inspectMigrationDirectory(resolve(root, 'migrations'));
    if (hasErrors(report.diagnostics) || report.migrations.length !== 16
      || report.migrations.at(-1)?.id !== '016_tenant_members') throw new Error('DEPLOYMENT_MIGRATION_SOURCE_INVALID');
    connection = await mysql.createConnection(options);
    await acquireMigrationLock(connection); locked = true;
    console.log(JSON.stringify(await bootstrapDeployment(connection, options.database, report.migrations), null, 2));
  } catch (error) {
    const candidate = error.code || error.message;
    console.error(JSON.stringify({ failed: true,
      code: /^[A-Z][A-Z0-9_]{2,80}$/.test(candidate) ? candidate : 'DEPLOYMENT_BOOTSTRAP_FAILED',
      warning: 'Stop on failure. DDL is not transactional; do not drop tables or rerun blindly.' }));
    process.exitCode = 1;
  } finally {
    if (locked) await releaseMigrationLock(connection).catch(() => {});
    await connection?.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
