import 'dotenv/config';
import mysql from 'mysql2/promise';
import Anthropic from '@anthropic-ai/sdk';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deploymentOptions, validateDeployment } from './bootstrap-deployment.mjs';
import { inspectMigrationDirectory, hasErrors } from '../server/migrations/status.js';
import { acquireMigrationLock, releaseMigrationLock } from '../server/migrations/framework.js';
import { seedModelCatalog, fetchModelMetadata } from '../server/model-catalog.js';

export function modelSeedOptions(args, env) {
  const options = deploymentOptions(args, env);
  if (!args.includes('--apply')) throw new Error('MODEL_SEED_APPLY_REQUIRED');
  if (!env.ANTHROPIC_API_KEY?.trim()) throw new Error('ANTHROPIC_METADATA_KEY_REQUIRED');
  return options;
}

export async function seedDeploymentModels(connection, database, migrations, operations) {
  const validate = operations.validate || validateDeployment;
  const seed = operations.seed || seedModelCatalog;
  const result = await validate(connection, database, migrations);
  if (!result.validation.valid) throw new Error('DEPLOYMENT_SCHEMA_INVALID');
  // Metadata only, before the write transaction. No inference or user prompts.
  const metadata = await operations.fetchMetadata();
  if (!Array.isArray(metadata) || metadata.length === 0) throw new Error('MODEL_METADATA_EMPTY');
  await connection.beginTransaction();
  try {
    const seeded = await seed(connection, metadata);
    await connection.commit();
    return { database, ...seeded, metadataModels: metadata.length,
      existingRowsOverwritten: false, paidInferenceCalls: 0 };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  let connection, locked = false;
  try {
    const options = modelSeedOptions(process.argv.slice(2), process.env);
    const report = await inspectMigrationDirectory(fileURLToPath(new URL('../migrations', import.meta.url)));
    if (hasErrors(report.diagnostics) || report.migrations.length !== 20
      || report.migrations.at(-1)?.id !== '020_guest_scheduled_demo') throw new Error('DEPLOYMENT_MIGRATION_SOURCE_INVALID');
    connection = await mysql.createConnection(options);
    await acquireMigrationLock(connection); locked = true;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    console.log(JSON.stringify(await seedDeploymentModels(connection, options.database, report.migrations,
      { fetchMetadata: () => fetchModelMetadata(client) }), null, 2));
  } catch (error) {
    // Never print provider errors, request headers, database credentials or URLs.
    const candidate = error.code || error.message;
    const code = /^[A-Z][A-Z0-9_]{2,80}$/.test(candidate) ? candidate : 'DEPLOYMENT_MODEL_SEED_FAILED';
    console.error(JSON.stringify({ completed: false, code,
      ...(Number.isInteger(error.status) ? { providerStatus: error.status } : {}) }));
    process.exitCode = 1;
  } finally {
    if (locked) await releaseMigrationLock(connection).catch(() => {});
    await connection?.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
