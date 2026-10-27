import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';
import { installAuthRoutes } from '../server/auth/auth-routes.js';
import { authenticationEnabled, authenticationMode } from '../server/auth/config.js';
import { createNativeLimiter, nativeOrigin } from '../server/auth/native-routes.js';
import { hashPassword, normalizeEmail, verifyPassword } from '../server/auth/passwords.js';
import { inspectMigrationDirectory } from '../server/migrations/status.js';
import { passwordRequirements, validateAuthFields } from '../shared/auth-validation.js';
import { scryptSync } from 'node:crypto';

async function fixture(t, { failed = false, duplicate = false, suspended = false, legacyHash = null } = {}) {
  const calls = [];
  let credential = legacyHash ? { user_id: 7, password_hash: legacyHash, status: 'active' } : null;
  const connection = {
    release() {}, async beginTransaction() { calls.push(['begin']); },
    async commit() { calls.push(['commit']); }, async rollback() { calls.push(['rollback']); },
    async execute(sql, values) {
      calls.push([sql, values]);
      if (failed) throw new Error('mysql://private-secret@internal');
      if (sql.startsWith('INSERT INTO users')) return [{ insertId: 7 }];
      if (sql.startsWith('INSERT INTO native_credentials')) {
        if (duplicate) throw Object.assign(new Error('private duplicate'), { code: 'ER_DUP_ENTRY' });
        credential = { user_id: values[0], password_hash: values[2], status: suspended ? 'suspended' : 'active' };
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('SELECT c.')) return [credential ? [credential] : []];
      if (sql.startsWith('SELECT id FROM users')) return [[{ id: 7 }]];
      if (sql.startsWith('INSERT INTO sessions')) return [{ insertId: 19 }];
      return [[]];
    },
  };
  const app = express(); app.use(express.json());
  installAuthRoutes(app, { env: { AUTH_PROVIDER: 'native', APP_ORIGIN: 'http://localhost:5173' }, getPool: () => ({ getConnection: async () => connection }) });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return { calls, request: (path, body, extra = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method: 'POST', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body),
  }) };
}
const registration = { displayName: 'Local Person', email: ' Person@Example.Test ', password: 'Lentera!9Kantor', whatsappNumber: '081234567890' };

test('password checklist reports each rule independently, including forward/reverse sequences', () => {
  assert.ok(passwordRequirements(registration.password).every((rule) => rule.passed));
  for (const [password, failing] of [
    ['lentera!9Kantor', 'capital'], ['Lentera!Kantor', 'number'], ['Lentera9Kantor', 'symbol'],
    ['La!9', 'length'], ['Lentera!123Kantor', 'sequence'], ['Lentera!321Kantor', 'sequence'],
    ['Lentera!aBc9Kantor', 'sequence'], ['Lentera!cBa9Kantor', 'sequence'],
  ]) assert.equal(passwordRequirements(password).find((rule) => rule.id === failing).passed, false, failing);
  assert.ok(passwordRequirements('').every((rule) => !rule.passed));
  assert.equal(passwordRequirements('Lentera 9Kantor').find((rule) => rule.id === 'symbol').passed, false);
  assert.equal(passwordRequirements('Loka!9Xm').find((rule) => rule.id === 'length').passed, true);
  assert.equal(passwordRequirements('Loka!9X').find((rule) => rule.id === 'length').passed, false);
  // The byte limit is an input bound, not a checklist requirement.
  assert.match(validateAuthFields({ ...registration, password: 'Lentera!9' + '界'.repeat(90) }, { register: true }).password, /256 byte/);
});

test('email validation and field errors are shared by the UI and server', () => {
  for (const value of ['person', 'person@', 'person@example', 'a..b@example.test', '.person@example.test', 'person@-example.test', 'person@example..test', 'person name@example.test']) assert.equal(normalizeEmail(value), null, value);
  assert.equal(normalizeEmail(' Person+tag@Sub.Example.Test '), 'person+tag@sub.example.test');
  assert.deepEqual(validateAuthFields(registration, { register: true }), {});
  assert.match(validateAuthFields({ email: 'wrong', password: 'legacy' }).email, /Format email/);
  assert.match(validateAuthFields({ email: '', password: '' }).email, /wajib/);
  assert.match(validateAuthFields({ email: '', password: '' }).password, /wajib/);
  assert.equal(validateAuthFields({ email: 'person@example.test', password: 'oldpassword' }).password, undefined);
  assert.match(validateAuthFields({ ...registration, password: 'oldpassword' }, { register: true }).password, /persyaratan/);
});

