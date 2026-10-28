import React from 'react';
import { formatIdr } from './billing-data.js';
import './billing.css';

const descriptions = { starter: 'Awal yang ringan untuk kantor AI Anda.', pro: 'Ruang lebih luas untuk tim yang berkembang.', business: 'Kapasitas lebih besar untuk banyak divisi.', custom: 'Sesuaikan kapasitas dengan kebutuhan organisasi.' };
export function PricingCards({ plans = [], dashboard = false, currentPlan, paymentEnabled = false }) {
  return <div className="billing-plans">{plans.map((plan) => {
    const custom = Boolean(plan.quoteRequired);
    return <article key={plan.code} className={`billing-plan${plan.code === 'pro' ? ' billing-plan-featured' : ''}`}>
      {plan.code === 'pro' && <span className="billing-badge">Rekomendasi</span>}
      <h3>{plan.name}</h3><p className="billing-description">{descriptions[plan.code]}</p>
      <div className="billing-price">{custom ? 'Sesuai kebutuhan' : formatIdr(plan.monthlyPriceIdr)}</div>
      <p className="billing-period">{custom ? 'Penawaran khusus' : 'per organisasi / bulan'}</p>
      <ul>
        <li><strong>{custom ? 'Saldo AI sesuai kesepakatan' : `${formatIdr(plan.includedCreditIdr)} saldo AI / bulan`}</strong></li>
        <li>{custom ? 'Jumlah divisi sesuai kesepakatan' : `${plan.maxDivisions} divisi · hingga ${plan.maxDivisions * plan.agentsPerDivision} agen AI`}</li>
        <li>{plan.agentsPerDivision} agen AI per divisi</li>
        <li>{custom ? 'Anggota manusia sesuai kesepakatan' : `${plan.maxMembers} anggota manusia`}</li>
        <li>{custom ? 'WhatsApp sesuai kesepakatan (belum aktif)' : plan.whatsapp ? 'Notifikasi & persetujuan WhatsApp (belum aktif)' : 'Tanpa fitur WhatsApp'}</li>
      </ul>
      {dashboard ? <button type="button" disabled>{currentPlan === plan.code ? 'Paket saat ini' : custom ? 'Hubungi admin untuk penawaran' : paymentEnabled ? 'Pilih melalui bagian pembayaran di atas' : 'Pembayaran belum tersedia'}</button>
        : <a href="/dashboard/billing">Lihat paket di dashboard <span aria-hidden="true">↗</span></a>}
    </article>;
  })}</div>;
}
export function BillingPolicyNote() {
  return <p className="billing-policy">Saldo AI paket berlaku untuk periode bulanan dan digunakan lebih dahulu. Saldo top up tidak kedaluwarsa. Tidak ada batas penggunaan 5 jam atau mingguan. Pembayaran tersedia di bagian pembayaran dashboard setelah Midtrans diaktifkan. Biaya AI dipotong sesuai penggunaan aktual. Pengiriman WhatsApp belum aktif.</p>;
}
