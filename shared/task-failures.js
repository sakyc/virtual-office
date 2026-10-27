// Only these fixed, public messages may leave the server. Never expose Error.message,
// SQL, provider response bodies, prompts, credentials or arbitrary persisted text.
const messages = {
  FX_UNAVAILABLE: 'Kurs USD ke rupiah belum tersedia. Tugas belum dapat dikirim ke AI. Coba lagi nanti.',
  BALANCE_INSUFFICIENT: 'Saldo AI tidak cukup untuk reservasi biaya tugas. Tambah saldo atau pilih model yang lebih hemat.',
  SUBSCRIPTION_REQUIRED: 'Langganan aktif diperlukan untuk menjalankan tugas.',
  MODEL_UNAVAILABLE: 'Model atau tarif AI tidak tersedia. Pilih model aktif atau hubungi admin.',
  ACCESS_EXPIRED: 'Sesi atau izin workspace berubah. Login kembali dan periksa akses agen.',
  PROVIDER_AUTH: 'Penyedia AI menolak kredensial layanan. Hubungi admin; jangan mengirim ulang berulang kali.',
  PROVIDER_MODEL: 'Model yang dipilih ditolak atau tidak ditemukan oleh penyedia AI. Pilih model lain atau hubungi admin.',
  PROVIDER_BUSY: 'Penyedia AI sedang sibuk atau membatasi permintaan. Coba lagi nanti.',
  PROVIDER_CONNECTION: 'Koneksi ke penyedia AI terputus atau melewati batas waktu. Status biaya perlu diperiksa sebelum mencoba lagi.',
  PROVIDER_UNAVAILABLE: 'Layanan penyedia AI mengalami gangguan. Periksa status penggunaan sebelum mencoba lagi.',
  OUTPUT_TRUNCATED: 'Jawaban AI terpotong karena batas output. Perkecil cakupan tugas sebelum mencoba lagi.',
  OUTPUT_INVALID: 'Jawaban AI tidak sesuai format draft yang diperlukan. Biaya provider mungkin sudah tercatat; periksa penggunaan sebelum mencoba lagi.',
  BILLING_UNRESOLVED: 'Pencatatan atau penyelesaian biaya belum dapat dipastikan. Hubungi admin sebelum mencoba lagi.',
  STORAGE_FAILED: 'Hasil tugas belum dapat disimpan. Biaya AI mungkin sudah tercatat; hubungi admin sebelum mencoba lagi.',
  UNKNOWN: 'Penyebab rinci tugas ini tidak tercatat. Tidak dikirim ulang otomatis; hubungi admin sebelum mencoba lagi.',
};
export function taskFailure(code) {
  const safe = Object.hasOwn(messages, code) ? code : 'UNKNOWN';
  return { code: safe, message: messages[safe] };
}
export function classifyTaskFailure(error, phase = '') {
  if (error?.taskFailureCode) return taskFailure(error.taskFailureCode);
  const code = error?.code;
  const known = {
    AI_BILLING_FX_UNAVAILABLE: 'FX_UNAVAILABLE', INSUFFICIENT_AI_BALANCE: 'BALANCE_INSUFFICIENT',
    ACTIVE_SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED', AI_BILLING_PRICING_REQUIRED: 'MODEL_UNAVAILABLE',
    AI_BILLING_ACCESS_DENIED: 'ACCESS_EXPIRED', JOB_ACCESS_REVOKED: 'ACCESS_EXPIRED',
    TASK_OUTPUT_TRUNCATED: 'OUTPUT_TRUNCATED', TASK_OUTPUT_INVALID: 'OUTPUT_INVALID',
    TASK_PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
    AI_USAGE_UNAVAILABLE: 'BILLING_UNRESOLVED', AI_BILLING_USAGE_UNRESOLVED: 'BILLING_UNRESOLVED',
    AI_BILLING_DISPATCH_CONFLICT: 'BILLING_UNRESOLVED',
  };
  if (Object.hasOwn(known, code)) return taskFailure(known[code]);
  if (phase === 'access' && [401, 403].includes(error?.status)) return taskFailure('ACCESS_EXPIRED');
  if (phase === 'save') return taskFailure('STORAGE_FAILED');
  if (phase === 'provider') {
    if (error?.status === 401 || error?.status === 403) return taskFailure('PROVIDER_AUTH');
    if (error?.status === 400 || error?.status === 404) return taskFailure('PROVIDER_MODEL');
    if (error?.status === 429 || error?.status === 529) return taskFailure('PROVIDER_BUSY');
    if (['APIConnectionError','APIConnectionTimeoutError'].includes(error?.name) || ['ETIMEDOUT','ECONNRESET','ECONNREFUSED'].includes(code)) return taskFailure('PROVIDER_CONNECTION');
    if (error?.status >= 500) return taskFailure('PROVIDER_UNAVAILABLE');
  }
  return taskFailure('UNKNOWN');
}
export function storedTaskFailure(error, phase) { return JSON.stringify({ taskFailure: classifyTaskFailure(error, phase).code }); }
export function readTaskFailure(value) {
  try { return taskFailure(JSON.parse(value)?.taskFailure); } catch { return taskFailure('UNKNOWN'); }
}
