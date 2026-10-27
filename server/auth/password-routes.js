import { hashPassword, validPassword, verifyPassword } from './passwords.js';
import { clearSessionCookie, readCookie, resolveSession } from './sessions.js';
import { createNativeLimiter } from './native-routes.js';

// Native accounts only. No recovery tokens, email changes, or identity supplied by the browser.
export function installPasswordRoutes(app, { getPool, appOrigin, production = process.env.NODE_ENV === 'production' }) {
  const allowAttempt = createNativeLimiter();
  app.post('/api/account/password', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!appOrigin || req.headers.origin !== appOrigin || !req.is('application/json')) return res.status(403).json({ error: 'Permintaan pengaturan tidak valid.' });
    const body = req.body;
    if (!body || Array.isArray(body) || Object.keys(body).some((key) => !['currentPassword', 'newPassword'].includes(key))
        || typeof body.currentPassword !== 'string' || !body.currentPassword || Buffer.byteLength(body.currentPassword) > 256
        || typeof body.newPassword !== 'string' || Buffer.byteLength(body.newPassword) > 256 || !validPassword(body.newPassword)
        || body.currentPassword === body.newPassword) return res.status(400).json({ code: 'PASSWORD_INPUT_INVALID', error: 'Periksa sandi lama dan persyaratan sandi baru. Sandi baru harus berbeda.' });
    let connection;
    try {
      connection = await getPool()?.getConnection();
      if (!connection) throw new Error();
      const principal = await resolveSession(connection, readCookie(req.headers.cookie, 'vo_session'));
      if (!principal) return res.status(401).json({ error: 'Sesi berakhir. Silakan masuk kembali.' });
      if (!allowAttempt(req.socket.remoteAddress, String(principal.userId))) {
        res.setHeader('Retry-After', '900');
        return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
      }
      await connection.beginTransaction();
      const [credentials] = await connection.execute('SELECT password_hash FROM native_credentials WHERE user_id = ? FOR UPDATE', [principal.userId]);
      const [sessions] = await connection.execute(
        `SELECT s.id FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.user_id = ? AND s.revoked_at IS NULL AND u.status = 'active'
           AND s.idle_expires_at > CURRENT_TIMESTAMP AND s.absolute_expires_at > CURRENT_TIMESTAMP FOR UPDATE`,
        [principal.sessionId, principal.userId],
      );
      if (!sessions.length) { await connection.rollback(); return res.status(401).json({ error: 'Sesi berakhir. Silakan masuk kembali.' }); }
      const correctPassword = await verifyPassword(body.currentPassword, credentials[0]?.password_hash);
      if (!correctPassword) {
        await connection.rollback();
        return res.status(400).json({ code: credentials.length ? 'CURRENT_PASSWORD_INCORRECT' : 'LOCAL_PASSWORD_REQUIRED', error: 'Kata sandi lama tidak sesuai atau akun tidak menggunakan kata sandi lokal.' });
      }
      const encoded = await hashPassword(body.newPassword);
      await connection.execute('UPDATE native_credentials SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP WHERE user_id = ?', [encoded, principal.userId]);
      await connection.execute("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = 'password_changed' WHERE user_id = ? AND revoked_at IS NULL", [principal.userId]);
      await connection.commit();
      res.setHeader('Set-Cookie', clearSessionCookie('vo_session', { production }));
      res.json({ next: '/login', message: 'Kata sandi berhasil diubah. Silakan masuk kembali di semua perangkat.' });
    } catch (error) {
      await connection?.rollback().catch(() => {});
      res.status(error?.status === 429 ? 429 : 503).json({ error: 'Kata sandi belum dapat diubah. Coba lagi sebentar.' });
    } finally { connection?.release(); }
  });
}
