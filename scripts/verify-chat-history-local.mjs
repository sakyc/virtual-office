// Explicit local-only integration. Creates a unique disposable schema, never opens
// the development database and never drops any schema. Provider calls are mocked.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import express from 'express';
import { migrationConnectionOptions } from '../server/migrations/database.js';
import { inspectMigrationDirectory } from '../server/migrations/status.js';
import { applyMigrations, acquireMigrationLock, releaseMigrationLock } from '../server/migrations/framework.js';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';
import { createChatHistoryStore } from '../server/chat-history.js';
import { installOfficeChatRoutes } from '../server/office-chat.js';
import { addDivision, addAgent, resolveWorkspaceAgent } from '../server/workspace-team.js';
import { issueSession } from '../server/auth/sessions.js';
import { createTenantGate } from '../server/auth/tenant-gate.js';

let admin, c, pool, server, database;
const checks = [];
const check = (name) => { checks.push(name); console.log(JSON.stringify({ check: name, passed: true })); };
try {
  assert.equal(process.env.CHAT_HISTORY_LOCAL_TEST, '1', 'EXPLICIT_LOCAL_TEST_REQUIRED');
  assert.notEqual(process.env.NODE_ENV, 'production', 'PRODUCTION_FORBIDDEN');
  const options = migrationConnectionOptions();
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(options.host), 'LOOPBACK_REQUIRED');
  assert.equal(options.port, 3306, 'EXPECTED_LOCAL_PORT_REQUIRED');
  const processes = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Process -Filter "Name=\'mysqld.exe\'").ExecutablePath | ConvertTo-Json -Compress'], { encoding: 'utf8', windowsHide: true }));
  assert.ok([processes].flat().some((path) => typeof path === 'string' && path.replaceAll('\\', '/').toLowerCase() === 'c:/laragon/bin/mysql/mysql-8.0.30-winx64/bin/mysqld.exe'), 'KNOWN_LOCAL_MYSQL_REQUIRED');
  admin = await mysql.createConnection({ ...options, database: undefined });
  const [[identity]] = await admin.execute('SELECT @@datadir AS directory');
  assert.equal(identity.directory.replaceAll('\\', '/').toLowerCase(), 'c:/laragon/data/mysql-8/', 'LOCAL_DATA_DIRECTORY_REQUIRED');
  database = `vo_chat_test_${Date.now()}_${randomBytes(3).toString('hex')}`;
  assert.match(database, /^vo_chat_test_\d+_[a-f0-9]{6}$/);
  await admin.execute(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  c = await mysql.createConnection({ ...options, database });
  pool = mysql.createPool({ ...options, database, connectionLimit: 8 });
  const report = await inspectMigrationDirectory(fileURLToPath(new URL('../migrations/', import.meta.url)));
  assert.deepEqual(report.diagnostics, []);
  await acquireMigrationLock(c);
  try { assert.equal((await applyMigrations(c, report.migrations)).length, 6); assert.deepEqual(await applyMigrations(c, report.migrations), []); }
  finally { await releaseMigrationLock(c); }
  const validation = await validateCurrentSchema(c, { requireTenantFoundation: true, requireNativeCredentials: true, requireAiUsage: true, requireWorkspaceTeam: true, requireChatHistory: true });
  assert.deepEqual(validation, { valid: true, differences: [] });
  const [history] = await c.execute('SELECT migration_id, checksum, status FROM schema_migrations ORDER BY migration_id');
  assert.ok(history.every((row, index) => row.status === 'applied' && row.checksum === report.migrations[index].checksum));
  check('001-through-006-schema-checksums-and-duplicate-prevention');

  async function user(subject) { const [row] = await c.execute('INSERT INTO users (provider_issuer, external_subject, email) VALUES (?, ?, ?)', ['https://fixture.invalid', subject, `${subject}@example.test`]); return row.insertId; }
  const userId = await user('owner'), otherUser = await user('other');
  const [org] = await c.execute('INSERT INTO organizations (slug, name, created_by_user_id) VALUES (?, ?, ?)', ['chat-test', 'Chat fixture', userId]);
  const [org2] = await c.execute('INSERT INTO organizations (slug, name, created_by_user_id) VALUES (?, ?, ?)', ['other-chat-test', 'Other fixture', userId]);
  async function workspace(organizationId, slug) {
    const [row] = await c.execute('INSERT INTO workspaces (organization_id, slug, name, created_by_user_id) VALUES (?, ?, ?, ?)', [organizationId, slug, 'Fixture', userId]);
    for (const id of [userId, otherUser]) await c.execute('INSERT INTO workspace_memberships (workspace_id, user_id, role, created_by_user_id) VALUES (?, ?, ?, ?)', [row.insertId, id, 'member', userId]);
    return { organizationId, workspaceId: row.insertId, userId };
  }
  const ctx = await workspace(org.insertId, 'main'), otherWs = await workspace(org.insertId, 'other'), otherOrg = await workspace(org2.insertId, 'other-org');
  const division = await addDivision(c, ctx, userId, { name: 'Fixture division' });
  const agentId = await addAgent(c, ctx, userId, division, { name: 'Fixture agent', role: 'Writer', instructions: 'No real provider', modelTier: 'team' });
  const secondAgent = await addAgent(c, ctx, userId, division, { name: 'Other agent', role: 'Writer', instructions: 'Fixture only', modelTier: 'team' });
  const store = createChatHistoryStore(() => pool), conversation = await store.create(ctx, agentId);
  const attempts = await Promise.allSettled([store.begin(ctx, conversation.id, agentId, 'A'), store.begin(ctx, conversation.id, agentId, 'B')]);
  assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(attempts.find((r) => r.status === 'rejected').reason.status, 409);
  await store.finish(ctx, attempts.find((r) => r.status === 'fulfilled').value, 'Complete fixture');
  assert.equal((await createChatHistoryStore(() => pool).read(ctx, conversation.id)).messages.length, 2);
  check('real-row-lock-concurrency-and-store-restart-persistence');
  for (const foreign of [{ ...ctx, userId: otherUser }, otherWs, otherOrg]) {
    await assert.rejects(store.read(foreign, conversation.id), { status: 404 });
    await assert.rejects(store.update(foreign, conversation.id, { archive: true }), { status: 404 });
  }
  await assert.rejects(store.begin(ctx, conversation.id, secondAgent, 'Wrong agent'), { status: 404 });
  check('private-user-workspace-organization-and-agent-isolation');
  const oldTurn = await store.begin(ctx, conversation.id, agentId, 'Expired');
  await c.execute('UPDATE chat_conversations SET pending_at = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 6 MINUTE) WHERE id = ?', [conversation.id]);
  const current = await store.begin(ctx, conversation.id, agentId, 'Replacement');
  await assert.rejects(store.finish(ctx, oldTurn, 'Late'), { status: 409 });
  await store.fail(ctx, oldTurn);
  await store.finish(ctx, current, 'New result');
  check('expired-lease-recovery-rejects-late-stream');
  await assert.rejects(c.execute("INSERT INTO chat_messages (conversation_id, turn_id, role, content, status) VALUES (?, ?, 'assistant', 'Duplicate', 'complete')", [conversation.id, current.token]), { code: 'ER_DUP_ENTRY' });
  await assert.rejects(c.execute("INSERT INTO chat_messages (conversation_id, turn_id, role, content, status) VALUES (?, ?, 'user', 'Orphan', 'pending')", [randomUUID(), randomUUID()]), { code: 'ER_NO_REFERENCED_ROW_2' });
  check('mysql-message-uniqueness-and-foreign-key-enforced');
  // Enough complete messages to exercise both pagination and bounded model context.
  for (let i = 0; i < 51; i++) { const turn = await store.begin(ctx, conversation.id, agentId, `Page ${i}`); await store.finish(ctx, turn, `Reply ${i}`); }
  const page = await store.read(ctx, conversation.id); assert.equal(page.messages.length, 100); assert.ok(page.nextBefore);
  const older = await store.read(ctx, conversation.id, page.nextBefore); assert.equal(older.messages.length, 6);
  assert.ok(!older.messages.some((m) => page.messages.some((n) => m.id === n.id)));
  const bounded = await store.begin(ctx, conversation.id, agentId, 'Bounded'); assert.equal(bounded.messages.length, 19); await store.fail(ctx, bounded);
  check('message-pagination-and-18-message-server-context');

  const session = await issueSession(c, { userId, activeWorkspaceId: ctx.workspaceId });
  const app = express(); app.use(express.json()); let providerFailure = false, providerCalls = 0;
  installOfficeChatRoutes(app, { historyStore: store, appOrigin: 'http://localhost:5173', requireTenant: createTenantGate({ getPool: () => pool, authEnabled: true, resourceQueriesScoped: true }),
    models: { team: 'fixture-team', leader: 'fixture-leader' }, rateLimit: (_q, _s, next) => next(), dailyCap: (_q, _s, next) => next(),
    resolveAgent: async (tenant, id) => { const conn = await pool.getConnection(); try { return await resolveWorkspaceAgent(conn, tenant, id); } finally { conn.release(); } },
    client: { messages: { stream() { providerCalls++; return { on(_event, fn) { fn('Fixture output'); }, abort() {}, async finalMessage() { if (providerFailure) throw new Error('private fixture error'); } }; } } },
  });
  server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const request = (path, method = 'GET', body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/office/${path}`, { method, headers: { Cookie: `vo_session=${session.token}`, Origin: 'http://localhost:5173', 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const scope = (await (await request('chat/context')).json()).scope;
  const created = await (await request('conversations', 'POST', { agentId })).json();
  const sendBody = { scope, agentId, conversationId: created.id, content: 'Hello fixture' };
  assert.match(await (await request('chat', 'POST', sendBody)).text(), /"done":true/);
  assert.equal((await (await request(`conversations/${created.id}`)).json()).messages.length, 2);
  providerFailure = true;
  const failed = await (await request('chat', 'POST', sendBody)).text(); assert.match(failed, /"error"/); assert.doesNotMatch(failed, /private fixture|"done"/);
  assert.equal((await store.read(ctx, created.id)).messages.length, 2); assert.equal(providerCalls, 2);
  check('real-session-http-stream-persists-only-completed-replies');
  assert.equal((await request('chat', 'POST', { ...sendBody, organizationId: 99 })).status, 400);
  assert.equal((await request(`conversations/${created.id}`, 'PATCH', { title: 'Forged origin' }, { Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await request(`conversations/${created.id}`, 'PATCH', { title: 'Renamed fixture' })).status, 200);
  assert.equal((await store.read(ctx, created.id)).title, 'Renamed fixture');
  assert.equal((await request(`conversations/${created.id}`, 'PATCH', { archive: true })).status, 200);
  assert.equal((await request(`conversations/${created.id}`)).status, 404);
  check('rename-archive-csrf-and-forged-identity');
  await c.execute("UPDATE workspace_memberships SET role = 'viewer' WHERE workspace_id = ? AND user_id = ?", [ctx.workspaceId, userId]);
  assert.equal((await request(`conversations?agentId=${agentId}`)).status, 403);
  await c.execute("UPDATE workspace_memberships SET role = 'member' WHERE workspace_id = ? AND user_id = ?", [ctx.workspaceId, userId]);
  await c.execute('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?', [session.id]);
  assert.equal((await request(`conversations?agentId=${agentId}`)).status, 401);
  assert.equal((await request(`conversations?agentId=${agentId}`, 'GET', undefined, { Cookie: '' })).status, 401);
  check('viewer-revoked-and-missing-session-denial');
  console.log(JSON.stringify({ database, validation, checks: checks.length, retained: true, developmentDatabaseTouched: false, paidProviderCalls: 0 }));
} catch (error) {
  console.error(JSON.stringify({ failed: true, database, code: error.code || 'LOCAL_CHAT_TEST_FAILED', assertion: typeof error.actual === 'number' ? { actual: error.actual, expected: error.expected } : undefined, message: 'Local isolated chat verification failed; no development database was opened.' }));
  process.exitCode = 1;
} finally {
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  await pool?.end(); await c?.end(); await admin?.end();
}
