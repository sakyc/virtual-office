import React,{useEffect,useRef,useState} from 'react';
import {billingOperationRequest} from './billing-operations-data.js';
import {formatIdr} from './billing-data.js';
import {adminCatalogRequest} from './catalog-data.js';
import {DEFAULT_MODEL_PRICES, MODEL_PRICE_REVIEW_BY} from '../../shared/ai-model-prices.js';

export function DefaultModelPrices() {
  return <section className="admin-panel"><h3>Tarif model bawaan</h3>
    <p>Harga dari screenshot yang disetujui pemilik proyek. Tidak perlu diinput ulang. Model dicocokkan otomatis dengan metadata provider, bukan menebak ID API.</p>
    <p>USD per 1 juta token · harga pelanggan = biaya provider × kurs rupiah × 2. Tinjau ulang sebelum {MODEL_PRICE_REVIEW_BY.slice(0, 10)}.</p>
    <div className="admin-table-scroll"><table><thead><tr><th>Model</th><th>Input</th><th>Output</th><th>Cache read</th></tr></thead>
      <tbody>{DEFAULT_MODEL_PRICES.map(p=><tr key={p.name}><td>{p.name}</td><td>${p.inputUsdPerMillion}</td><td>${p.outputUsdPerMillion}</td><td>${p.cacheReadUsdPerMillion}</td></tr>)}</tbody></table></div>
    <p>Tarif khusus admin di bawah mengesampingkan tarif bawaan, termasuk jika dinonaktifkan atau kedaluwarsa. Cache write dan extended thinking belum diaktifkan.</p>
  </section>;
}

export function ActivationLoader(props) {
  const [state,setState]=useState({});
  useEffect(()=>{const c=new AbortController();adminCatalogRequest({signal:c.signal}).then(data=>{if(!c.signal.aborted)setState({plans:data.plans});}).catch(e=>{if(!c.signal.aborted)setState({error:e.message});});return()=>c.abort();},[]);
  return state.plans?<SubscriptionActivation {...props} plans={state.plans}/>:<section className="admin-panel" role={state.error?'alert':'status'}><p>{state.error||'Memuat katalog untuk aktivasi…'}</p><button onClick={props.onClose}>Batal</button></section>;
}

