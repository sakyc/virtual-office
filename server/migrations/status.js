import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export const HISTORY_TABLE = 'schema_migrations';
const ID_PATTERN = /^\d{3,}_[a-z0-9][a-z0-9_-]*$/;
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/;

const diagnostic = (level, code, message, detail = {}) => ({ level, code, message, ...detail });

function isSafeFileName(file) {
  return typeof file === 'string'
    && file.endsWith('.sql')
    && !file.includes('/')
    && !file.includes('\\')
    && path.basename(file) === file;
}

export async function inspectMigrationDirectory(dir) {
  const diagnostics = [];
  const manifestPath = path.join(dir, 'manifest.json');
  let manifest;

  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    diagnostics.push(diagnostic('error', 'manifest_unreadable', 'Migration manifest tidak dapat dibaca.', { file: manifestPath }));
    return { diagnostics, migrations: [] };
  }

  if (manifest?.format !== 1 || !Array.isArray(manifest?.migrations)) {
    diagnostics.push(diagnostic('error', 'manifest_invalid', 'Manifest harus memakai format 1 dan array migrations.', { file: manifestPath }));
    return { diagnostics, migrations: [] };
  }

  const migrations = [];
  const ids = new Set();
  const files = new Set();
  let previousId = null;

  for (const entry of manifest.migrations) {
    const id = entry?.id;
    const file = entry?.file;
    if (!ID_PATTERN.test(id || '')) {
      diagnostics.push(diagnostic('error', 'migration_id_invalid', 'Migration ID harus berupa nomor berurut dan nama kebab/snake sederhana.', { id }));
      continue;
    }
    if (!isSafeFileName(file)) {
      diagnostics.push(diagnostic('error', 'migration_file_invalid', 'Migration file harus berupa nama file .sql di direktori migrations.', { id, file }));
      continue;
    }
    if (ids.has(id)) diagnostics.push(diagnostic('error', 'migration_id_duplicate', 'Migration ID duplikat.', { id }));
    if (files.has(file)) diagnostics.push(diagnostic('error', 'migration_file_duplicate', 'Migration file direferensikan lebih dari sekali.', { id, file }));
    if (previousId && id <= previousId) {
      diagnostics.push(diagnostic('error', 'migration_order_invalid', 'Migration IDs harus strictly ascending sesuai urutan manifest.', { id, previousId }));
    }
    ids.add(id);
    files.add(file);
    previousId = id;

    const filePath = path.join(dir, file);
    try {
      const source = await readFile(filePath);
      migrations.push({ id, file, checksum: createHash('sha256').update(source).digest('hex'), source: source.toString('utf8') });
    } catch {
      diagnostics.push(diagnostic('error', 'migration_file_missing', 'Migration file yang direferensikan manifest tidak ditemukan.', { id, file }));
    }
  }

  try {
    const diskFiles = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
      .map((entry) => entry.name);
    for (const file of diskFiles) {
      if (!files.has(file)) diagnostics.push(diagnostic('error', 'migration_file_unlisted', 'Migration SQL file tidak tercantum dalam manifest.', { file }));
    }
  } catch {
    diagnostics.push(diagnostic('error', 'migration_directory_unreadable', 'Direktori migrations tidak dapat dibaca.', { dir }));
  }

  return { diagnostics, migrations };
}

export function compareMigrationHistory(migrations, history) {
  const diagnostics = [];
  const sourceById = new Map(migrations.map((migration) => [migration.id, migration]));
  const historyIds = new Set();

  for (const row of history) {
    if (!row?.migration_id || !CHECKSUM_PATTERN.test(String(row.checksum || ''))) {
      diagnostics.push(diagnostic('error', 'history_invalid', 'Migration history berisi metadata tidak valid.', { id: row?.migration_id }));
      continue;
    }
    if (historyIds.has(row.migration_id)) {
      diagnostics.push(diagnostic('error', 'history_duplicate', 'Migration history berisi migration ID duplikat.', { id: row.migration_id }));
      continue;
    }
    historyIds.add(row.migration_id);
    const source = sourceById.get(row.migration_id);
    if (!source) {
      diagnostics.push(diagnostic('error', 'history_source_missing', 'Migration yang tercatat di database tidak ditemukan di manifest/source.', { id: row.migration_id }));
      continue;
    }
    if (source.checksum !== row.checksum) {
      diagnostics.push(diagnostic('error', 'checksum_mismatch', 'Checksum migration source berbeda dari history database.', { id: row.migration_id }));
    }
    if (row.status !== 'applied' && row.status !== 'adopted') {
      diagnostics.push(diagnostic('error', 'history_not_applied', 'Migration history berisi migration yang tidak berstatus applied.', { id: row.migration_id, status: row.status }));
    }
  }

  return diagnostics;
}

export async function inspectDatabaseHistory(connection, migrations) {
  try {
    const [tables] = await connection.execute(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
      [HISTORY_TABLE],
    );
    if (!tables.length) {
      return {
        available: false,
        diagnostics: [diagnostic('warning', 'history_unavailable', 'Migration history belum ada di database. Tidak ada schema yang diubah.')],
        history: [],
      };
    }
    const [history] = await connection.execute(
      `SELECT migration_id, checksum, status, started_at, applied_at, failed_at FROM ${HISTORY_TABLE} ORDER BY migration_id`,
    );
    return { available: true, diagnostics: compareMigrationHistory(migrations, history), history };
  } catch (error) {
    return {
      available: false,
      diagnostics: [diagnostic('error', 'database_unavailable', 'Koneksi atau pembacaan migration history database gagal.', { databaseCode: error?.code || 'UNKNOWN' })],
      history: [],
    };
  }
}

export const hasErrors = (diagnostics) => diagnostics.some((entry) => entry.level === 'error');
