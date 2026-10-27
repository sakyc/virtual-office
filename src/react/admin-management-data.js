const messages = {
  SESSION_REQUIRED: 'Sesi berakhir. Silakan login kembali.',
  PLATFORM_ADMIN_REQUIRED: 'Akses khusus Admin Platform.',
  ADMIN_ACCOUNT_PROTECTED: 'Akun Admin Platform dilindungi. Gunakan prosedur operator untuk perubahan akses admin.',
  ADMIN_SELF_CHANGE_DENIED: 'Anda tidak dapat mengubah akun sendiri melalui panel ini.',
  ADMIN_USER_STATUS_CONFLICT: 'Status akun sudah berubah. Muat ulang sebelum melanjutkan.',
  ADMIN_USER_NOT_FOUND: 'Akun tidak ditemukan.',
  ADMIN_ORGANIZATION_NOT_FOUND: 'Organisasi tidak ditemukan.',
  ADMIN_ACTION_INVALID: 'Isi tindakan dan alasan minimal 5 karakter dengan benar.',
  ADMIN_SCHEMA_REQUIRED: 'Audit admin belum tersedia. Terapkan migration 010 terlebih dahulu; perubahan akun tidak disimpan.',
};
export async function adminManagementRequest(path, { body, signal } = {}, request = fetch) {
  if (!/^\/api\/admin\/(?:users(?:\/[1-9][0-9]*\/actions)?|organizations(?:\/[1-9][0-9]*\/members)?|subscriptions|activity)(?:\?[^#]*)?$/.test(path)) throw new Error('Endpoint admin tidak valid.');
  const response = await request(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw Object.assign(new Error(messages[error.code] || (response.status === 401 ? messages.SESSION_REQUIRED : response.status === 403 ? messages.PLATFORM_ADMIN_REQUIRED : 'Pengelolaan admin belum tersedia. Coba muat ulang.')), { status: response.status, code: error.code });
  }
  return response.json();
}
