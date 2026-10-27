// Explicit operator command: never imported by application startup.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { migrationConnectionOptions, connectApprovedNonProduction } from '../server/migrations/database.js';
import { inspectMigrationDirectory, inspectDatabaseHistory } from '../server/migrations/status.js';
import { acquireMigrationLock, releaseMigrationLock, applyMigrations } from '../server/migrations/framework.js';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';
import { loadTaskTemplates, saveTaskTemplate } from '../server/task-templates.js';

const flags = { requireTenantFoundation: true, requireNativeCredentials: true, requireAiUsage: true, requireWorkspaceTeam: true, requireChatHistory: true, requireChatModelSelection: true, requireBilling: true, requireAdminCatalog: true, requirePlatformAdminAudit: true, requireAiBilling: true, requireBillingAdmin: true, requireModelCatalog: true };
let c, locked = false, backup, step = 'target';
try {
  assert.equal(process.argv.slice(2).join(' '), '--confirm-non-production');
  const options = migrationConnectionOptions();
  assert.notEqual(process.env.NODE_ENV, 'production'); assert.equal(options.database, 'virtual_office'); assert.equal(options.port, 3306);
  assert(['127.0.0.1', 'localhost', '::1'].includes(options.host));
  c = await connectApprovedNonProduction();
  const [[target]] = await c.execute('SELECT DATABASE() AS db, @@datadir AS datadir');
  assert.equal(target.db, 'virtual_office'); assert.match(target.datadir.replaceAll('\\', '/'), /^C:\/laragon\/data\/mysql-8\//i);
  await acquireMigrationLock(c); locked = true;
  const manifest = await inspectMigrationDirectory(fileURLToPath(new URL('../migrations', import.meta.url))); assert.deepEqual(manifest.diagnostics, []);
  const history = await inspectDatabaseHistory(c, manifest.migrations); assert.deepEqual(history.diagnostics, []);
  const recorded = new Set(history.history.map(row => row.migration_id));
  const pending = manifest.migrations.filter(m => !recorded.has(m.id)).map(m => m.id);
  assert.deepEqual(pending, ['014_task_templates']);
  assert.deepEqual(await validateCurrentSchema(c, flags), { valid: true, differences: [] });
  const [tables] = await c.execute('SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name');
  async function fingerprint() {
    const out = {};
    for (const { name } of tables) {
      assert(/^[a-z0-9_]+$/.test(name)); if (name === 'schema_migrations') continue;
      const [rows] = await c.query('SELECT * FROM `' + name + '`');
      out[name] = createHash('sha256').update(JSON.stringify(rows.map(row => JSON.stringify(row)).sort())).digest('hex');
    }
    return out;
  }
  const before = await fingerprint(); step = 'backup';
  const directory = await mkdtemp('D:/VetendCode/database-backups/virtual-office-before-014-'); backup = directory + '/before-014.sql';
  await new Promise((resolve, reject) => {
    const child = spawn('C:/laragon/bin/mysql/mysql-8.0.30-winx64/bin/mysqldump.exe', [
      '--host=' + options.host, '--port=' + options.port, '--user=' + options.user, '--single-transaction', '--skip-lock-tables', '--no-tablespaces', '--set-gtid-purged=OFF', '--column-statistics=0', '--hex-blob', '--result-file=' + backup, options.database,
    ], { env: { ...process.env, MYSQL_PWD: options.password }, windowsHide: true, stdio: 'ignore' });
    child.once('error', () => reject(Error('BACKUP_EXEC_FAILED'))); child.once('exit', code => code === 0 ? resolve() : reject(Error('BACKUP_FAILED')));
  });
  const dump = await readFile(backup); assert(dump.length > 0); assert(dump.includes(Buffer.from('-- Dump completed on')));
  assert.deepEqual(await fingerprint(), before, 'DATA_CHANGED_BEFORE_APPLY');
  console.log(JSON.stringify({ backup, bytes: dump.length, sha256: createHash('sha256').update(dump).digest('hex'), restoreRehearsed: false }));
  step = 'apply'; const applied = await applyMigrations(c, manifest.migrations); assert.deepEqual(applied.map(m => m.name), ['014_task_templates']);
  step = 'verify'; const validation = await validateCurrentSchema(c, { ...flags, requireTaskTemplates: true }); assert.deepEqual(validation, { valid: true, differences: [] });
  assert.deepEqual(await fingerprint(), before, 'EXISTING_DATA_CHANGED');
  assert.deepEqual((await inspectDatabaseHistory(c, manifest.migrations)).diagnostics, []);
  assert.deepEqual(await applyMigrations(c, manifest.migrations), []);
  console.log(JSON.stringify({ applied: applied.map(m => m.name), validation, checksumsValid: true, rerunApplied: [], existingDataUnchanged: true }));
  step = 'rollback-only-fixtures';
  const [[workspace]] = await c.execute("SELECT id, organization_id AS organizationId, created_by_user_id AS userId FROM workspaces WHERE status = 'active' ORDER BY id LIMIT 1");
  assert(workspace, 'ACTIVE_WORKSPACE_REQUIRED_FOR_ROLLBACK_TEST');
  const tenant = { organizationId: workspace.organizationId, workspaceId: workspace.id };
  await c.beginTransaction();
  try {
    await c.execute("SELECT id FROM workspaces WHERE organization_id = ? AND id = ? AND status = 'active' FOR UPDATE", [tenant.organizationId, tenant.workspaceId]);
    const input = { name: 'Rollback-only verification', description: 'Not retained', instructions: 'Produce a draft.', outputFormat: 'Document', fields: [] };
    const { id } = await saveTaskTemplate(c, tenant, workspace.userId, input);
    assert((await loadTaskTemplates(c, tenant)).some(row => row.id === id && row.version === 1));
    assert(!(await loadTaskTemplates(c, { ...tenant, workspaceId: 0 })).some(row => row.id === id));
    assert(!(await loadTaskTemplates(c, { ...tenant, organizationId: 0 })).some(row => row.id === id));
    await saveTaskTemplate(c, tenant, workspace.userId, { ...input, name: 'Updated', version: 1 }, id);
    await assert.rejects(saveTaskTemplate(c, tenant, workspace.userId, { ...input, version: 1 }, id), { status: 409 });
    await assert.rejects(c.execute('INSERT INTO workspace_task_templates (id, organization_id, workspace_id, name, description, definition, created_by_user_id, updated_by_user_id) SELECT id, organization_id, workspace_id, name, description, definition, created_by_user_id, updated_by_user_id FROM workspace_task_templates WHERE id = ?', [id]), { code: 'ER_DUP_ENTRY' });
    await assert.rejects(c.execute('UPDATE workspace_task_templates SET created_by_user_id = 0 WHERE id = ?', [id]), { code: 'ER_NO_REFERENCED_ROW_2' });
    await c.execute("UPDATE workspace_task_templates SET status = 'archived', archived_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
    assert(!(await loadTaskTemplates(c, tenant)).some(row => row.id === id));
  } finally { await c.rollback(); }
  const [[count]] = await c.execute('SELECT COUNT(*) AS count FROM workspace_task_templates'); assert.equal(Number(count.count), 0);
  assert.deepEqual(await fingerprint(), before, 'EXISTING_DATA_CHANGED');
  console.log(JSON.stringify({ realMysqlCrud: true, crossScopeDenial: true, versionConflict: true, primaryKeyEnforced: true, foreignKeyEnforced: true, archive: true, fixtureRowsRetained: 0, paidProviderCalls: 0 }));
} catch (error) {
  console.error(JSON.stringify({ failed: true, step, code: error.code || 'LOCAL_TASK_TEMPLATE_FAILED', backup })); process.exitCode = 1;
} finally { if (locked) await releaseMigrationLock(c).catch(() => {}); await c?.end(); }
