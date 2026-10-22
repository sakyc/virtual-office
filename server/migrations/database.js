import mysql from 'mysql2/promise';

export function approvedNonProductionEnvironment(env = process.env) {
  return env.MIGRATION_NON_PROD_APPROVED === '1'
    && env.MIGRATION_TARGET_LABEL === 'non-production'
    && Boolean(env.MIGRATION_NON_PROD_DB_NAME)
    && env.MIGRATION_NON_PROD_DB_NAME === (env.DB_NAME || 'kantor_ai');
}

export function migrationConnectionOptions(env = process.env) {
  return {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'kantor_ai',
    multipleStatements: false,
  };
}

export async function connectApprovedNonProduction(env = process.env) {
  if (!approvedNonProductionEnvironment(env)) {
    const error = new Error('Target non-production belum dikonfirmasi.');
    error.code = 'NON_PRODUCTION_CONFIRMATION_REQUIRED';
    throw error;
  }
  return mysql.createConnection(migrationConnectionOptions(env));
}

export function safeDatabaseError(error) {
  return { code: error?.code || 'DATABASE_ERROR', message: 'Operasi migration database gagal.' };
}
