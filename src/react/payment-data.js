const messages = {
  PAYMENT_NOT_CONFIGURED: 'Midtrans belum dikonfigurasi.', PAYMENT_PLAN_CHANGED: 'Harga paket berubah. Muat ulang halaman sebelum membeli.',
  PAYMENT_FIRST_SUBSCRIPTION_ONLY: 'Perpanjangan dan perubahan paket belum dibuka. Hubungi admin.',
  PAYMENT_SUBSCRIPTION_PENDING: 'Masih ada pesanan paket. Lanjutkan atau periksa transaksi tersebut di bawah.',
  PAYMENT_CAPACITY_EXCEEDED: 'Kapasitas paket lebih kecil dari anggota/divisi yang ada. Hubungi admin.',
  PAYMENT_ACTIVE_SUBSCRIPTION_REQUIRED: 'Aktifkan langganan dahulu sebelum top up.',
  PAYMENT_SANDBOX_TENANT_REQUIRED: 'Sandbox hanya tersedia untuk organisasi pengujian yang ditentukan.',
  PAYMENT_ENVIRONMENT_MISMATCH: 'Transaksi berasal dari mode berbeda. Hubungi admin.',
  PAYMENT_TOPUP_INVALID: 'Top up harus berupa rupiah bulat antara Rp10.000 dan Rp10.000.000.',
};
export async function paymentRequest(path = '', body, signal, request = fetch) {
  const response = await request(`/api/payments${path}`, { method: body === undefined ? 'GET' : 'POST', credentials:'same-origin', cache:'no-store', signal,
    ...(body === undefined ? {} : {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}) });
  const data = await response.json().catch(()=>null);
  if (!response.ok) throw Error(response.status===401?'Sesi berakhir. Silakan login kembali.':messages[data?.code] || 'Pembayaran belum dapat diproses. Periksa riwayat sebelum mencoba lagi.');
  return data;
}
let snapLoading;
let snapConfiguration;
export function loadSnap(config) {
  const expected = config.mode==='production'?'https://app.midtrans.com/snap/snap.js':'https://app.sandbox.midtrans.com/snap/snap.js';
  if (config.scriptUrl!==expected || !config.clientKey) return Promise.reject(Error('Konfigurasi pembayaran tidak valid.'));
  const signature=JSON.stringify([expected,config.clientKey]);
  if (snapLoading) return snapConfiguration===signature?snapLoading:Promise.reject(Error('Konfigurasi Midtrans berubah. Muat ulang halaman sebelum membayar.'));
  snapConfiguration=signature;
  snapLoading = new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=expected;script.setAttribute('data-client-key',config.clientKey);
    const failed=()=>{clearTimeout(timer);script.remove();snapLoading=null;reject(Error('Midtrans tidak dapat dimuat. Periksa koneksi Anda.'));};
    const timer=setTimeout(failed,15000);
    script.onload=()=>{clearTimeout(timer);if(window.snap?.pay)resolve(window.snap);else failed();};
    script.onerror=failed;
    document.head.append(script);
  });
  return snapLoading;
}
