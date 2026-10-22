import { createHash, randomBytes } from 'node:crypto';

export const SESSION_ABSOLUTE_MS = 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest();
}

export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function sessionCookie(name, token, { production = process.env.NODE_ENV === 'production' } = {}) {
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax${production ? '; Secure' : ''}`;
}

export function clearSessionCookie(name, { production = process.env.NODE_ENV === 'production' } = {}) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${production ? '; Secure' : ''}`;
}

export async function issueSession(connection, { userId, activeWorkspaceId = null, now = new Date(), token = newSessionToken() }) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw Object.assign(new Error('User session tidak valid.'), { code: 'SESSION_USER_INVALID' });
  const absoluteExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MS);
  const idleExpiresAt = new Date(now.getTime() + SESSION_IDLE_MS);
  const [result] = await connection.execute(
    'INSERT INTO sessions (user_id, token_hash, active_workspace_id, last_seen_at, idle_expires_at, absolute_expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, hashSessionToken(token), activeWorkspaceId, now, idleExpiresAt, absoluteExpiresAt],
  );
  return { id: result.insertId, token, absoluteExpiresAt, idleExpiresAt };
}

export async function resolveSession(connection, token, { now = new Date() } = {}) {
  if (typeof token !== 'string' || token.length < 32) return null;
  const [rows] = await connection.execute(
    `SELECT s.id, s.user_id, s.active_workspace_id, s.idle_expires_at, s.absolute_expires_at, s.revoked_at, u.status AS user_status
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? LIMIT 1`,
    [hashSessionToken(token)],
  );
  const session = rows[0];
  if (!session || session.revoked_at || session.user_status !== 'active') return null;
  if (new Date(session.idle_expires_at) <= now || new Date(session.absolute_expires_at) <= now) return null;
  const idleExpiresAt = new Date(Math.min(now.getTime() + SESSION_IDLE_MS, new Date(session.absolute_expires_at).getTime()));
  await connection.execute('UPDATE sessions SET last_seen_at = ?, idle_expires_at = ? WHERE id = ? AND revoked_at IS NULL', [now, idleExpiresAt, session.id]);
  return { userId: session.user_id, sessionId: session.id, activeWorkspaceId: session.active_workspace_id, absoluteExpiresAt: session.absolute_expires_at, idleExpiresAt };
}

export async function revokeSession(connection, sessionId, reason = 'logout') {
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) return false;
  const [result] = await connection.execute('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL', [String(reason).slice(0, 100), sessionId]);
  return result.affectedRows === 1;
}

export function readCookie(header, name) {
  if (typeof header !== 'string') return null;
  const prefix = `${name}=`;
  const value = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}
