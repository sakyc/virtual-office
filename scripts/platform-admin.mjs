import 'dotenv/config';
import { connectApprovedNonProduction } from '../server/migrations/database.js';

// Explicit operator action, not a registration/HTTP privilege-escalation path.
const [action, userText, reference, ...extra] = process.argv.slice(2);
const userId = Number(userText);
if (!['grant','revoke'].includes(action) || !Number.isSafeInteger(userId) || userId < 1 || !/^[A-Za-z0-9][A-Za-z0-9:._/-]{4,190}$/.test(reference || '') || extra.length ||
  process.env.NODE_ENV === 'production' || !['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST || '127.0.0.1')) {
  console.error('Usage (approved local database only): node scripts/platform-admin.mjs grant|revoke USER_ID APPROVAL_REFERENCE'); process.exitCode = 2;
} else {
  let c;
  try {
    c = await connectApprovedNonProduction();
    const [[target]] = await c.execute('SELECT DATABASE() AS db, @@datadir AS datadir');
    if (target.db !== 'virtual_office' || !/^C:\/laragon\/data\/mysql-8\//i.test(target.datadir.replaceAll('\\','/'))) throw Error('LOCAL_TARGET_REQUIRED');
    await c.beginTransaction();
    const [[user]] = await c.execute(`SELECT id FROM users WHERE id = ?${action === 'grant' ? " AND status = 'active'" : ''} FOR UPDATE`, [userId]);
    if (!user) throw Error('ACTIVE_USER_REQUIRED');
    if (action === 'grant') await c.execute('INSERT INTO platform_admins (user_id, approval_reference) VALUES (?, ?) ON DUPLICATE KEY UPDATE approval_reference = VALUES(approval_reference), granted_at = CURRENT_TIMESTAMP, revoked_at = NULL', [userId, reference]);
    else await c.execute('UPDATE platform_admins SET revoked_at = CURRENT_TIMESTAMP, approval_reference = ? WHERE user_id = ?', [reference, userId]);
    await c.commit(); console.log(JSON.stringify({ action, userId, completed: true }));
  } catch (error) {
    await c?.rollback().catch(() => {}); console.error(JSON.stringify({ completed: false, code: error.code || 'ADMIN_CHANGE_FAILED' })); process.exitCode = 1;
  } finally { await c?.end(); }
}
