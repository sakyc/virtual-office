import React, { useEffect, useState } from 'react';
import { PricingCards, BillingPolicyNote } from './pricing-cards.jsx';
import { billingBalances, formatIdr, loadBilling } from './billing-data.js';
import { PaymentCheckout } from './payment-checkout.jsx';

const eventNames = { subscription: 'Aktivasi langganan', credit: 'Penambahan saldo', reserve: 'Reservasi saldo', settle: 'Pemakaian AI', release: 'Pelepasan reservasi' };
const eventNotes = { subscription: 'Saldo paket masuk, bukan biaya penggunaan AI.', credit: 'Saldo ditambahkan.', reserve: 'Ditahan sementara, bukan potongan final. Jangan dijumlahkan dengan pemakaian AI.', settle: 'Biaya final. Sisa dari reservasi terkait otomatis kembali ke saldo tersedia.', release: 'Dana yang ditahan dikembalikan, bukan top up baru.' };
export function BillingPage({ balanceState } = {}) {
  const [state, setState] = useState({ loading: true });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (balanceState) return;
    const controller = new AbortController();
    setState({ loading: true });
    loadBilling(controller.signal).then((data) => { if (!controller.signal.aborted) setState({ data }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ error: error.message }); });
    return () => controller.abort();
  }, [retry, Boolean(balanceState)]);
  const current = balanceState || state;
  if (current.restricted) return <p role="alert">Hanya pemilik organisasi yang dapat membuka langganan dan saldo.</p>;
  if (current.loading || (!current.data && !current.error)) return <p role="status">Memuat langganan dan saldo organisasi…</p>;
  if (current.error) return <div className="billing-notice" role="alert"><p>{current.error}</p><button type="button" onClick={balanceState?.refresh || (() => setRetry((n) => n + 1))}>Coba lagi</button></div>;
  return <BillingContent data={current.data} onChanged={balanceState?.refresh || (() => setRetry(n=>n+1))}/>;
}

export function BillingContent({ data, onChanged }) {
  const balances = billingBalances(data.grants);
  const subscription = data.subscription;
  const active = data.entitlements.active && Boolean(subscription);
  const plan = data.plans.find((p) => p.code === subscription?.plan_code);
  return <section className="billing-page" aria-label="Langganan dan saldo organisasi">
    <header><span className="billing-eyebrow">LANGGANAN & SALDO</span><h2>Kantor Anda, kapasitas pilihan Anda.</h2><p>Paket dan saldo dibagikan dalam organisasi, bukan per akun pengguna.</p></header>
    {data.demo && <aside className="billing-notice"><strong>Demo Karyora · 6 divisi</strong><p>Saldo awal Rp3.000 · berakhir {new Date(data.demo.expiresAt).toLocaleString('id-ID')}. Demo bukan langganan berbayar dan tidak bisa top up. Untuk membeli paket dengan kapasitas lebih kecil, arsipkan divisi yang tidak dipilih di halaman Tim terlebih dahulu. Riwayat tetap tersimpan.</p></aside>}
    <div className="billing-summary">
      <article><span>Langganan</span><h3>{active ? plan?.name || subscription.plan_code : subscription ? 'Langganan tidak aktif' : 'Belum berlangganan'}</h3><p>{active ? `Periode berakhir ${new Date(subscription.period_end).toLocaleDateString('id-ID')}` : 'Belum ada paket aktif untuk organisasi ini.'}</p></article>
      <article className="billing-available"><span>Sisa Saldo AI · bisa dipakai</span><h3>{formatIdr(balances.available)}</h3><p>Paket {formatIdr(balances.package)} · Top up {formatIdr(balances.topup)}{balances.adjustment > 0n ? ` · Penyesuaian ${formatIdr(balances.adjustment)}` : ''}</p><p>Sudah dikurangi dana yang sedang ditahan. Tidak perlu dikurangi lagi.</p></article>
      <article><span>Ditahan sementara (reservasi)</span><h3>{formatIdr(balances.reserved)}</h3><p>Belum menjadi biaya final. Sisa dana kembali setelah penggunaan berhasil dihitung; proses yang belum pasti tetap ditahan untuk diperiksa.</p></article>
    </div>
    <aside className="billing-reservation-help" aria-label="Penjelasan reservasi saldo"><h3>Reservasi bukan biaya tambahan</h3><p>Sebelum AI bekerja, sebagian saldo ditahan untuk menutup perkiraan input dan batas jawaban. Sesudah selesai, hanya biaya aktual yang dipotong, lalu sisanya langsung kembali.</p><p><strong>Contoh:</strong> ditahan Rp2.203 → biaya aktual Rp245 → Rp1.958 kembali tersedia. Total biaya hanya Rp245, bukan Rp2.448.</p><p>Baris reservasi adalah catatan aktivitas lama, bukan berarti dana itu masih ditahan. Lihat kartu “Ditahan sementara” untuk jumlah yang masih ditahan saat ini.</p></aside>
    <PaymentCheckout data={data} onChanged={onChanged}>{purchaseProps=><>
      <h2>Pilih ruang untuk berkembang</h2>
      <PricingCards plans={data.plans} dashboard currentPlan={active ? subscription.plan_code : undefined} hasSubscription={Boolean(subscription)} {...purchaseProps}/>
    </>}</PaymentCheckout>
    <BillingPolicyNote/>
    <section className="billing-history"><h2>Aktivitas saldo</h2><p>Maksimal 50 aktivitas terakhir. Reservasi bukan biaya final.</p>
      {data.ledger.length ? <div className="billing-table-wrap"><table><thead><tr><th>Tanggal</th><th>Aktivitas</th><th>Nominal</th></tr></thead><tbody>{data.ledger.map((entry) => <tr key={entry.id}><td>{new Date(entry.createdAt).toLocaleString('id-ID')}</td><td>{eventNames[entry.kind] || 'Aktivitas saldo'}<small className="billing-event-note">{eventNotes[entry.kind] || 'Lihat rincian saldo organisasi.'}</small></td><td>{entry.kind === 'settle' ? '− ' : ''}{formatIdr(entry.amountIdr)}{entry.kind === 'reserve' && <small className="billing-event-note">Sementara · bukan biaya</small>}</td></tr>)}</tbody></table></div> : <p>Belum ada aktivitas saldo.</p>}
    </section>
  </section>;
}
