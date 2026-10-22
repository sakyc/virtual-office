import { readCookie, resolveSession } from './sessions.js';

// Deliberately not mounted yet: route integration requires approved OIDC and owned resources.
export function createSessionMiddleware({ connectionProvider, cookieName = 'vo_session' }) {
  return async (req, res, next) => {
    const token = readCookie(req.headers.cookie, cookieName);
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    let connection;
    try {
      connection = await connectionProvider();
      const principal = await resolveSession(connection, token);
      if (!principal) return res.status(401).json({ error: 'Session invalid or expired.' });
      req.authPrincipal = principal;
      next();
    } catch {
      res.status(503).json({ error: 'Authentication service unavailable.' });
    } finally {
      connection?.release?.();
      await connection?.end?.();
    }
  };
}
