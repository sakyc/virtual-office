import React, { useEffect, useState } from 'react';
import { billingBalances, formatIdr, loadBilling } from './billing-data.js';
import { trialTiming } from '../../shared/trial.js';

// Scope keys only invalidate presentation; the endpoint resolves identity/tenant.
export function useBillingBalance(profile, page) {
  const scope = `${profile?.user?.id}:${profile?.activeWorkspace?.id}:${profile?.activeWorkspace?.role}`;
  const allowed = Boolean(profile?.user?.id && profile?.activeWorkspace?.id && profile.activeWorkspace.role === 'owner');
  const [state, setState] = useState({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!allowed) return;
    let current, disposed = false;
    const refresh = () => {
      if (document.hidden) return;
      current?.abort(); current = new AbortController(); const request = current;
      // Never keep showing a balance after a failed/revoked session refresh.
      loadBilling(request.signal).then(data => { if (!disposed && !request.signal.aborted) setState({ scope, data }); })
        .catch(error => { if (!disposed && !request.signal.aborted) setState({ scope, error: error.message }); });
    };
    setState({ scope, loading: true }); refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { disposed = true; current?.abort(); clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [scope, allowed, page, retry]);
  return { ...(allowed ? state.scope === scope ? state : { loading: true } : { restricted: true }), refresh: () => setRetry(n => n + 1) };
}

export function BillingBalanceIndicator({ state, onNavigate }) {
  if (state.restricted) return null;
  const amount = state.data ? formatIdr(billingBalances(state.data.grants).available) : '—';
  return <button type="button" className="balance-indicator" onClick={() => onNavigate('/dashboard/billing')}
    aria-label={`Saldo AI tersedia ${amount}. Lihat langganan dan saldo`}
    title={state.error ? 'Saldo belum dapat dimuat. Buka halaman saldo untuk mencoba lagi.' : 'Saldo AI yang bisa dipakai. Klik untuk melihat rincian.'}>
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 8V5H5a2 2 0 0 0 0 4h15v11H5a2 2 0 0 1-2-2V7m17 5h-5v5h5"/></svg>
    <span>Saldo <strong>{amount}</strong></span>
  </button>;
}

export function BillingBalanceHighlight({ state, onNavigate, compact = false }) {
  const { data, error, loading, restricted } = state;
  const balances = data ? billingBalances(data.grants) : null;
  const included = data?.demo?.credit_idr ?? data?.subscription?.included_credit_idr;
  const budget = /^\d+$/.test(String(included)) ? BigInt(included) : 0n;
  const percent = balances && budget > 0n ? Number((balances.package > budget ? budget : balances.package) * 100n / budget) : null;
  const plan = data?.plans.find(p => p.code === data.subscription?.plan_code)?.name;
  const trial = data?.demo ? trialTiming(data.demo) : null;
  return <section className={`balance-highlight${compact ? ' balance-compact' : ''}`} aria-label="Sisa Saldo AI">
    <div className="balance-heading"><span>SALDO AI TERSEDIA</span>{data && <button type="button" onClick={state.refresh} aria-label="Perbarui saldo">↻</button>}</div>
    {restricted ? <p>Saldo organisasi dikelola pemilik organisasi.</p> : loading || (!data && !error) ? <p role="status">Memuat saldo…</p> : error ? <><p role="status">Saldo belum dapat dimuat.</p><button type="button" onClick={state.refresh}>Coba lagi</button></> : <>
      <strong className="balance-amount">{formatIdr(balances.available)}</strong>
      <p>{trial ? data.demo.shared ? trial.label : trial.active ? `Trial · ${trial.daysRemaining} hari tersisa` : trial.label : data.entitlements.active ? `Paket ${plan || data.subscription?.plan_code}` : 'Tidak ada paket aktif'} · saldo bersama organisasi</p>
      {trial && <p>{trial.active ? 'Berakhir' : 'Berakhir pada'} {trial.expiresLabel}{!trial.active && ' · penggunaan AI terkunci'}</p>}
      {percent !== null && <><div className="balance-progress" role="progressbar" aria-label="Sisa saldo paket yang tersedia" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${percent}%` }}/></div><p>Sisa paket {formatIdr(balances.package)} / {formatIdr(budget)}</p></>}
      {balances.reserved > 0n && <p className="balance-pending">Ditahan sementara {formatIdr(balances.reserved)} · sudah dikecualikan dari saldo tersedia</p>}
      {!compact && <p>Saldo dalam rupiah, bukan jumlah token. Biaya mengikuti model dan penggunaan aktual.</p>}
    </>}
    {!restricted && <button type="button" className="balance-link" onClick={() => onNavigate('/dashboard/billing')}>Lihat langganan & saldo →</button>}
  </section>;
}