export function SubscriptionActivation({organization,plans,onClose,onSaved,onDenied}) {
  const dialog=useRef(null),controller=useRef(null),busy=useRef(false);
  const [form,setForm]=useState({planCode:'starter',periodStart:new Date().toISOString().slice(0,10),approvalReference:'',reason:'',confirmedManualActivation:false});
  const [custom,setCustom]=useState({price:'',credit:'',divisions:1,members:1,whatsapp:false});
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID()),[status,setStatus]=useState({});
  const plan=plans.find(p=>p.code===form.planCode),isCustom=form.planCode==='custom';
  useEffect(()=>{dialog.current.showModal();return()=>controller.current?.abort();},[]);
  function change(k,v){setForm(f=>({...f,[k]:v,...(k==='confirmedManualActivation'?{}:{confirmedManualActivation:false})}));setRequestId(crypto.randomUUID());setStatus({});}
  async function submit(e){
    e.preventDefault();if(busy.current || !plan)return;busy.current=true;setStatus({saving:true});controller.current=new AbortController();
    try{const result=await billingOperationRequest(`/api/admin/organizations/${organization.id}/subscription`,{method:'POST',signal:controller.current.signal,body:{...form,requestId,expectedPlanVersion:plan.version,customTerms:isCustom?custom:null,periodStart:`${form.periodStart}T00:00:00.000Z`}});if(!controller.current.signal.aborted)onSaved(result);}
    catch(e){if(!controller.current.signal.aborted){if([401,403].includes(e.status))onDenied(e.message);else setStatus({error:e.message});}}
    finally{busy.current=false;}
  }
  return <dialog className="admin-action-dialog" ref={dialog} aria-label="Aktivasi langganan organisasi" onCancel={e=>{if(busy.current)e.preventDefault();else onClose();}}><form onSubmit={submit}>
    <span className="admin-kicker">AKTIVASI MANUAL · BUKAN CHECKOUT</span><h2>Aktifkan paket organisasi</h2><p><strong>{organization.organizationName}</strong> · ID #{organization.id}</p>
    <fieldset disabled={status.saving}><label>Paket<select value={form.planCode} onChange={e=>change('planCode',e.target.value)}>{plans.filter(p=>p.isPublic).map(p=><option key={p.code} value={p.code}>{p.name} · v{p.version}</option>)}</select></label>
      {isCustom?<><p>Isi seluruh ketentuan penawaran Custom yang telah disetujui.</p>{[['price','Harga bulanan (Rp)'],['credit','Saldo paket (Rp)'],['divisions','Divisi (1–8)'],['members','Anggota manusia']].map(([k,label])=><label key={k}>{label}<input required type={['divisions','members'].includes(k)?'number':'text'} min="1" max={k==='divisions'?8:65535} inputMode="numeric" pattern="[0-9]+" value={custom[k]} onChange={e=>{setCustom(c=>({...c,[k]:['divisions','members'].includes(k)?Number(e.target.value):e.target.value}));change('confirmedManualActivation',false);}}/></label>)}<label><input type="checkbox" checked={custom.whatsapp} onChange={e=>{setCustom(c=>({...c,whatsapp:e.target.checked}));change('confirmedManualActivation',false);}}/>Benefit WhatsApp (pengiriman belum aktif)</label></>:plan&&<p>Harga {formatIdr(plan.monthlyPriceIdr)}/bulan · saldo {formatIdr(plan.includedCreditIdr)} · {plan.maxDivisions} divisi · {plan.maxMembers} anggota · 4 agen/divisi.</p>}
      <label>Mulai periode (tanggal UTC)<input required type="date" value={form.periodStart} onChange={e=>change('periodStart',e.target.value)}/></label><p>Berakhir satu bulan kalender kemudian, tanggal akhir disesuaikan bila bulan lebih pendek. Saldo paket berakhir bersama periode.</p>
      <label>Referensi pembayaran/persetujuan manual<input required minLength={5} maxLength={191} pattern="[A-Za-z0-9][A-Za-z0-9:._\/\-]+" placeholder="receipt-atau-persetujuan-internal" value={form.approvalReference} onChange={e=>change('approvalReference',e.target.value)}/></label>
      <label>Alasan aktivasi<textarea required minLength={5} maxLength={500} value={form.reason} onChange={e=>change('reason',e.target.value)}/></label>
      <label className="catalog-check"><input required type="checkbox" checked={form.confirmedManualActivation} onChange={e=>change('confirmedManualActivation',e.target.checked)}/>Saya menyetujui aktivasi dan pemberian saldo paket ini. Sistem belum memverifikasi pembayaran melalui gateway.</label>
      {status.error&&<p role="alert">{status.error}</p>}<div className="admin-dialog-actions"><button type="button" onClick={onClose}>Batal</button><button type="submit" className="admin-primary">{status.saving?'Mengaktifkan…':'Konfirmasi aktivasi & saldo'}</button></div>
    </fieldset></form></dialog>;
}

