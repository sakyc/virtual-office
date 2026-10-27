const messages={
  SESSION_REQUIRED:'Sesi berakhir. Silakan login kembali.',PLATFORM_ADMIN_REQUIRED:'Akses khusus Admin Platform.',
  SUBSCRIPTION_ALREADY_EXISTS:'Organisasi ini sudah memiliki catatan langganan. Perpanjangan atau penggantian paket belum tersedia.',
  CATALOG_VERSION_CONFLICT:'Katalog berubah. Tutup formulir, muat ulang, lalu periksa kembali harga dan benefit.',
  BILLING_TARIFF_VERSION_CONFLICT:'Tarif diubah admin lain. Muat ulang sebelum menyimpan.',
  BILLING_EXISTING_CAPACITY_EXCEEDED:'Jumlah divisi atau anggota yang ada melebihi paket ini. Tidak ada data yang dipindahkan atau dihapus.',
  BILLING_ADMIN_IDEMPOTENCY_CONFLICT:'Referensi tindakan sudah digunakan dengan isian berbeda. Muat ulang dan periksa riwayat.',
  BILLING_ADMIN_SCHEMA_REQUIRED:'Administrasi billing memerlukan migration 012.',
  BILLING_PERIOD_EXPIRED:'Periode langganan sudah berakhir. Periksa tanggal mulai.',
  BILLING_TARIFF_INVALID:'Periksa harga USD per 1 juta token, batas model, tanggal validitas, dan konfirmasi harga provider.',
  BILLING_TARIFF_SOURCE_INVALID:'Sumber harus URL HTTPS tanpa kredensial, query, atau fragment.',
  BILLING_MODELS_UNAVAILABLE:'Katalog model belum tersedia. Muat ulang setelah layanan provider dan database tersedia.',
  MODEL_CATALOG_SEED_REQUIRED:'Model belum terdaftar di katalog database. Jalankan sinkronisasi/seeder model terlebih dahulu.',
};
export async function billingOperationRequest(path,{method='GET',body,signal}={},request=fetch) {
  if(!['GET','POST','PUT'].includes(method) || !(method==='GET' && ['/api/admin/billing/operations','/api/admin/models'].includes(path) || method==='POST' && /^\/api\/admin\/organizations\/[1-9][0-9]*\/subscription$/.test(path) || method==='PUT' && /^\/api\/admin\/billing\/tariffs\/[A-Za-z0-9._-]+$/.test(path)))throw new Error('Endpoint billing tidak valid.');
  const res=await request(path,{method,credentials:'same-origin',cache:'no-store',signal,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  if(!res.ok){const e=await res.json().catch(()=>({}));throw Object.assign(new Error(messages[e.code] || (res.status===400?'Periksa seluruh isian, referensi, dan konfirmasi tindakan.':res.status===401?messages.SESSION_REQUIRED:res.status===403?messages.PLATFORM_ADMIN_REQUIRED:'Operasi billing belum tersedia. Muat ulang dan periksa riwayat sebelum mencoba lagi.')),{status:res.status,code:e.code});}
  return res.json();
}
