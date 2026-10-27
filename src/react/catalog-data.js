export async function loadPublicPlans(signal, request = fetch) {
  const response = await request('/api/plans', { credentials: 'same-origin', cache: 'no-store', signal });
  if (!response.ok) throw new Error('Harga paket belum dapat dimuat. Coba lagi.');
  const data = await response.json();
  if (data.currency !== 'IDR' || !Array.isArray(data.plans)) throw new Error('Katalog paket tidak valid.');
  return data.plans;
}
export async function adminCatalogRequest({ code, body, signal } = {}, request = fetch) {
  const response = await request(code ? `/api/admin/billing/plans/${encodeURIComponent(code)}` : '/api/admin/billing/plans', {
    method: code ? 'PUT' : 'GET', credentials: 'same-origin', cache: 'no-store', signal,
    ...(code ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw Object.assign(new Error(response.status === 401 ? 'Silakan login terlebih dahulu.'
    : response.status === 403 ? 'Akses khusus Admin Platform. Admin workspace tidak memiliki izin ini.'
      : response.status === 409 ? 'Paket sudah diubah admin lain. Muat ulang sebelum menyimpan.'
        : response.status === 400 ? 'Periksa isian: harga rupiah bulat, batas divisi 1–8, dan alasan perubahan minimal 5 karakter.'
          : 'Katalog admin belum tersedia. Periksa migration 009 dan layanan server.'), { status: response.status });
  return response.json();
}
