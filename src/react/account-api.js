export async function saveAccount(action, body) {
  if (!['profile', 'workspace'].includes(action)) throw new Error('Pengaturan tidak valid.');
  try {
    const response = await fetch(`/api/account/${action}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (response.status === 401) throw new Error('Sesi berakhir. Silakan masuk kembali.');
    if (response.status === 403) throw new Error('Anda tidak memiliki izin mengubah pengaturan ini.');
    if (!response.ok) throw new Error('Pengaturan belum dapat disimpan. Periksa isian lalu coba lagi.');
    const profile = await response.json();
    if (!profile?.user || !Array.isArray(profile.workspaces)) throw new Error();
    return profile;
  } catch (error) {
    if (error.message.startsWith('Sesi berakhir') || error.message.startsWith('Anda tidak') || error.message.startsWith('Pengaturan belum')) throw error;
    throw new Error('Pengaturan belum dapat disimpan. Coba lagi.');
  }
}
