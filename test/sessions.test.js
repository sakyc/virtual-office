import assert from 'node:assert/strict';
import test from 'node:test';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, clearSessionCookie, hashSessionToken, issueSession, readCookie, resolveSession, revokeSession, sessionCookie } from '../server/auth/sessions.js';

test('session issue stores hash and approved lifetimes', async () => {
  const calls = []; const now = new Date('2026-01-01T00:00:00Z');
  const result = await issueSession({ execute: async (sql, values) => { calls.push({ sql, values }); return [{ insertId: 7 }]; } }, { userId: 3, token: 'a'.repeat(43), now });
  assert.equal(result.id, 7); assert.deepEqual(calls[0].values[1], hashSessionToken('a'.repeat(43)));
  assert.equal(result.absoluteExpiresAt - now, SESSION_ABSOLUTE_MS); assert.equal(result.idleExpiresAt - now, SESSION_IDLE_MS);
});
test('expired, revoked, and suspended sessions deny principal', async () => {
  const base = { id: 1, user_id: 2, active_workspace_id: 3, idle_expires_at: new Date(Date.now() + 1000), absolute_expires_at: new Date(Date.now() + 1000), revoked_at: null, user_status: 'active' };
  for (const changed of [{ revoked_at: new Date() }, { user_status: 'suspended' }, { idle_expires_at: new Date(0) }]) {
    const value = await resolveSession({ execute: async () => [[{ ...base, ...changed }]] }, 'a'.repeat(43)); assert.equal(value, null);
  }
});
test('valid session resolves server principal and refreshes idle only', async () => {
  const calls = []; const now = new Date('2026-01-01T00:00:00Z');
  const row = { id: 1, user_id: 2, active_workspace_id: 3, idle_expires_at: new Date(now.getTime() + 1000), absolute_expires_at: new Date(now.getTime() + 2000), revoked_at: null, user_status: 'active' };
  const result = await resolveSession({ execute: async (sql) => { calls.push(sql); return sql.startsWith('SELECT') ? [[row]] : [{}]; } }, 'a'.repeat(43), { now });
  assert.equal(result.userId, 2); assert.equal(result.idleExpiresAt.getTime(), row.absolute_expires_at.getTime()); assert.ok(calls.some((sql) => sql.startsWith('UPDATE sessions')));
});
test('logout revokes only active session and cookies are HttpOnly', async () => {
  assert.equal(await revokeSession({ execute: async () => [{ affectedRows: 1 }] }, 1), true);
  assert.match(sessionCookie('vo_session', 'token'), /HttpOnly/); assert.match(sessionCookie('vo_session', 'token', { production: true }), /Secure/);
  assert.match(clearSessionCookie('vo_session'), /Max-Age=0/); assert.equal(readCookie('a=1; vo_session=value', 'vo_session'), 'value');
});
