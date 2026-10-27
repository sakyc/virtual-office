import 'dotenv/config';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { migrationConnectionOptions } from '../server/migrations/database.js';
import { readCatalog, requirePlatformAdmin, updateCatalogPlan } from '../server/billing-catalog.js';
import { createBillingService } from '../server/billing.js';
import { issueSession, revokeSession } from '../server/auth/sessions.js';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';
import { inspectMigrationDirectory, inspectDatabaseHistory } from '../server/migrations/status.js';
import { fileURLToPath } from 'node:url';

assert.equal(process.env.ADMIN_CATALOG_LOCAL_VERIFY, '1');
const options = migrationConnectionOptions();
assert(['localhost','127.0.0.1','::1'].includes(options.host));
assert.equal(options.database, 'virtual_office'); assert.equal(options.port, 3306);
assert.notEqual(process.env.NODE_ENV, 'production');
let c, outer = false;
try {
  c = await mysql.createConnection(options);
  const [[identity]] = await c.execute('SELECT DATABASE() AS db, @@datadir AS datadir');
  assert.equal(identity.db, 'virtual_office'); assert.match(identity.datadir.replaceAll('\\','/'), /^C:\/laragon\/data\/mysql-8\//i);
  const manifest = await inspectMigrationDirectory(fileURLToPath(new URL('../migrations', import.meta.url)));
  assert.deepEqual(manifest.diagnostics, []);
  const history = await inspectDatabaseHistory(c, manifest.migrations);
  assert.deepEqual(history.diagnostics, []); assert(history.history.some((h) => h.migration_id === '009_admin_catalog'));
  const validation = await validateCurrentSchema(c, { requireTenantFoundation: true, requireNativeCredentials: true, requireAiUsage: true, requireWorkspaceTeam: true, requireChatHistory: true, requireChatModelSelection: true, requireBilling: true, requireAdminCatalog: true, requirePlatformAdminAudit: history.history.some((h) => h.migration_id === '010_platform_admin_audit') });
  assert.equal(validation.valid, true);
  const tables = ['platform_admins','billing_catalog_audit','sessions','billing_subscriptions','billing_wallets','billing_credit_grants','billing_holds','billing_ledger'];
  async function counts() { const result = {}; for (const table of tables) { const [[row]] = await c.execute(`SELECT COUNT(*) AS n FROM ${table}`); result[table] = row.n; } return result; }
  const beforeCounts = await counts(), originalCatalog = await readCatalog(c, { admin: true });
  await c.beginTransaction(); outer = true;
  const [[user]] = await c.execute("SELECT id FROM users WHERE status = 'active' ORDER BY id LIMIT 1");
  assert(user, 'An existing active user is required for rollback-only verification.');
  // Every grant, session, catalog edit and credit below is discarded by outer rollback.
  await c.execute("INSERT INTO platform_admins (user_id, approval_reference) VALUES (?, 'rollback-only-fixture') ON DUPLICATE KEY UPDATE revoked_at = NULL", [user.id]);
  const session = await issueSession(c, { userId: user.id });
  const req = { headers: { cookie: `vo_session=${session.token}` } };
  const principal = await requirePlatformAdmin(c, req); assert.equal(principal.userId, user.id);
  const starter = originalCatalog.find((p) => p.code === 'starter'); assert(starter);
  const form = (p, overrides = {}) => ({ expectedVersion: p.version, name: p.name, monthlyPriceIdr: p.monthlyPriceIdr, includedCreditIdr: p.includedCreditIdr,
    maxDivisions: p.maxDivisions, maxMembers: p.maxMembers, whatsapp: Boolean(p.whatsapp), isPublic: Boolean(p.isPublic), reason: 'Rollback-only local verification', ...overrides });
  const next = await updateCatalogPlan(c, principal, 'starter', form(starter, { monthlyPriceIdr: '177777', includedCreditIdr: '60000', isPublic: true }));
  assert.equal(next.version, starter.version + 1);
  assert.equal((await readCatalog(c)).find((p) => p.code === 'starter').monthlyPriceIdr, '177777');
  const [[audit]] = await c.execute('SELECT actor_user_id, before_snapshot, after_snapshot FROM billing_catalog_audit WHERE plan_code = ? AND plan_version = ?', ['starter', next.version]);
  assert.equal(audit.actor_user_id, user.id);
  const parse = (v) => typeof v === 'string' ? JSON.parse(v) : v;
  assert.equal(parse(audit.before_snapshot).monthlyPriceIdr, starter.monthlyPriceIdr);
  assert.equal(parse(audit.after_snapshot).monthlyPriceIdr, '177777');
  await assert.rejects(updateCatalogPlan(c, principal, 'starter', form(starter)), { code: 'CATALOG_VERSION_CONFLICT' });
  await c.query('SAVEPOINT audit_failure');
  await assert.rejects(updateCatalogPlan(c, { userId: 9007199254740991 }, 'starter', form(next)), { code: 'ER_NO_REFERENCED_ROW_2' });
  await c.query('ROLLBACK TO SAVEPOINT audit_failure');
  assert.equal((await readCatalog(c)).find((p) => p.code === 'starter').version, next.version);
  const hidden = await updateCatalogPlan(c, principal, 'starter', form(next, { isPublic: false }));
  assert.ok(!(await readCatalog(c)).some((p) => p.code === 'starter'));
  const visible = await updateCatalogPlan(c, principal, 'starter', form(hidden, { isPublic: true }));
  const [[org]] = await c.execute("SELECT o.id FROM organizations o LEFT JOIN billing_subscriptions s ON s.organization_id = o.id WHERE o.status = 'active' AND s.organization_id IS NULL ORDER BY o.id LIMIT 1");
  assert(org, 'An existing unsubscribed active organization is required; no tenant will be created.');
  const adapter = { execute: (...args) => c.execute(...args), beginTransaction: () => c.query('SAVEPOINT subscription_operation'), commit: () => c.query('RELEASE SAVEPOINT subscription_operation'), rollback: () => c.query('ROLLBACK TO SAVEPOINT subscription_operation'), release() {} };
  const service = createBillingService(() => ({ getConnection: async () => adapter }));
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0,0,0,0); const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  const activation = { organizationId: org.id, key: randomUUID(), planCode: 'starter', periodStart: start.toISOString(), periodEnd: end.toISOString(), approvalReference: 'rollback-only-verification' };
  const first = await service.startSubscription(activation); assert.equal(first.terms.price, '177777'); assert.equal(first.planVersion, visible.version);
  await updateCatalogPlan(c, principal, 'starter', form(visible, { monthlyPriceIdr: '188888' }));
  assert.deepEqual(await service.startSubscription(activation), first);
  const [[snapshot]] = await c.execute('SELECT CAST(monthly_price_idr AS CHAR) AS price, plan_version FROM billing_subscriptions WHERE organization_id = ?', [org.id]);
  assert.equal(snapshot.price, '177777'); assert.equal(snapshot.plan_version, visible.version);
  await c.execute('UPDATE platform_admins SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ?', [user.id]);
  await assert.rejects(requirePlatformAdmin(c, req), { code: 'PLATFORM_ADMIN_REQUIRED' });
  await revokeSession(c, session.id);
  await assert.rejects(requirePlatformAdmin(c, req), { code: 'SESSION_REQUIRED' });
  await c.rollback(); outer = false;
  assert.deepEqual(await counts(), beforeCounts); assert.deepEqual(await readCatalog(c, { admin: true }), originalCatalog);
  console.log(JSON.stringify({ database: identity.db, validation, checks: ['history-checksums','real-session-platform-grant','catalog-and-audit-atomicity','stale-version-denial','audit-foreign-key-failure-rollback','hidden-public-plans','database-priced-activation','immutable-subscription-snapshot-and-retry','grant-revocation','session-revocation','rollback-preserves-counts-and-catalog'], allFixtureWritesRolledBack: true, persistentAdminsGranted: 0, newDatabaseCreated: false, paidProviderCalls: 0 }));
} catch (error) {
  console.error(JSON.stringify({ failed: true, code: error.code || 'LOCAL_CATALOG_CHECK_FAILED', message: error.code === 'ERR_ASSERTION' ? error.message : 'Local admin catalog verification failed.' })); process.exitCode = 1;
} finally { if (outer) await c?.rollback(); await c?.end(); }