test('existing passwords that predate new signup policy can still log in', async (t) => {
  const password = 'a long unique passphrase';
  const salt = 'a'.repeat(32);
  const key = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const { request } = await fixture(t, { legacyHash: `scrypt$32768$8$1$${salt}$${key.toString('hex')}` });
  const response = await request('/auth/login', { email: 'person@example.test', password });
  assert.equal(response.status, 200);
});

test('registration enforces the checklist server-side before SQL', async (t) => {
  const { request, calls } = await fixture(t);
  for (const password of ['lentera!9Kantor', 'Lentera!Kantor', 'Lentera9Kantor', 'Lentera!123Kantor', 'Loka!9X', 'Lentera!9' + '界'.repeat(90)]) {
    assert.equal((await request('/auth/register', { ...registration, password })).status, 400);
  }
  assert.equal(calls.length, 0);
});

test('native is default, independent from Auth0; production requires an explicit HTTPS origin', () => {
  assert.equal(authenticationMode({}), 'native');
  assert.equal(authenticationEnabled({ AUTH0_ENABLED: '0' }), true);
  assert.equal(authenticationEnabled({ AUTH_PROVIDER: 'auth0', AUTH0_ENABLED: '0' }), false);
  assert.throws(() => authenticationMode({ AUTH_PROVIDER: 'unknown' }));
  assert.throws(() => nativeOrigin({ NODE_ENV: 'production' }));
  assert.throws(() => nativeOrigin({ NODE_ENV: 'production', APP_ORIGIN: 'http://example.test' }));
  assert.equal(nativeOrigin({ NODE_ENV: 'production', APP_ORIGIN: 'https://example.test' }), 'https://example.test');
  assert.equal(normalizeEmail(' Person@Example.Test '), 'person@example.test');
  assert.equal(normalizeEmail('invalid'), null);
});

test('salted scrypt verifies passwords, rejects wrong password and malformed hashes', async () => {
  const first = await hashPassword(registration.password);
  const second = await hashPassword(registration.password);
  assert.notEqual(first, second);
  assert.equal(first.includes(registration.password), false);
  assert.equal(await verifyPassword(registration.password, first), true);
  assert.equal(await verifyPassword('wrong password', first), false);
  assert.equal(await verifyPassword(registration.password, null), false);
  assert.equal(await verifyPassword(registration.password, 'scrypt$999999999$bad'), false);
  await assert.rejects(hashPassword('short'), { status: 400 });
  await assert.rejects(hashPassword('a'.repeat(257)), { status: 400 });
});

test('register and login create existing opaque sessions; no tenant claims or password plaintext are persisted', async (t) => {
  const { request, calls } = await fixture(t);
  const registered = await request('/auth/register', { ...registration, role: 'owner', organizationId: 888 });
  assert.equal(registered.status, 201);
  assert.deepEqual(await registered.json(), { next: '/login/complete' });
  assert.match(registered.headers.get('set-cookie'), /vo_session=.+; Path=\/; HttpOnly; SameSite=Lax/);
  assert.equal(calls.some(([sql]) => /organization_memberships|workspaces/.test(sql)), false);
  const insert = calls.find(([sql]) => sql.startsWith('INSERT INTO native_credentials'));
  assert.equal(insert[1][1], 'person@example.test');
  assert.match(insert[1][2], /^scrypt\$/);
  assert.equal(JSON.stringify(calls).includes(registration.password), false);
  const session = calls.find(([sql]) => sql.startsWith('INSERT INTO sessions'));
  assert.ok(Buffer.isBuffer(session[1][1])); assert.equal(session[1][1].length, 32);
  assert.equal(session[1][2], null);
  const logged = await request('/auth/login', registration);
  assert.equal(logged.status, 200);
  assert.notEqual(logged.headers.get('set-cookie'), registered.headers.get('set-cookie'));
  assert.equal(calls.filter(([sql]) => sql === 'commit').length, 2);
  const logout = await request('/auth/logout', {});
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
});

test('wrong, unknown and suspended accounts deny session issuance with identical responses', async (t) => {
  const { request, calls } = await fixture(t, { suspended: true });
  const unknown = await request('/auth/login', registration);
  assert.equal(unknown.status, 401); const expected = await unknown.json();
  await request('/auth/register', registration);
  const before = calls.filter(([sql]) => sql.startsWith('INSERT INTO sessions')).length;
  for (const body of [registration, { ...registration, password: 'incorrect password' }]) {
    const result = await request('/auth/login', body);
    assert.equal(result.status, 401); assert.deepEqual(await result.json(), expected);
  }
  assert.equal(calls.filter(([sql]) => sql.startsWith('INSERT INTO sessions')).length, before);
});

