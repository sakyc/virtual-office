import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'kantor_ai',
} = process.env;

export let pool = null;
export const dbState = { ready: false, error: null };

// MariaDB menyimpan JSON sebagai teks, MySQL mengembalikan objek. Normalkan keduanya.
export const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

export async function initDb() {
  try {
    // Buat database kalau belum ada (abaikan error bila user tidak punya hak CREATE).
    try {
      const admin = await mysql.createConnection({ host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASSWORD });
      await admin.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await admin.end();
    } catch (e) {
      console.warn('[db] lewati CREATE DATABASE:', e.code || e.message);
    }

    pool = mysql.createPool({
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4',
      timezone: 'Z', // DATETIME di database = UTC; jangan ditafsirkan sebagai waktu lokal server
    });
    // Semua waktu disimpan UTC; browser yang mengubah ke zona lokal.
    pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

    const sql = readFileSync(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8');
    const statements = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) await pool.query(stmt);

    // Sisa pekerjaan yang terputus karena server mati.
    await pool.query("UPDATE jobs SET status='failed', error='Server restart saat diproses.', finished_at=NOW() WHERE status='generating'");
    await pool.query("UPDATE items SET status='draft', last_error='Revisi terhenti karena server restart.' WHERE status='revising'");

    dbState.ready = true;
    dbState.error = null;
    console.log(`Database: terhubung ke ${DB_NAME}@${DB_HOST}`);
  } catch (e) {
    dbState.ready = false;
    dbState.error = e.message;
    console.error('[db] gagal terhubung:', e.message);
    console.error('[db] chat tetap jalan, tapi fitur Perintah dan Board nonaktif. Cek DB_* di .env lalu restart.');
  }
}
