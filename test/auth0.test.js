import assert from 'node:assert/strict';
import test from 'node:test';
import { auth0Config, createLoginTransaction, findOrProvisionUser, validateIdTokenClaims, verifyState } from '../server/auth/auth0.js';
import { installAuthRoutes } from '../server/auth/auth-routes.js';

test('disabled Auth0 gives explicit diagnostics without creating sessions or contacting a DB', () => {
  const routes = new Map();
  const enabled = installAuthRoutes({ get: (path, handler) => routes.set(path, handler) }, { env: { AUTH_PROVIDER: 'auth0' }, getPool: () => { throw new Error('must not contact DB'); } });
  assert.equal(enabled, false);
  for (const path of ['/auth/me', '/auth/login']) {
    let status, body;
    const res = { status(value) { status = value; return this; }, json(value) { body = value; return this; } };
    routes.get(path)({}, res);
    assert.equal(status, 503); assert.equal(body.code, 'AUTHENTICATION_DISABLED');
  }
  assert.equal(routes.has('/auth/callback'), false);
});

const env = { AUTH0_ENABLED: '1', AUTH0_ISSUER: 'https://example.us.auth0.com', AUTH0_CLIENT_ID: 'client', AUTH0_CLIENT_SECRET: 'secret', AUTH0_CALLBACK_URL: 'http://localhost:3001/auth/callback', AUTH0_STATE_SECRET: 'state-secret' };
test('Auth0 config rejects missing required values', () => {
  assert.throws(() => auth0Config({ AUTH0_ENABLED: '1' }), { code: 'AUTH0_CONFIGURATION_INVALID' });
  assert.equal(auth0Config({ AUTH0_ENABLED: '0' }).enabled, false);
});
test('PKCE state includes signed nonce and rejects tampering or expiry', () => {
  const config = auth0Config(env); const tx = createLoginTransaction(config, 1000);
  assert.match(tx.authorizationUrl, /code_challenge_method=S256/);
  assert.equal(verifyState(config, tx.state, { now: 1001 }).nonce, tx.nonce);
  assert.equal(verifyState(config, `${tx.state}x`, { now: 1001 }), null);
  assert.equal(verifyState(config, tx.state, { now: 700000 }), null);
});
test('signup hint changes only Auth0 presentation and retains signed PKCE transaction', () => {
  const config = auth0Config(env);
  const normal = createLoginTransaction(config, 1000);
  const signup = createLoginTransaction(config, 1000, { signup: true });
  assert.equal(new URL(normal.authorizationUrl).searchParams.has('screen_hint'), false);
  const url = new URL(signup.authorizationUrl);
  assert.equal(url.origin, config.issuer);
  assert.equal(url.searchParams.get('screen_hint'), 'signup');
  assert.equal(url.searchParams.get('redirect_uri'), config.callbackUrl);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(verifyState(config, signup.state, { now: 1001 }).nonce, signup.nonce);
});
test('public auth readiness exposes only enabled flag and login ignores supplied redirect', () => {
  for (const configured of [false, true]) {
    const routes = new Map();
    installAuthRoutes({ get: (path, handler) => routes.set(path, handler), post() {} }, { env: configured ? { ...env, AUTH_PROVIDER: 'auth0' } : { AUTH_PROVIDER: 'auth0' }, getPool() { throw new Error('No database access allowed'); } });
    let body, location;
    const headers = {};
    const res = { setHeader(key, value) { headers[key] = value; }, json(value) { body = value; }, redirect(status, url) { assert.equal(status, 302); location = url; } };
    routes.get('/auth/status')({}, res);
    assert.deepEqual(body, { enabled: configured });
    assert.equal(headers['Cache-Control'], 'no-store');
    if (configured) {
      routes.get('/auth/login')({ query: { screen_hint: 'signup', returnTo: 'https://attacker.test', role: 'owner' } }, res);
      const url = new URL(location);
      assert.equal(url.searchParams.get('screen_hint'), 'signup');
      assert.equal(url.searchParams.get('redirect_uri'), env.AUTH0_CALLBACK_URL);
      assert.equal(url.searchParams.has('role'), false);
      assert.equal(url.searchParams.has('returnTo'), false);
      assert.match(headers['Set-Cookie'], /HttpOnly/);
    }
  }
});
test('identity mapping finds existing user or creates stable issuer-subject mapping', async () => {
  const identity = { issuer: 'https://example.us.auth0.com', subject: 'auth0|123', email: 'person@example.test', displayName: 'Person' };
  const existing = await findOrProvisionUser({ execute: async () => [[{ id: 4 }]] }, identity); assert.equal(existing, 4);
  const calls = []; const created = await findOrProvisionUser({ execute: async (sql, values) => { calls.push({ sql, values }); return sql.startsWith('SELECT') ? [[]] : [{ insertId: 5 }]; } }, identity);
  assert.equal(created, 5); assert.deepEqual(calls[1].values.slice(0, 2), [identity.issuer, identity.subject]);
});
test('token claims reject wrong issuer, audience, nonce, and expiry', () => {
  const config = auth0Config(env); const header = { alg: 'RS256', kid: 'key' }; const claims = { iss: config.issuer, aud: config.clientId, nonce: 'nonce', sub: 'subject', exp: 9999999999 };
  assert.equal(validateIdTokenClaims(config, header, claims, 'nonce', 0), true);
  assert.equal(validateIdTokenClaims(config, header, { ...claims, iss: 'https://other' }, 'nonce', 0), false);
  assert.equal(validateIdTokenClaims(config, header, { ...claims, aud: 'other' }, 'nonce', 0), false);
  assert.equal(validateIdTokenClaims(config, header, { ...claims, nonce: 'other' }, 'nonce', 0), false);
  assert.equal(validateIdTokenClaims(config, header, { ...claims, exp: 0 }, 'nonce', 1), false);
});
