import { auth0Config, createLoginTransaction, exchangeCode, findOrProvisionUser, validateIdToken } from './auth0.js';
import { clearSessionCookie, issueSession, readCookie, resolveSession, revokeSession, sessionCookie } from './sessions.js';
import { loadSessionProfile, selectActiveWorkspace } from './profile.js';
import { authenticationMode } from './config.js';
import { installNativeRoutes } from './native-routes.js';

export function installAuthRoutes(app, { getPool, env = process.env }) {
  const mode = authenticationMode(env);
  const config = mode === 'auth0' ? auth0Config(env) : { enabled: true };
  app.get('/auth/status', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ enabled: config.enabled }); });
  if (!config.enabled) {
    // Explicit JSON prevents the SPA fallback from masquerading as a successful session response.
    const unavailable = (_req, res) => res.status(503).json({ error: 'Auth0 login is not configured on this server.', code: 'AUTHENTICATION_DISABLED' });
    app.get('/auth/me', unavailable);
    app.get('/auth/login', unavailable);
    return false;
  }
  const secure = env.NODE_ENV === 'production';
  if (mode === 'native') installNativeRoutes(app, { getPool, env });
  if (mode === 'auth0') {
    app.get('/auth/login', (req, res) => { const tx = createLoginTransaction(config, Date.now(), { signup: req.query?.screen_hint === 'signup' }); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Set-Cookie', sessionCookie('vo_oidc_state', tx.state, { production: secure })); res.redirect(302, tx.authorizationUrl); });
    app.get('/auth/callback', async (req, res) => { let connection; try { const state = req.query?.state; const cookie = req.headers.cookie?.split(';').map((v) => v.trim()).find((v) => v.startsWith('vo_oidc_state='))?.slice(14); if (!state || state !== cookie) return res.status(400).json({ error: 'OIDC state rejected.' }); const tokens = await exchangeCode(config, { authorizationCode: req.query?.code, state }); const identity = await validateIdToken(config, tokens.id_token, tokens.nonce); connection = await getPool()?.getConnection(); if (!connection) throw Object.assign(new Error('Database unavailable.'), { code: 'DATABASE_UNAVAILABLE' }); const userId = await findOrProvisionUser(connection, identity); const session = await issueSession(connection, { userId }); res.setHeader('Set-Cookie', [sessionCookie('vo_session', session.token, { production: secure }), clearSessionCookie('vo_oidc_state', { production: secure })]); res.redirect('/login/complete'); } catch (error) { res.status(401).json({ error: 'OIDC login failed.', code: error?.code || 'OIDC_ERROR' }); } finally { connection?.release(); } });
  }
  app.get('/auth/me', async (req, res) => { let connection; try { connection = await getPool()?.getConnection(); if (!connection) return res.status(503).json({ error: 'Authentication service unavailable.' }); const principal = await resolveSession(connection, readCookie(req.headers.cookie, 'vo_session')); if (!principal) return res.status(401).json({ error: 'Session invalid or expired.' }); const profile = await loadSessionProfile(connection, principal); if (!profile) return res.status(401).json({ error: 'Session invalid or expired.' }); res.json(profile); } catch { res.status(503).json({ error: 'Authentication service unavailable.' }); } finally { connection?.release(); } });
  app.post('/auth/active-workspace', async (req, res) => { let connection; try { const workspaceId = Number(req.body?.workspaceId); if (!Number.isSafeInteger(workspaceId) || workspaceId <= 0) return res.status(400).json({ error: 'Valid workspace is required.' }); connection = await getPool()?.getConnection(); if (!connection) return res.status(503).json({ error: 'Authentication service unavailable.' }); const principal = await resolveSession(connection, readCookie(req.headers.cookie, 'vo_session')); if (!principal) return res.status(401).json({ error: 'Session invalid or expired.' }); await connection.beginTransaction(); const selected = await selectActiveWorkspace(connection, principal, workspaceId); if (!selected) { await connection.rollback(); return res.status(403).json({ error: 'Workspace membership required.' }); } const profile = await loadSessionProfile(connection, { ...principal, activeWorkspaceId: workspaceId }); await connection.commit(); res.json(profile); } catch { await connection?.rollback().catch(() => {}); res.status(503).json({ error: 'Authentication service unavailable.' }); } finally { connection?.release(); } });
  app.post('/auth/logout', async (req, res) => {
    let connection;
    try {
      connection = await getPool()?.getConnection();
      if (!connection) throw new Error('Session service unavailable.');
      const principal = await resolveSession(connection, readCookie(req.headers.cookie, 'vo_session'));
      if (principal) await revokeSession(connection, principal.sessionId);
      res.status(204);
    } catch { res.status(503); }
    finally {
      connection?.release();
      res.setHeader('Set-Cookie', clearSessionCookie('vo_session', { production: secure }));
      if (res.statusCode === 204) res.end();
      else res.json({ error: 'Tidak dapat mencabut sesi di server. Coba lagi sebentar.' });
    }
  });
  return true;
}