test('foreign/missing origins and non-JSON auth mutations are rejected before SQL', async (t) => {
  const { request, calls } = await fixture(t);
  for (const headers of [{ Origin: 'https://attacker.test' }, { Origin: '' }, { 'Content-Type': 'text/plain' }]) {
    for (const path of ['/auth/register', '/auth/login', '/auth/logout', '/auth/active-workspace']) {
      assert.equal((await request(path, registration, headers)).status, 403);
    }
  }
  assert.equal(calls.length, 0);
});

test('validation rejects weak passwords before SQL and SQL failures are sanitized', async (t) => {
  const { request, calls } = await fixture(t, { failed: true });
  assert.equal((await request('/auth/register', { ...registration, password: 'short' })).status, 400);
  assert.equal(calls.length, 0);
  const result = await request('/auth/register', registration);
  assert.equal(result.status, 503);
  assert.doesNotMatch(await result.text(), /private|mysql|internal/);
  assert.equal(calls.some(([sql]) => sql === 'rollback'), true);
  assert.equal(calls.some(([sql]) => sql === 'commit'), false);
  const logout = await request('/auth/logout', {}, { Cookie: `vo_session=${'a'.repeat(43)}` });
  assert.equal(logout.status, 503);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.doesNotMatch(await logout.text(), /private|mysql|internal/);
});

test('duplicate registration rolls back the new user and cannot link an external identity', async (t) => {
  const { request, calls } = await fixture(t, { duplicate: true });
  const result = await request('/auth/register', registration);
  assert.equal(result.status, 400);
  assert.equal(result.headers.has('set-cookie'), false);
  assert.equal(calls.some(([sql]) => sql === 'rollback'), true);
  assert.equal(calls.some(([sql]) => sql.startsWith('INSERT INTO sessions')), false);
  assert.equal(calls.some(([sql]) => sql.startsWith('UPDATE users')), false);
});

test('limiter bounds account and IP attempts, expires windows and never retains raw emails', () => {
  let now = 0;
  const allow = createNativeLimiter({ now: () => now });
  for (let i = 0; i < 10; i++) assert.equal(allow('one', 'person@example.test'), true);
  assert.equal(allow('another', 'person@example.test'), false);
  for (let i = 0; i < 20; i++) assert.equal(allow('one', `other${i}@example.test`), true);
  assert.equal(allow('one', 'new@example.test'), false);
  now = 15 * 60 * 1000;
  assert.equal(allow('one', 'person@example.test'), true);
});

test('native migration is registered, hashed, and creates only a separate credential table', async () => {
  const report = await inspectMigrationDirectory(fileURLToPath(new URL('../migrations/', import.meta.url)));
  assert.equal(report.diagnostics.some((entry) => entry.level === 'error'), false);
  const migration = report.migrations.find((entry) => entry.id === '003_native_credentials');
  assert.match(migration.checksum, /^[a-f0-9]{64}$/);
  const sql = await readFile(new URL('../migrations/003_native_credentials.sql', import.meta.url), 'utf8');
  assert.match(sql, /UNIQUE KEY uq_native_credentials_email/);
  assert.match(sql, /FOREIGN KEY \(user_id\) REFERENCES users\(id\)/);
  assert.doesNotMatch(sql, /\b(ALTER|DROP|UPDATE|INSERT|DELETE FROM)\b/i);
});

test('native schema validator rejects missing or malformed uniqueness and foreign key definitions', async () => {
  const connection = { execute: async (sql) => {
    if (sql.includes("table_name = 'native_credentials'") && sql.includes('statistics')) return [[{ name: 'uq_native_credentials_email', columnName: 'email_normalized', nonUnique: 1 }]];
    if (sql.includes("table_name = 'native_credentials'") && sql.includes('key_column_usage')) return [[{ columnName: 'user_id', referencedTable: 'organizations', referencedColumn: 'id' }]];
    return [[]];
  } };
  const result = await validateCurrentSchema(connection, { requireNativeCredentials: true });
  assert.equal(result.valid, false);
  assert.ok(result.differences.some((entry) => entry.table === 'native_credentials' && entry.reason === 'table_missing'));
  assert.ok(result.differences.some((entry) => entry.index === 'uq_native_credentials_email' && entry.reason === 'unique_index_mismatch'));
  assert.ok(result.differences.some((entry) => entry.constraint === 'fk_native_credentials_user' && entry.reason === 'foreign_key_mismatch'));
});
