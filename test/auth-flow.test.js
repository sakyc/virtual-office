import assert from 'node:assert/strict';
import test from 'node:test';
import { destinationForProfile, loadAuthProfile } from '../src/react/auth-flow.js';

test('post-login destination uses server profile with no user-controlled redirects', () => {
  assert.equal(destinationForProfile({ user: { id: 1 }, workspaces: [] }), '/onboarding');
  assert.equal(destinationForProfile({ user: { id: 1 }, workspaces: [{ id: 3 }] }), null);
  assert.equal(destinationForProfile({ user: { id: 1 }, workspaces: [{ id: 3 }], activeWorkspace: { id: 3 } }), '/app');
  assert.throws(() => destinationForProfile({ workspaces: [] }), /Profil sesi/);
  assert.throws(() => destinationForProfile({ user: { id: 1 } }), /Profil sesi/);
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
