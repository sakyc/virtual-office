export function formatIdr(value) {
  if (!/^\d+$/.test(String(value))) return '—';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(BigInt(value));
}
export function billingBalances(grants) {
  const sums = { package: 0n, topup: 0n, adjustment: 0n, reserved: 0n };
  for (const grant of grants) {
    if (!['package', 'topup', 'adjustment'].includes(grant.source) ||
      !/^\d+$/.test(grant.availableIdr) || !/^\d+$/.test(grant.reservedIdr)) throw new Error('Data saldo tidak valid.');
    sums[grant.source] += BigInt(grant.availableIdr);
    sums.reserved += BigInt(grant.reservedIdr);
  }
  return { ...sums, available: sums.package + sums.topup + sums.adjustment };
}
export async function loadBilling(signal, request = fetch) {
  const response = await request('/api/billing', { credentials: 'same-origin', cache: 'no-store', signal });
  if (!response.ok) throw new Error(response.status === 403 ? 'Hanya pemilik organisasi yang dapat membuka langganan dan saldo.'
    : response.status === 401 ? 'Sesi berakhir. Silakan login kembali.' : 'Langganan dan saldo belum dapat dimuat. Coba lagi.');
  const body = await response.json();
  if (body?.currency !== 'IDR' || !Array.isArray(body.plans) || !Array.isArray(body.grants) || !Array.isArray(body.ledger) || !body.entitlements) throw new Error('Data billing tidak valid.');
  billingBalances(body.grants);
  return body;
}
