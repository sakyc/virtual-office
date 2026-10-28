import React, {useEffect,useRef,useState} from 'react';
import {paymentRequest,loadSnap} from './payment-data.js';
import {formatIdr} from './billing-data.js';

const labels={creating:'Sedang disiapkan — periksa status',pending:'Menunggu pembayaran',paid:'Lunas · berhasil diberikan',expired:'Kedaluwarsa',cancelled:'Dibatalkan',denied:'Ditolak',needs_review:'Perlu pemeriksaan admin'};
export function PaymentCheckout({data,onChanged}) {
  const [state,setState]=useState({loading:true}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[amount,setAmount]=useState('50000');
  const alive=useRef(false),locked=useRef(false),attempt=useRef(null),abort=useRef(null);
  async function refresh(signal) {
    const next=await paymentRequest('',undefined,signal);
    if(attempt.current?.orderId && next.orders.some(o=>o.id===attempt.current.orderId && ['paid','expired','cancelled','denied'].includes(o.status)))attempt.current=null;
    if(alive.current)setState(next);
  }
  useEffect(()=>{
    alive.current=true;const controller=new AbortController();abort.current=controller;
    refresh(controller.signal).catch(()=>{if(alive.current)setState({error:'Pembayaran belum tersedia. Pastikan konfigurasi Midtrans dan migration 017 sudah dipasang.'});});
    return()=>{alive.current=false;controller.abort();};
  },[]);
  async function act(work) {
    if(locked.current)return;locked.current=true;setBusy(true);setMessage('');
    try {await work();}catch(e){if(alive.current && e.name!=='AbortError'){
      setMessage(e.message);
      // Checkout may have been saved before a provider/network failure.
      // Show that order immediately instead of encouraging a blind new payment.
      await refresh(abort.current.signal).catch(()=>{});
    }}
    finally{locked.current=false;if(alive.current)setBusy(false);}
  }
  async function open(order) {
    if(!order.snapToken){setMessage('Pesanan tersimpan. Gunakan Periksa status; jangan membuat pembayaran ulang jika sudah membayar.');return;}
    const snap=await loadSnap(state.config);
    if(!alive.current)return;
    const update=()=>{
      if(!alive.current)return;
      setMessage('Status akhir diverifikasi oleh server. Gunakan Periksa status jika belum berubah.');
      refresh(abort.current.signal).catch(()=>{});onChanged?.();
    };
    snap.pay(order.snapToken,{onSuccess:update,onPending:update,onError:update,onClose:update});
  }
  function checkout(purchase) {return act(async()=>{
    const signature=JSON.stringify(purchase);
    if(attempt.current?.signature!==signature)attempt.current={signature,requestId:crypto.randomUUID()};
    const order=await paymentRequest('/checkout',{...purchase,requestId:attempt.current.requestId},abort.current.signal);
    attempt.current.orderId=order.id;
    await refresh(abort.current.signal);await open(order);
  });}
  function check(order){return act(async()=>{
    await paymentRequest(`/${encodeURIComponent(order.id)}/check`,{},abort.current.signal);
    await refresh(abort.current.signal);onChanged?.();
  });}
  if(state.loading)return <p role="status">Memuat pembayaran…</p>;
  if(state.error)return <aside className="billing-notice" role="status">{state.error}</aside>;
  return <PaymentCheckoutView {...{data,state,busy,message,amount,setAmount,checkout,act,open,check}}/>;
}
export function PaymentCheckoutView({data,state,busy,message,amount,setAmount,checkout,act,open,check}) {
  const enabled=state.config?.enabled, pending=state.orders.some(o=>o.kind==='subscription' && ['creating','pending','needs_review'].includes(o.status));
  return <section className="payment-checkout" aria-label="Pembayaran Midtrans">
    <h2>Pembayaran & top up</h2>
    {state.config?.mode==='sandbox' && <aside className="billing-notice"><strong>Mode Sandbox · bukan pembayaran sungguhan</strong><p>Gunakan hanya akun/organisasi pengujian. Saldo uji bukan dana sungguhan dan harus direkonsiliasi sebelum beralih ke Production.</p></aside>}
    {!enabled ? <p>Pembayaran belum diaktifkan. Admin perlu memasang key Midtrans.</p> : <>
      {!data.subscription ? <div><p>Pilih paket bulanan. Paket dan saldo berlaku untuk seluruh organisasi.</p><div className="payment-actions">{data.plans.filter(p=>!p.quoteRequired).map(p=><button type="button" disabled={busy||pending} key={p.code} onClick={()=>checkout({kind:'subscription',planCode:p.code,expectedPlanVersion:p.version})}>Beli {p.name} · {formatIdr(p.monthlyPriceIdr)}</button>)}</div></div>
        : <p>Perpanjangan, upgrade, Custom, dan add-on masih melalui admin. Belum tersedia autodebit.</p>}
      {data.entitlements.active && <form className="payment-topup" onSubmit={e=>{e.preventDefault();checkout({kind:'topup',amountIdr:amount});}}><label>Nominal top up (Rp)<input type="number" min="10000" max="10000000" step="1" required value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy}/></label><button disabled={busy} type="submit">Top up saldo AI</button><small>Rp10.000–Rp10.000.000. Top up tidak memperpanjang masa langganan.</small></form>}
    </>}
    {message && <p role="status">{message}</p>}
    <h3>Riwayat pembayaran</h3><p>30 transaksi terakhir. Menutup popup tidak membatalkan transaksi.</p>
    {state.orders.length ? <div className="billing-table-wrap"><table><thead><tr><th>Pesanan</th><th>Nominal</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{state.orders.map(o=><tr key={o.id}><td><small>{o.id}</small><br/>{o.kind==='topup'?'Top up':'Langganan'} · {o.mode}</td><td>{formatIdr(o.amountIdr)}</td><td>{labels[o.status]||o.status}{['refund','partial_refund','chargeback','partial_chargeback'].includes(o.providerStatus)&&<small> · Pengembalian dana perlu pemeriksaan admin</small>}</td><td><div className="payment-actions">{enabled && o.mode===state.config.mode && <>{o.snapToken&&<button type="button" disabled={busy} onClick={()=>act(()=>open(o))}>Lanjutkan bayar</button>}<button type="button" disabled={busy} onClick={()=>check(o)}>Periksa status</button></>}</div></td></tr>)}</tbody></table></div>:<p>Belum ada pembayaran.</p>}
  </section>;
}
