import assert from 'node:assert/strict';
import test from 'node:test';
import { destinationForProfile, loadAuthProfile, logoutSession, redirectForProtectedPath } from '../src/react/auth-flow.js';

test('post-login destination uses server profile with no user-controlled redirects', () => {
  assert.equal(destinationForProfile({ user: { id: 1 }, workspaces: [] }), '/onboarding');
  assert.equal(destinationForProfile({ user: { id: 1 }, workspaces: [{ id: 3 }] }), null);
  assert.equal(destinationForProfile({ user: { id: 1 }, workspaces: [{ id: 3 }], activeWorkspace: { id: 3 } }), '/app');
  assert.throws(() => destinationForProfile({ workspaces: [] }), /Profil sesi/);
  assert.throws(() => destinationForProfile({ user: { id: 1 } }), /Profil sesi/);
});

test('protected pages require a session and onboarding only runs before first workspace', () => {
  const fresh = { user: { id: 1 }, workspaces: [] };
  const choosing = { ...fresh, workspaces: [{ id: 3 }] };
  const ready = { ...choosing, activeWorkspace: { id: 3 } };
  for (const path of ['/app', '/app/office', '/app/board', '/onboarding']) assert.equal(redirectForProtectedPath(null, path), '/login');
  assert.equal(redirectForProtectedPath(fresh, '/app'), '/onboarding');
  assert.equal(redirectForProtectedPath(fresh, '/onboarding'), null);
  assert.equal(redirectForProtectedPath(choosing, '/onboarding'), '/login/complete');
  assert.equal(redirectForProtectedPath(choosing, '/app'), '/login/complete');
  assert.equal(redirectForProtectedPath(ready, '/onboarding'), '/app');
  assert.equal(redirectForProtectedPath(ready, '/app'), null);
  assert.equal(redirectForProtectedPath(ready, '/app/office'), null);
});

test('logout uses existing same-origin POST endpoint and sanitizes service failures', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/auth/logout');
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.equal(options.body, '{}');
    return { ok: true, status: 204 };
  };
  await logoutSession();
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(logoutSession(), { message: 'Logout belum berhasil. Coba lagi sebentar.' });
  globalThis.fetch = async () => { throw new Error('mysql://private-secret@internal'); };
  await assert.rejects(logoutSession(), { message: 'Logout belum berhasil. Coba lagi sebentar.' });
});

test('profile fetch requires a valid session and never treats disabled service as a new account', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const status of [401, 503, 200]) {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/auth/me');
      assert.equal(options.credentials, 'same-origin');
      return { status, ok: status === 200, json: async () => ({ error: 'private provider error' }) };
    };
    if (status === 401) assert.equal(await loadAuthProfile(), null);
    else await assert.rejects(loadAuthProfile(), status === 503 ? /Layanan masuk/ : /Profil sesi/);
  }
});
