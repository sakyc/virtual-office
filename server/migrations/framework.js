import { Umzug } from 'umzug';
import { HISTORY_TABLE } from './status.js';

const LOCK_NAME = 'virtual-office:migration';

export function baselineForAdoption(migrations) {
  if (migrations[0]?.id !== '001_current_schema_baseline'
      || migrations.filter((migration) => migration.id === '001_current_schema_baseline').length !== 1) {
    throw Object.assign(new Error('Adoption hanya berlaku untuk baseline awal immutable.'), { code: 'BASELINE_ADOPTION_INVALID' });
  }
  return migrations[0];
}

function splitSql(source) {
  // Baseline SQL intentionally contains ordinary statements only; no routines/delimiters.
  return source.split(/;\s*(?:\r?\n|$)/).map((sql) => sql.trim()).filter(Boolean);
}

export async function ensureHistoryTable(connection) {
  await connection.execute(`CREATE TABLE IF NOT EXISTS ${HISTORY_TABLE} (
    migration_id VARCHAR(191) NOT NULL PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    checksum CHAR(64) NOT NULL,
    status ENUM('started','applied','failed','adopted') NOT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_at DATETIME NULL,
    failed_at DATETIME NULL,
    error_code VARCHAR(80) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

export async function acquireMigrationLock(connection, timeoutSeconds = 10) {
  const [[row]] = await connection.execute('SELECT GET_LOCK(?, ?) AS acquired', [LOCK_NAME, timeoutSeconds]);
  if (Number(row?.acquired) !== 1) {
    const error = new Error('Migration lain sedang berjalan.');
    error.code = 'MIGRATION_LOCK_UNAVAILABLE';
    throw error;
  }
}

export async function releaseMigrationLock(connection) {
  await connection.execute('SELECT RELEASE_LOCK(?) AS released', [LOCK_NAME]);
}

export async function validateHistory(connection, migrations) {
  const [rows] = await connection.execute(`SELECT migration_id, checksum, status FROM ${HISTORY_TABLE} ORDER BY migration_id`);
  const byId = new Map(migrations.map((migration) => [migration.id, migration]));
  for (const row of rows) {
    const source = byId.get(row.migration_id);
    if (!source || source.checksum !== row.checksum) {
      const error = new Error('Migration history tidak cocok dengan source immutable.');
      error.code = 'MIGRATION_HISTORY_MISMATCH';
      throw error;
    }
    if (row.status !== 'applied' && row.status !== 'adopted') {
      const error = new Error('Migration sebelumnya gagal atau belum selesai. Ikuti recovery runbook; jangan jalankan ulang otomatis.');
      error.code = 'MIGRATION_HISTORY_NOT_FINAL';
      throw error;
    }
  }
}

export async function ensureFreshApplicationSchema(connection) {
  const [rows] = await connection.execute(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('clients', 'jobs', 'items', 'revisions')",
  );
  if (rows.length) {
    const error = new Error('Fresh initialization menolak schema aplikasi yang sudah ada. Gunakan validation/adoption eksplisit.');
    error.code = 'EXISTING_APPLICATION_SCHEMA';
    throw error;
  }
}

export function createUmzug(connection, migrations) {
  const migrationById = new Map(migrations.map((migration) => [migration.id, migration]));
  return new Umzug({
    context: connection,
    migrations: migrations.map((migration) => ({
      name: migration.id,
      up: async () => {
        await connection.execute(
          `INSERT INTO ${HISTORY_TABLE} (migration_id, file_name, checksum, status) VALUES (?, ?, ?, 'started')`,
          [migration.id, migration.file, migration.checksum],
        );
        try {
          for (const statement of splitSql(migration.source)) await connection.execute(statement);
        } catch (error) {
          await connection.execute(`UPDATE ${HISTORY_TABLE} SET status = 'failed', failed_at = CURRENT_TIMESTAMP, error_code = ? WHERE migration_id = ?`, [error?.code || 'SQL_ERROR', migration.id]);
          throw error;
        }
      },
    })),
    storage: {
      async executed() {
        const [rows] = await connection.execute(`SELECT migration_id FROM ${HISTORY_TABLE} WHERE status IN ('applied', 'adopted') ORDER BY migration_id`);
        return rows.map((row) => row.migration_id);
      },
      async logMigration({ name }) {
        const migration = migrationById.get(name);
        await connection.execute(`UPDATE ${HISTORY_TABLE} SET status = 'applied', applied_at = CURRENT_TIMESTAMP WHERE migration_id = ? AND checksum = ? AND status = 'started'`, [name, migration.checksum]);
      },
      async unlogMigration() { throw new Error('Down migration tidak didukung. Gunakan migration corrective baru.'); },
    },
    logger: undefined,
  });
}

export async function applyMigrations(connection, migrations) {
  const [historyTables] = await connection.execute(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
    [HISTORY_TABLE],
  );
  if (!historyTables.length) await ensureFreshApplicationSchema(connection);
  await ensureHistoryTable(connection);
  await validateHistory(connection, migrations);
  const [[historyCount]] = await connection.execute(`SELECT COUNT(*) AS count FROM ${HISTORY_TABLE}`);
  if (Number(historyCount.count) === 0) await ensureFreshApplicationSchema(connection);
  const umzug = createUmzug(connection, migrations);
  return umzug.up();
}
