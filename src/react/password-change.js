import { validPassword } from '../../shared/auth-validation.js';

export function passwordChangeErrors({ currentPassword, newPassword, confirmation }) {
  const errors = {};
  if (!currentPassword) errors.currentPassword = 'Isi kata sandi lama.';
  else if (new TextEncoder().encode(currentPassword).length > 256) errors.currentPassword = 'Kata sandi lama maksimal 256 byte.';
  if (!validPassword(newPassword)) errors.newPassword = 'Penuhi semua persyaratan kata sandi di bawah.';
  else if (new TextEncoder().encode(newPassword).length > 256) errors.newPassword = 'Kata sandi baru maksimal 256 byte.';
  else if (newPassword === currentPassword) errors.newPassword = 'Kata sandi baru harus berbeda dari kata sandi lama.';
  if (!confirmation) errors.confirmation = 'Ulangi kata sandi baru.';
  else if (confirmation !== newPassword) errors.confirmation = 'Konfirmasi tidak sama dengan kata sandi baru.';
  return errors;
}

export async function changePassword(values, request = fetch) {
  const errors = passwordChangeErrors(values);
  if (Object.keys(errors).length) throw Object.assign(new Error('Periksa kembali isian kata sandi.'), { fields: errors });
  let response;
  try {
    response = await request('/api/account/password', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }) });
  } catch {
    throw new Error('Koneksi terputus. Isian tetap tersimpan di formulir; periksa koneksi dan sesi sebelum mencoba lagi.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (body.code === 'CURRENT_PASSWORD_INCORRECT') throw Object.assign(new Error('Kata sandi lama salah. Silakan periksa kembali.'),
      { fields: { currentPassword: 'Kata sandi lama salah.' } });
    if (body.code === 'LOCAL_PASSWORD_REQUIRED') throw new Error('Akun ini tidak menggunakan kata sandi lokal.');
    const messages = { 400: 'Periksa kata sandi lama dan persyaratan kata sandi baru.',
      401: 'Sesi berakhir. Silakan masuk kembali.', 403: 'Permintaan ditolak. Pastikan alamat aplikasi sesuai konfigurasi server.',
      429: 'Terlalu banyak percobaan. Tunggu 15 menit sebelum mencoba lagi.' };
    throw new Error(messages[response.status] || 'Kata sandi belum dapat diubah. Isian tidak dihapus; coba lagi sebentar.');
  }
  // A proxy HTML page must not be treated as a successful password change.
  const body = await response.json().catch(() => null);
  if (body?.next !== '/login') throw new Error('Respons layanan tidak valid. Periksa sesi sebelum mencoba lagi.');
}
