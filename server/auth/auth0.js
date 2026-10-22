import { createHash, createHmac, randomBytes, timingSafeEqual, webcrypto } from 'node:crypto';

const encoder = new TextEncoder();
const b64 = (value) => Buffer.from(value).toString('base64url');
const unb64 = (value) => Buffer.from(value, 'base64url').toString('utf8');
const sha256 = (value) => createHash('sha256').update(value).digest('base64url');

export function auth0Config(env = process.env) {
  if (env.AUTH0_ENABLED !== '1') return { enabled: false };
  const issuer = (env.AUTH0_ISSUER || '').replace(/\/$/, '');
  const config = { enabled: true, issuer, clientId: env.AUTH0_CLIENT_ID || '', clientSecret: env.AUTH0_CLIENT_SECRET || '', callbackUrl: env.AUTH0_CALLBACK_URL || '', stateSecret: env.AUTH0_STATE_SECRET || '' };
  const missing = Object.entries(config).filter(([key, value]) => key !== 'enabled' && !value).map(([key]) => key);
  if (!issuer.startsWith('https://') || missing.length) throw Object.assign(new Error(`Auth0 configuration missing or invalid: ${missing.join(', ') || 'issuer'}.`), { code: 'AUTH0_CONFIGURATION_INVALID' });
  return config;
}

export function createLoginTransaction(config, now = Date.now()) {
  const verifier = randomBytes(32).toString('base64url');
  const nonce = randomBytes(24).toString('base64url');
  const payload = b64(JSON.stringify({ verifier, nonce, issuedAt: now }));
  const signature = createHmac('sha256', config.stateSecret).update(payload).digest('base64url');
  const state = `${payload}.${signature}`;
  const url = new URL(`${config.issuer}/authorize`);
  url.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId, redirect_uri: config.callbackUrl, scope: 'openid profile email', state, nonce, code_challenge: sha256(verifier), code_challenge_method: 'S256' });
  return { state, nonce, verifier, authorizationUrl: url.toString() };
}

export function verifyState(config, state, { maxAgeMs = 10 * 60 * 1000, now = Date.now() } = {}) {
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(state)) return null;
  const [payload, signature] = state.split('.');
  const expected = createHmac('sha256', config.stateSecret).update(payload).digest('base64url');
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try { const value = JSON.parse(unb64(payload)); return typeof value.nonce === 'string' && typeof value.verifier === 'string' && now - value.issuedAt >= 0 && now - value.issuedAt <= maxAgeMs ? value : null; } catch { return null; }
}

export async function exchangeCode(config, code, fetchImpl = fetch) {
  const transaction = verifyState(config, code.state);
  if (!transaction || typeof code.authorizationCode !== 'string') throw Object.assign(new Error('OIDC state invalid.'), { code: 'OIDC_STATE_INVALID' });
  const response = await fetchImpl(`${config.issuer}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId, client_secret: config.clientSecret, code: code.authorizationCode, redirect_uri: config.callbackUrl, code_verifier: transaction.verifier }) });
  if (!response.ok) throw Object.assign(new Error('OIDC token exchange failed.'), { code: 'OIDC_TOKEN_EXCHANGE_FAILED' });
  return { ...(await response.json()), nonce: transaction.nonce };
}

export async function validateIdToken(config, token, nonce, fetchImpl = fetch) {
  const [head, body, signature] = String(token).split('.');
  if (!head || !body || !signature) throw Object.assign(new Error('Invalid ID token.'), { code: 'OIDC_TOKEN_INVALID' });
  const header = JSON.parse(unb64(head)); const claims = JSON.parse(unb64(body));
  if (!validateIdTokenClaims(config, header, claims, nonce)) throw Object.assign(new Error('ID token claims rejected.'), { code: 'OIDC_TOKEN_CLAIMS_INVALID' });
  const response = await fetchImpl(`${config.issuer}/.well-known/jwks.json`); if (!response.ok) throw Object.assign(new Error('JWKS unavailable.'), { code: 'OIDC_JWKS_UNAVAILABLE' });
  const jwk = (await response.json()).keys?.find((key) => key.kid === header.kid && key.kty === 'RSA'); if (!jwk) throw Object.assign(new Error('Signing key unavailable.'), { code: 'OIDC_JWK_NOT_FOUND' });
  const key = await webcrypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await webcrypto.subtle.verify('RSASSA-PKCS1-v1_5', key, Buffer.from(signature, 'base64url'), encoder.encode(`${head}.${body}`));
  if (!valid) throw Object.assign(new Error('ID token signature rejected.'), { code: 'OIDC_TOKEN_SIGNATURE_INVALID' });
  return { issuer: claims.iss, subject: claims.sub, email: typeof claims.email === 'string' ? claims.email.slice(0, 320) : '', displayName: typeof claims.name === 'string' ? claims.name.slice(0, 150) : null };
}

export function validateIdTokenClaims(config, header, claims, nonce, now = Date.now()) {
  const audienceMatches = Array.isArray(claims?.aud) ? claims.aud.includes(config.clientId) : claims?.aud === config.clientId;
  return header?.alg === 'RS256' && Boolean(header.kid) && claims?.iss === config.issuer && audienceMatches && claims?.nonce === nonce && Boolean(claims?.sub) && Number(claims?.exp) * 1000 > now;
}

export async function findOrProvisionUser(connection, identity) {
  const [existing] = await connection.execute('SELECT id FROM users WHERE provider_issuer = ? AND external_subject = ? LIMIT 1', [identity.issuer, identity.subject]);
  if (existing[0]) return existing[0].id;
  const [result] = await connection.execute('INSERT INTO users (provider_issuer, external_subject, email, display_name, last_login_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)', [identity.issuer, identity.subject, identity.email || `${identity.subject}@invalid.local`, identity.displayName]);
  return result.insertId;
}
