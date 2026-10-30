import { createHash, randomUUID } from 'node:crypto';
import { hashPassword, normalizeEmail, validPassword, verifyPassword } from './passwords.js';
import { issueSession, readCookie, resolveSession, revokeSession, sessionCookie } from './sessions.js';
import { normalizeWhatsapp } from '../../shared/auth-validation.js';
import {MANAGED_DEMO_ISSUER} from '../managed-demo-policy.js';

export function nativeOrigin(env) {
  const value = env.APP_ORIGIN || (env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
  let origin;
  try { origin = new URL(value); } catch { throw new Error('APP_ORIGIN must be an explicit application origin.'); }
  if (origin.origin !== value || origin.username || origin.password || !['http:', 'https:'].includes(origin.protocol)
      || (env.NODE_ENV === 'production' && origin.protocol !== 'https:')) throw new Error('APP_ORIGIN must be an origin; production requires HTTPS.');
  return origin.origin;
}

export function createNativeLimiter({ now = Date.now } = {}) {
  const buckets = new Map();
  return (ip, email) => {
    const time = now();
    for (const [key, value] of buckets) if (value.until <= time) buckets.delete(key);
    const keys = [[`ip:${ip}`, 30], [`email:${createHash('sha256').update(email || '').digest('hex')}`, 10]];
    if (buckets.size > 10000) return false;
    for (const [key, maximum] of keys) if ((buckets.get(key)?.count || 0) >= maximum) return false;
    for (const [key] of keys) {
      const entry = buckets.get(key) || { count: 0, until: time + 15 * 60 * 1000 };
      entry.count++; buckets.set(key, entry);
    }
    return true;
  };
}

export function installNativeRoutes(app, { getPool, env }) {
  const origin = nativeOrigin(env);
  const secure = env.NODE_ENV === 'production';
  const allowAttempt = createNativeLimiter();
  // Same-origin JSON is required for all auth mutations, including logout/workspace selection.
  app.use('/auth', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'POST' && (req.headers.origin !== origin || !req.is('application/json'))) return res.status(403).json({ error: 'Permintaan autentikasi tidak valid.' });
    next();
  });
  app.get('/auth/login', (_req, res) => res.redirect('/login'));
  for (const action of ['login', 'register']) app.post(`/auth/${action}`, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!allowAttempt(req.ip || req.socket.remoteAddress, email)) { res.setHeader('Retry-After', '900'); return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' }); }
    const password = req.body?.password;
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    const whatsappNumber = normalizeWhatsapp(req.body?.whatsappNumber);
    if (action === 'register' && !whatsappNumber) return res.status(400).json({ error: 'Nomor WhatsApp wajib diisi dengan format yang valid.' });
    if (!email || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 256 || (action === 'register' && (!validPassword(password) || !displayName || displayName.length > 150))) return res.status(400).json({ error: 'Periksa format email dan persyaratan kata sandi.' });
    let connection;
    try {
      connection = await getPool()?.getConnection();
      if (!connection) throw new Error('Database unavailable.');
      let userId,activeWorkspaceId=null;
      if (action === 'register') {
        const encoded = await hashPassword(password);
        await connection.beginTransaction();
        const [result] = await connection.execute('INSERT INTO users (provider_issuer, external_subject, email, display_name, whatsapp_number, last_login_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)', ['urn:virtual-office:native', randomUUID(), email, displayName, whatsappNumber]);
        userId = result.insertId;
        await connection.execute('INSERT INTO native_credentials (user_id, email_normalized, password_hash) VALUES (?, ?, ?)', [userId, email, encoded]);
      } else {
        const [rows] = await connection.execute('SELECT c.user_id, c.password_hash, u.status, u.provider_issuer FROM native_credentials c JOIN users u ON u.id = c.user_id WHERE c.email_normalized = ? LIMIT 1', [email]);
        const matched = await verifyPassword(password, rows[0]?.password_hash);
        if (!matched || rows[0]?.status !== 'active') return res.status(401).json({ error: 'Email atau kata sandi salah.' });
        userId = rows[0].user_id;
        await connection.beginTransaction();
        const [active] = await connection.execute("SELECT id FROM users WHERE id = ? AND status = 'active' FOR UPDATE", [userId]);
        if (!active.length) { await connection.rollback(); return res.status(401).json({ error: 'Email atau kata sandi salah.' }); }
        await connection.execute('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
        if(rows[0].provider_issuer===MANAGED_DEMO_ISSUER) {
          const [[account]]=await connection.execute('SELECT workspace_id FROM managed_demo_accounts WHERE user_id=?',[userId]);
          if(!account)throw Error('Managed demo unavailable');activeWorkspaceId=account.workspace_id;
        }
      }
      const previous = await resolveSession(connection, readCookie(req.headers.cookie, 'vo_session'));
      if (previous) await revokeSession(connection, previous.sessionId, 'reauthenticated');
      const session = await issueSession(connection, { userId,activeWorkspaceId });
      await connection.commit();
      res.setHeader('Set-Cookie', sessionCookie('vo_session', session.token, { production: secure }));
      res.status(action === 'register' ? 201 : 200).json({ next: '/login/complete' });
    } catch (error) {
      await connection?.rollback().catch(() => {});
      const status = error?.code === 'ER_DUP_ENTRY' ? 400 : error?.status === 429 ? 429 : 503;
      res.status(status).json({ error: status === 400 ? 'Akun tidak dapat dibuat dengan data ini. Coba masuk atau gunakan email lain.' : status === 429 ? 'Layanan sedang sibuk. Coba lagi sebentar.' : 'Layanan autentikasi belum tersedia. Coba lagi sebentar.' });
    } finally { connection?.release(); }
  });
}
