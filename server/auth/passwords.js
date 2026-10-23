import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { validPassword } from '../../shared/auth-validation.js';
export { normalizeEmail, validPassword } from '../../shared/auth-validation.js';

const scrypt = promisify(derive);
const parameters = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
let running = 0;
async function digest(password, salt) {
  if (running >= 4) throw Object.assign(new Error('Authentication busy.'), { status: 429 });
  running++;
  try { return await scrypt(password, salt, 32, parameters); }
  finally { running--; }
}

export async function hashPassword(password) {
  if (!validPassword(password)) throw Object.assign(new Error('Kata sandi belum memenuhi persyaratan.'), { status: 400 });
  const salt = randomBytes(16).toString('hex');
  return `scrypt$32768$8$1$${salt}$${(await digest(password, salt)).toString('hex')}`;
}

// A missing account performs the same expensive derivation as an existing account.
const dummy = `scrypt$32768$8$1$${'0'.repeat(32)}$${'0'.repeat(64)}`;
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 256) return false;
  const target = typeof encoded === 'string' && /^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(encoded) ? encoded : dummy;
  const parts = target.split('$');
  const actual = await digest(password, parts[4]);
  return timingSafeEqual(actual, Buffer.from(parts[5], 'hex')) && target !== dummy;
}
