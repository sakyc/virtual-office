import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { installPasswordRoutes } from '../server/auth/password-routes.js';
import { hashPassword, verifyPassword } from '../server/auth/passwords.js';

const oldPassword = 'Lentera!9Kantor';
const newPassword = 'Mentari!7Ruang';
const oldHash = await hashPassword(oldPassword);

async function fixture(t, { revoked = false, missing = false, fail = false, expiredOnLock = false } = {}) {
  const calls = [];
  let hash = oldHash;
  let snapshot;
  const connection = {
    release() {},
    async beginTransaction() { snapshot = hash; calls.push({ type: 'begin' }); },
    async rollback() { if (snapshot) hash = snapshot; calls.push({ type: 'rollback' }); },
    async commit() { calls.push({ type: 'commit' }); },
    async execute(sql, values) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT s.id, s.user_id')) return [[{ id: 4, user_id: 7, user_status: 'active', revoked_at: revoked ? new Date() : null, idle_expires_at: new Date(Date.now() + 60000), absolute_expires_at: new Date(Date.now() + 60000) }]];
      if (sql.startsWith('SELECT password_hash')) return [missing ? [] : [{ password_hash: hash }]];
      if (sql.startsWith('SELECT s.id FROM')) return [expiredOnLock ? [] : [{ id: 4 }]];
      if (sql.startsWith('UPDATE native_credentials')) { hash = values[0]; return [{ affectedRows: 1 }]; }
      if (sql.includes("revoked_reason = 'password_changed'") && fail) throw new Error('mysql://private-secret@internal');
      return [{ affectedRows: 1 }];
    },
  };
  const app = express(); app.use(express.json());
  installPasswordRoutes(app, { getPool: () => ({ getConnection: async () => connection }), appOrigin: 'http://localhost:5173', production: true });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return { calls, hash: () => hash, request: (body = { currentPassword: oldPassword, newPassword }, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/account/password`, { method: 'POST', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', Cookie: `vo_session=${'a'.repeat(43)}`, ...headers }, body: JSON.stringify(body) }) };
}

test('password change verifies old hash, hashes replacement, revokes every user session and clears secure cookie', async (t) => {
  const f = await fixture(t); const response = await f.request();
  assert.equal(response.status, 200); assert.equal((await response.json()).next, '/login');
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Max-Age=0; Secure/);
  assert.equal(await verifyPassword(newPassword, f.hash()), true);
  assert.equal(await verifyPassword(oldPassword, f.hash()), false);
  const update = f.calls.find(({ sql }) => sql?.startsWith('UPDATE native_credentials'));
  assert.equal(update.values[1], 7); assert.ok(!JSON.stringify(f.calls).includes(newPassword));
  assert.deepEqual(f.calls.find(({ sql }) => sql?.includes("revoked_reason = 'password_changed'")).values, [7]);
  assert.match(f.calls.find(({ sql }) => sql?.startsWith('SELECT password_hash')).sql, /FOR UPDATE/);
  assert.equal(f.calls.at(-1).type, 'commit');
});

test('invalid fields, forged identity, origin and content type cannot reach SQL', async (t) => {
  const f = await fixture(t);
  for (const body of [null, [], {}, { currentPassword: oldPassword, newPassword: 'weak' }, { currentPassword: oldPassword, newPassword: oldPassword }, { currentPassword: oldPassword, newPassword, userId: 99 }, { currentPassword: oldPassword, newPassword: 'Mentari!7' + '界'.repeat(90) }]) assert.equal((await f.request(body)).status, 400);
  assert.equal((await f.request(undefined, { Origin: 'https://attacker.test' })).status, 403);
  assert.equal((await f.request(undefined, { 'Content-Type': 'text/plain' })).status, 403);
  assert.equal(f.calls.length, 0);
});

test('missing/revoked/expired sessions cannot change credentials', async (t) => {
  for (const options of [{ revoked: true }, { expiredOnLock: true }, {}]) {
    const f = await fixture(t, options);
    assert.equal((await f.request(undefined, Object.keys(options).length ? {} : { Cookie: '' })).status, 401);
    assert.ok(!f.calls.some(({ sql }) => sql?.startsWith('UPDATE native_credentials')));
  }
});

test('wrong old password and external-only accounts roll back without changing sessions', async (t) => {
  for (const missing of [false, true]) {
    const f = await fixture(t, { missing });
    const response = await f.request({ currentPassword: 'incorrect', newPassword });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, missing ? 'LOCAL_PASSWORD_REQUIRED' : 'CURRENT_PASSWORD_INCORRECT');
    assert.ok(f.calls.some(({ type }) => type === 'rollback'));
    assert.ok(!f.calls.some(({ sql }) => sql?.startsWith('UPDATE native_credentials')));
  }
});

test('failed revocation rolls back replacement password and sanitizes errors', async (t) => {
  const f = await fixture(t, { fail: true }); const response = await f.request();
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /mysql|private-secret|internal/);
  assert.equal(f.hash(), oldHash); assert.equal(response.headers.get('set-cookie'), null);
  assert.ok(!f.calls.some(({ type }) => type === 'commit'));
});

test('password attempts are rate limited per authenticated user', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 10; i++) assert.equal((await f.request({ currentPassword: 'incorrect', newPassword })).status, 400);
  const response = await f.request();
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '900');
  assert.ok(!f.calls.some(({ sql }) => sql?.startsWith('UPDATE native_credentials')));
});
