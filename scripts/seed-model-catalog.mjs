import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { connectApprovedNonProduction, migrationConnectionOptions } from '../server/migrations/database.js';
import { seedModelCatalog, fetchModelMetadata } from '../server/model-catalog.js';
import { validateHistory, acquireMigrationLock, releaseMigrationLock } from '../server/migrations/framework.js';
import { inspectMigrationDirectory } from '../server/migrations/status.js';
import { fileURLToPath } from 'node:url';

let c, locked = false;
try {
  const options = migrationConnectionOptions();
  if (process.argv.slice(2).join(' ') !== '--confirm-non-production' || process.env.NODE_ENV === 'production'
    || !['localhost','127.0.0.1','::1'].includes(options.host) || options.port !== 3306 || options.database !== 'virtual_office') throw Error('LOCAL_TARGET_REQUIRED');
  c = await connectApprovedNonProduction();
  const [[target]] = await c.execute('SELECT DATABASE() AS db,@@datadir AS datadir');
  if (target.db !== 'virtual_office' || !/^C:\/laragon\/data\/mysql-8\//i.test(target.datadir.replaceAll('\\','/'))) throw Error('LOCAL_TARGET_REQUIRED');
  const manifest = await inspectMigrationDirectory(fileURLToPath(new URL('../migrations', import.meta.url)));
  if (manifest.diagnostics.length) throw Error('MIGRATION_SOURCE_INVALID');
  await acquireMigrationLock(c); locked = true;
  await validateHistory(c, manifest.migrations);
  const [[migration]] = await c.execute("SELECT status FROM schema_migrations WHERE migration_id='013_ai_model_catalog'");
  if (migration?.status !== 'applied') throw Error('MODEL_CATALOG_MIGRATION_REQUIRED');
  if (!process.env.ANTHROPIC_API_KEY) throw Error('ANTHROPIC_METADATA_KEY_REQUIRED');
  const metadata = await fetchModelMetadata(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
  await c.beginTransaction();
  const result = await seedModelCatalog(c, metadata);
  await c.commit();
  console.log(JSON.stringify({ ...result, metadataModels: metadata.length, existingRowsOverwritten: false, paidInferenceCalls: 0 }));
} catch (error) {
  await c?.rollback().catch(() => {});
  // Provider errors may contain request details: expose only bounded safe codes.
  const code = /^[A-Z][A-Z0-9_]{2,80}$/.test(error.message) ? error.message : 'MODEL_CATALOG_SEED_FAILED';
  console.error(JSON.stringify({ completed: false, code })); process.exitCode = 1;
} finally {
  if (locked) await releaseMigrationLock(c).catch(() => {});
  await c?.end();
}
