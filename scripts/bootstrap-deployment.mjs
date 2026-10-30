import 'dotenv/config';
import mysql from 'mysql2/promise';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectMigrationDirectory, hasErrors } from '../server/migrations/status.js';
import { acquireMigrationLock, releaseMigrationLock, applyMigrations, validateHistory } from '../server/migrations/framework.js';
import { validateCurrentSchema,validateDeploymentSharedDemo,validateDeploymentGuestDemo,validateDeploymentFlexibleDemo,validateDeploymentManagedDemo } from '../server/migrations/schema-contract.js';

const root = fileURLToPath(new URL('..', import.meta.url));

export function deploymentOptions(args, env) {
  if (args.length !== 4 || (Number(args.includes('--apply')) + Number(args.includes('--validate'))) !== 1 || !args.includes('--confirm-production')
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
  let validation = await validate(connection, fullSchemaOptions);
  if(migrations.some(m=>m.id==='019_scheduled_demo')) validation=await validateDeploymentSharedDemo(connection,validation);
  if(migrations.some(m=>m.id==='020_guest_scheduled_demo')) validation=await validateDeploymentGuestDemo(connection,validation);
  if(migrations.some(m=>m.id==='021_flexible_shared_demo')) validation=await validateDeploymentFlexibleDemo(connection,validation);
  if(migrations.some(m=>m.id==='022_managed_demo_account')) validation=await validateDeploymentManagedDemo(connection,validation);
  if (!validation.valid) {
    console.log(JSON.stringify({ validation }, null, 2));
    throw new Error('DEPLOYMENT_SCHEMA_INVALID');
  }
  return { database, applied: applied.map(m => m.name), validation };
}

const fullSchemaOptions = {
    requireTenantFoundation: true, requireNativeCredentials: true, requireAiUsage: true,
    requireWorkspaceTeam: true, requireChatHistory: true, requireChatModelSelection: true,
    requireBilling: true, requireAdminCatalog: true, requirePlatformAdminAudit: true,
    requireAiBilling: true, requireBillingAdmin: true, requireModelCatalog: true,
    requireTaskTemplates: true, requireWorkspaceTasks: true, requireTenantMembers: true,
    requirePayments: true, requireDemo: true,
};

// No DDL/DML. Used after bootstrap, including validation-only failures.
export async function validateDeployment(connection, database, migrations) {
  const [[target]] = await connection.execute('SELECT DATABASE() AS db');
  if (target.db !== database) throw new Error('DEPLOYMENT_DATABASE_MISMATCH');
  await validateHistory(connection, migrations);
  const [rows] = await connection.execute('SELECT migration_id, status FROM schema_migrations ORDER BY migration_id');
  if (rows.length !== migrations.length || migrations.some(m => !rows.some(r => r.migration_id === m.id && r.status === 'applied'))) {
    throw new Error('DEPLOYMENT_HISTORY_INCOMPLETE');
  }
  let validation = await validateCurrentSchema(connection, {...fullSchemaOptions,requireDemo:migrations.some(m=>m.id==='018_whatsapp_demo')});
  if(migrations.some(m=>m.id==='019_scheduled_demo')) validation=await validateDeploymentSharedDemo(connection,validation);
  if(migrations.some(m=>m.id==='020_guest_scheduled_demo')) validation=await validateDeploymentGuestDemo(connection,validation);
  if(migrations.some(m=>m.id==='021_flexible_shared_demo')) validation=await validateDeploymentFlexibleDemo(connection,validation);
  if(migrations.some(m=>m.id==='022_managed_demo_account')) validation=await validateDeploymentManagedDemo(connection,validation);
  return { database, migrations: rows.length, validation };
}

async function main() {
  let connection, locked = false;
  try {
    const options = deploymentOptions(process.argv.slice(2), process.env);
    const report = await inspectMigrationDirectory(resolve(root, 'migrations'));
    if (hasErrors(report.diagnostics) || report.migrations.length !== 22
      || report.migrations.at(-1)?.id !== '022_managed_demo_account') throw new Error('DEPLOYMENT_MIGRATION_SOURCE_INVALID');
    connection = await mysql.createConnection(options);
    await acquireMigrationLock(connection); locked = true;
    if (process.argv.includes('--validate')) {
      await connection.execute('START TRANSACTION READ ONLY');
      try {
        const result = await validateDeployment(connection, options.database, report.migrations);
        console.log(JSON.stringify(result, null, 2));
        if (!result.validation.valid) process.exitCode = 1;
      } finally { await connection.rollback(); }
    } else {
      console.log(JSON.stringify(await bootstrapDeployment(connection, options.database, report.migrations), null, 2));
    }
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