export function TariffEditor({record,onSaved,onDenied}) {
  const now=new Date(),later=new Date(now.getTime()+30*86400000);
  const [model,setModel]=useState(record?.model||'');
  const [form,setForm]=useState({enabled:record?Boolean(record.enabled):false,sourceReference:record?.sourceReference||'',reason:'',confirmedProviderPricing:false,
    tariff:record?.tariff?Object.fromEntries(Object.entries(record.tariff).filter(([k])=>k!=='approvalReference')):{inputUsdPerMillion:'',outputUsdPerMillion:'',cacheReadUsdPerMillion:'',maxInputTokens:'',maxOutputTokens:'',verifiedAt:now.toISOString().replace(/\.\d+Z$/,'.000Z'),validUntil:later.toISOString().replace(/\.\d+Z$/,'.000Z')}});
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID()),[status,setStatus]=useState({}),busy=useRef(false),controller=useRef(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const change=(key,value)=>{setForm(f=>({...f,[key]:value,...(key==='confirmedProviderPricing'?{}:{confirmedProviderPricing:false})}));setRequestId(crypto.randomUUID());setStatus({});};
  async function submit(e){
    e.preventDefault();if(busy.current)return;busy.current=true;controller.current=new AbortController();setStatus({saving:true});
    try{await billingOperationRequest(`/api/admin/billing/tariffs/${model}`,{method:'PUT',signal:controller.current.signal,body:{...form,requestId,expectedVersion:record?.version||0}});if(!controller.current.signal.aborted)onSaved();}
    catch(e){if(!controller.current.signal.aborted){if([401,403].includes(e.status))onDenied(e.message);else setStatus({error:e.message});}}
    finally{busy.current=false;}
  }
  return <form className="catalog-editor" onSubmit={submit}><h3>{record?`${record.model} · v${record.version}`:'Tambah tarif model'}</h3><fieldset disabled={status.saving}>
    <label>ID model persis<input required pattern="[A-Za-z0-9._\-]+" maxLength={150} readOnly={Boolean(record)} placeholder="ID model versi lengkap dari provider" value={model} onChange={e=>{setModel(e.target.value);change('confirmedProviderPricing',false);}}/></label>
    <p>Harga dasar provider dalam USD per 1 juta token, bukan harga rupiah pelanggan. Markup tetap 2×; kurs dinamis disimpan pada setiap permintaan.</p>
    {[['inputUsdPerMillion','Input (USD / 1 juta)'],['outputUsdPerMillion','Output (USD / 1 juta)'],['cacheReadUsdPerMillion','Cache read (USD / 1 juta)'],['maxInputTokens','Batas konteks/input model'],['maxOutputTokens','Batas output model'],['verifiedAt','Diperiksa pada (ISO UTC)'],['validUntil','Berlaku sampai (ISO UTC)']].map(([k,label])=><label key={k}>{label}<input required type={k.startsWith('max')?'number':'text'} min="1" step="1" value={form.tariff[k]} onChange={e=>change('tariff',{...form.tariff,[k]:k.startsWith('max')?Number(e.target.value):e.target.value})}/></label>)}
    <label>URL sumber harga provider (HTTPS)<input required type="url" maxLength={500} placeholder="https://.../pricing" value={form.sourceReference} onChange={e=>change('sourceReference',e.target.value)}/></label>
    <label>Alasan perubahan<textarea required minLength={5} maxLength={500} value={form.reason} onChange={e=>change('reason',e.target.value)}/></label>
    <label className="catalog-check"><input type="checkbox" checked={form.enabled} onChange={e=>change('enabled',e.target.checked)}/>Aktifkan tarif untuk permintaan baru</label>
    <label className="catalog-check"><input required type="checkbox" checked={form.confirmedProviderPricing} onChange={e=>change('confirmedProviderPricing',e.target.checked)}/>Saya telah memeriksa harga, satuan, ID model, dan batas konteks pada sumber provider. Sistem mencatat persetujuan admin, bukan memverifikasi harga otomatis.</label>
    <p>Reservasi memakai batas konteks penuh, sehingga bisa jauh lebih besar daripada debit akhir. Tarif kedaluwarsa/nonaktif menolak permintaan baru; transaksi lama memakai snapshot semula.</p>
    {status.error&&<p role="alert">{status.error}</p>}<button type="submit">{status.saving?'Menyimpan…':'Simpan versi tarif'}</button>
  </fieldset></form>;
}
export function BillingOperations({onDenied,auditOnly=false}) {
  const [state,setState]=useState({loading:true}),[retry,setRetry]=useState(0);
  useEffect(()=>{const c=new AbortController();setState({loading:true});billingOperationRequest('/api/admin/billing/operations',{signal:c.signal}).then(data=>{if(!c.signal.aborted)setState({data});}).catch(e=>{if(!c.signal.aborted){if([401,403].includes(e.status))onDenied(e.message);else setState({error:e.message});}});return()=>c.abort();},[retry]);
  return <section className="billing-history"><div className="admin-section-heading"><h2>{auditOnly?'Log aktivasi & tarif AI':'Tarif AI untuk penagihan'}</h2><button onClick={()=>setRetry(n=>n+1)}>Muat ulang</button></div>
    {state.loading?<p role="status">Memuat administrasi billing…</p>:state.error?<p role="alert">{state.error}</p>:auditOnly?<>{state.data.audit.length?state.data.audit.map(r=><article className="catalog-audit" key={r.id}><strong>{r.action==='activate_subscription'?`Aktivasi organisasi #${r.organizationId}`:`Tarif ${r.model}`}</strong><p>Admin #{r.actorUserId} · {new Date(r.createdAt).toLocaleString('id-ID')}</p><p>{r.reason}</p></article>):<p>Belum ada aktivasi atau perubahan tarif.</p>}</>:<><DefaultModelPrices/><details><summary>Tarif khusus admin (opsional)</summary><p>Tidak perlu diisi untuk model yang sudah cocok dengan tarif bawaan. Gunakan untuk mengganti harga atau menonaktifkan model tertentu.</p><div className="catalog-grid">{state.data.tariffs.map(r=><TariffEditor key={`${r.model}:${r.version}`} record={r} onDenied={onDenied} onSaved={()=>setRetry(n=>n+1)}/>)}<TariffEditor key={`new:${retry}`} onDenied={onDenied} onSaved={()=>setRetry(n=>n+1)}/></div></details></>}
  </section>;
}
