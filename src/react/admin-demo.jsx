import React,{useEffect,useRef,useState} from 'react';
import {visitRequest,visitDate,visitStatus} from './shared-demo.jsx';
import {formatIdr} from './billing-data.js';

const actionLabels={approve:'Setujui jadwal', 'send-code':'Kirim kode WA',pause:'Jeda akses',resume:'Aktifkan akses',end:'Akhiri demo',reject:'Tolak pengajuan',control:'Ubah akses global'};
export function AdminDemo({onDenied}) {
  const [state,setState]=useState({loading:true}),[retry,setRetry]=useState(0),[selected,setSelected]=useState(null),[form,setForm]=useState({reason:'',startsAt:'',endsAt:'',creditIdr:1000});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),lock=useRef(false),controller=useRef(null);
  useEffect(()=>{const c=new AbortController();controller.current=c;setState({loading:true});
    visitRequest('/api/admin/demo',undefined,c.signal).then(data=>{if(!c.signal.aborted)setState({data});}).catch(e=>{if(!c.signal.aborted){if([401,403].includes(e.status))onDenied(e.message);else setState({error:e.message});}});
    return()=>c.abort();},[retry]);
  function choose(b,action){setSelected({b,action});setForm({reason:'',startsAt:'',endsAt:'',creditIdr:1000});setMessage('');}
  async function save(e) {
    e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setMessage('');
    const c=controller.current;
    try {
      const {action,b}=selected;
      const body=action==='approve'?{reason:form.reason,startsAt:new Date(form.startsAt).toISOString(),endsAt:new Date(form.endsAt).toISOString(),creditIdr:Number(form.creditIdr)}
        :action==='control'?{enabled:!state.data.control.enabled,reason:form.reason}:{reason:form.reason};
      await visitRequest(`/api/admin/demo/${action==='control'?'control':`${b.id}/${action}`}`,body,c.signal);
      if(c.signal.aborted)return;setSelected(null);setMessage('Tindakan tersimpan dan tercatat di audit.');setRetry(n=>n+1);
    }catch(e){if(!c.signal.aborted)setMessage(e.message);}finally{lock.current=false;if(!c.signal.aborted)setBusy(false);}
  }
  return <div className="admin-demo"><aside className="admin-policy"><p>Satu akun demo internal, satu pengunjung aktif. Setiap kunjungan memakai data kantor terisolasi dengan 6 divisi bawaan. Trial pribadi tidak berubah. Jadwal ditampilkan dalam WIB.</p></aside>
    {state.loading?<p role="status">Memuat pengajuan demo…</p>:state.error?<p role="alert">{state.error}</p>:<>
      <section className="admin-panel visit-section-heading"><div><h2>Akses demo bersama</h2><p>{state.data.control.enabled?'Aktif · menerima pengajuan dan akses sesuai jadwal':'Nonaktif · semua akses demo ditutup'} · Akun internal {state.data.control.userId?`#${state.data.control.userId}`:'dibuat otomatis saat kunjungan pertama'}</p></div><button disabled={busy} onClick={()=>choose(null,'control')}>{state.data.control.enabled?'Nonaktifkan':'Aktifkan'} demo</button></section>
      <section className="admin-panel"><h2>Pengajuan & pemakaian</h2><p>100 pengajuan terbaru. Saldo adalah rupiah, bukan jumlah token. Pengiriman kode dilakukan setelah jadwal disetujui.</p><div className="admin-directory-table"><table><thead><tr>{['Pemohon','Status & jadwal','Pemakaian','Tindakan'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{!state.data.rows.length?<tr><td colSpan={4}>Belum ada pengajuan.</td></tr>:state.data.rows.map(b=><tr key={b.id}><td><strong>{b.name||b.email}</strong><small>{b.email} · {b.phone}</small><small>{b.company}</small><p className="visit-needs">{b.needs}</p></td><td><span className="admin-badge">{visitStatus(b)}{!b.enabled?' · Dijeda':''}</span><small>Usulan {visitDate(b.requestedAt)}</small>{b.startsAt && <><small>{visitDate(b.startsAt)}</small><small>s/d {visitDate(b.endsAt)}</small></>}</td><td><strong>{formatIdr(b.spentIdr)} / {b.creditIdr?formatIdr(b.creditIdr):'—'}</strong><small>{Number(b.tokens||0).toLocaleString('id-ID')} token input + output</small><small>Aktivitas {visitDate(b.lastSeenAt)}</small></td><td><div className="admin-row-actions">{(b.status==='pending'?['approve','reject']:b.status==='verifying'?['reject']:['approved','active'].includes(b.status)?[...(!b.expired?[b.enabled?'pause':'resume',...(b.status==='approved'?['send-code']:[])]:[]),'end']:[]).map(action=><button key={action} disabled={busy} onClick={()=>choose(b,action)}>{actionLabels[action]}</button>)}</div></td></tr>)}</tbody></table></div></section>
      <section className="admin-panel"><h2>Audit demo</h2>{state.data.history.map(a=><article className="catalog-audit" key={a.id}><strong>{actionLabels[a.action]||a.action}</strong><p>{visitDate(a.createdAt)} · Aktor #{a.actorUserId} · {a.bookingId||'Global'}</p><p>{a.reason}</p></article>)}</section>
    </>}
    {selected && <section className="admin-panel visit-action-panel" aria-labelledby="visit-action-title"><form onSubmit={save}><h2 id="visit-action-title">{actionLabels[selected.action]}</h2><p>{selected.b?.company || 'Berlaku untuk seluruh pengajuan demo bersama.'}</p><fieldset disabled={busy}>
      {selected.action==='approve' && <><label>Mulai (zona waktu perangkat)<input required type="datetime-local" value={form.startsAt} onChange={e=>setForm({...form,startsAt:e.target.value})}/></label><label>Selesai (15 menit–4 jam)<input required type="datetime-local" value={form.endsAt} onChange={e=>setForm({...form,endsAt:e.target.value})}/></label><label>Saldo AI (Rp100–Rp10.000)<input required type="number" min={100} max={10000} step={1} value={form.creditIdr} onChange={e=>setForm({...form,creditIdr:e.target.value})}/></label></>}
      <label>Alasan tindakan<textarea required minLength={5} maxLength={500} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></label><div className="admin-dialog-actions"><button type="button" onClick={()=>setSelected(null)}>Batal</button><button className="admin-primary" type="submit">{busy?'Memproses…':'Konfirmasi'}</button></div></fieldset></form></section>}
    {message && <p className="visit-message" role="status">{message}</p>}
  </div>;
}
