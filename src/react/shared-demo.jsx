import React,{useEffect,useRef,useState} from 'react';
import {BrandMark} from './brand.jsx';
import {formatIdr} from './billing-data.js';
import './shared-demo.css';

export const visitMessages={
  VISIT_UNAVAILABLE:'Demo terjadwal belum dikonfigurasi. Hubungi admin.',
  VISIT_SESSION_REQUIRED:'Masuk dengan akun pemohon terlebih dahulu, lalu buka kembali halaman ini.',
  VISIT_PAUSED:'Akses demo sedang dinonaktifkan admin.',
  VISIT_REQUEST_EXISTS:'Anda masih memiliki pengajuan berjalan. Gunakan pengajuan yang sudah ada.',
  VISIT_FIELDS_INVALID:'Periksa isian formulir. Input Anda tidak dihapus.',
  VISIT_DATE_INVALID:'Pilih jadwal mendatang, maksimal 90 hari dari sekarang.',
  VISIT_APPROVAL_INVALID:'Durasi harus 15 menit–4 jam, saldo Rp100–Rp10.000, dan alasan minimal 5 karakter.',
  VISIT_SCHEDULE_CONFLICT:'Jadwal bertabrakan dengan pemohon lain. Pilih waktu yang berbeda.',
  VISIT_SEND_UNCONFIRMED:'Gateway belum mengonfirmasi pengiriman WA. Tunggu 60 detik sebelum kirim ulang.',
  VISIT_SEND_LIMIT:'Batas pengiriman/percobaan tercapai. Tunggu sebelum mencoba kembali.',
  VISIT_CODE_INVALID:'Kode salah. Periksa pesan WA terbaru; input Anda tetap disimpan.',
  VISIT_CODE_EXPIRED:'Kode sudah dipakai, kedaluwarsa, atau mencapai 5 percobaan. Hubungi admin untuk kode akses baru.',
  VISIT_WINDOW_CLOSED:'Demo hanya dapat dimasuki pada jadwal yang disetujui admin.',
  VISIT_PHONE_CHANGED:'Nomor WhatsApp akun berubah sejak pengajuan. Hubungi admin.',
  VISIT_PHONE_REQUIRED:'Nomor WhatsApp terdaftar belum valid. Periksa pengaturan akun.',
  VISIT_STATUS_CONFLICT:'Status pengajuan sudah berubah. Muat ulang sebelum melanjutkan.',
  VISIT_VERIFY_FIRST:'Pengajuan harus diverifikasi WhatsApp dan berstatus menunggu persetujuan.',
  VISIT_OCCUPIED:'Akun demo sedang digunakan. Hubungi admin.',
};
export const visitStatus=b=>b.expired && ['approved','active'].includes(b.status)?'Waktu berakhir':({verifying:'Verifikasi WA',pending:'Menunggu admin',approved:'Disetujui',active:'Sedang digunakan',ended:'Selesai',rejected:'Ditolak'}[b.status] || b.status);
export const visitDate=v=>v?new Date(v).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'})+' WIB':'—';
export async function visitRequest(path,body,signal,request=fetch) {
  const r=await request(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal,
    ...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  const data=await r.json().catch(()=>null);
  if(!r.ok)throw Object.assign(Error(visitMessages[data?.code] || (r.status===401?'Silakan masuk dengan akun pemohon.':'Permintaan belum dapat diproses. Muat ulang dan coba kembali.')),{status:r.status,code:data?.code});
  return data;
}
export function ScheduledDemoPage() {
  const [state,setState]=useState({loading:true}),[form,setForm]=useState({company:'',needs:'',requestedAt:''});
  const [codes,setCodes]=useState({}),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  const lock=useRef(false),controller=useRef(null);
  useEffect(()=>{const c=new AbortController();controller.current=c;
    visitRequest('/api/shared-demo',undefined,c.signal).then(data=>{if(!c.signal.aborted)setState({data});})
      .catch(e=>{if(!c.signal.aborted)setState({error:e.message,login:e.status===401});});
    return()=>c.abort();},[retry]);
  async function act(path,body={}) {
    if(lock.current)return;lock.current=true;setBusy(true);setMessage('');
    const c=controller.current;
    try {
      const result=await visitRequest(path,body,c.signal);if(c.signal.aborted)return;
      if(result.entered){location.assign('/dashboard/office');return;}
      setMessage(result.sent?'Pesan diterima gateway WhatsApp. Periksa WA Anda.':result.verified?'Nomor terverifikasi. Pengajuan menunggu persetujuan admin.':'Pengajuan tersimpan. Kirim OTP untuk verifikasi WhatsApp.');
      setRetry(n=>n+1);
    }catch(e){if(!c.signal.aborted)setMessage(e.message);}finally{lock.current=false;if(!c.signal.aborted)setBusy(false);}
  }
  return <main className="scheduled-demo-page"><div className="visit-orb" aria-hidden="true"/><div className="visit-container">
    <header className="visit-brand"><a href="/"><BrandMark/>Karyora</a><a href="/demo">Trial pribadi 7 hari →</a></header>
    <section className="visit-hero"><span className="visit-kicker">DEMO TERJADWAL</span><h1>Kenali kantor AI,<br/>dengan akses khusus.</h1><p>Verifikasi WhatsApp, ajukan jadwal, lalu terima kode akses dari admin. Demo memakai satu akun bersama, bergantian sesuai jadwal.</p><div className="visit-steps"><span>01 · Ajukan & verifikasi</span><span>02 · Admin atur jadwal</span><span>03 · Masuk dengan kode</span></div></section>
    <aside className="visit-note">6 divisi berisi agen siap dicoba. Saldo AI dan durasi ditentukan admin. Data percobaan Anda dipisahkan dari pengunjung lain. Ini bukan trial pribadi 7 hari.</aside>
    {state.loading?<p role="status">Memuat pengajuan…</p>:state.error?<section className="visit-card"><p role="alert">{state.error}</p>{state.login?<p><a href="/login?visit=1">Masuk</a> atau <a href="/register?visit=1">daftar akun</a> untuk melanjutkan pengajuan demo.</p>:<button onClick={()=>setRetry(n=>n+1)}>Coba lagi</button>}</section>:<>
      {!state.data.accepting && <p role="status" className="visit-note">Pengajuan dan akses demo sedang ditutup admin.</p>}
      {!state.data.rows.some(b=>['verifying','pending'].includes(b.status) || (['approved','active'].includes(b.status)&&!b.expired)) && state.data.accepting && <form className="visit-card visit-form" onSubmit={e=>{e.preventDefault();act('/api/shared-demo',{...form,requestedAt:new Date(form.requestedAt).toISOString()});}}>
        <h2>Ajukan jadwal demo</h2><p>Nama, email, dan WhatsApp memakai data akun Anda.</p><fieldset disabled={busy}><label>Perusahaan / organisasi<input required minLength={2} maxLength={150} value={form.company} onChange={e=>setForm({...form,company:e.target.value})}/></label><label>Kebutuhan yang ingin dicoba<textarea required minLength={5} maxLength={2000} value={form.needs} onChange={e=>setForm({...form,needs:e.target.value})}/></label><label>Usulan jadwal (zona waktu perangkat)<input required type="datetime-local" value={form.requestedAt} onChange={e=>setForm({...form,requestedAt:e.target.value})}/></label><button type="submit">{busy?'Memproses…':'Kirim pengajuan'}</button></fieldset>
      </form>}
      <div className="visit-section-heading"><h2>Pengajuan saya</h2><button disabled={busy} onClick={()=>setRetry(n=>n+1)}>Muat ulang</button></div>
      {!state.data.rows.length && <p>Belum ada pengajuan demo.</p>}
      {state.data.rows.map(b=><article className="visit-card" key={b.id}><div className="visit-section-heading"><h3>{b.company}</h3><span className="visit-badge">{visitStatus(b)}{!b.enabled?' · Dijeda':''}</span></div><p>Usulan: {visitDate(b.requestedAt)}</p>{b.startsAt && <p>Jadwal: <strong>{visitDate(b.startsAt)}</strong> s/d <strong>{visitDate(b.endsAt)}</strong><br/>Saldo AI {formatIdr(b.creditIdr)}</p>}
        {b.status==='verifying' && <><button disabled={busy} onClick={()=>act(`/api/shared-demo/${b.id}/otp`)}>Kirim / kirim ulang OTP WhatsApp</button><form className="visit-code-form" onSubmit={e=>{e.preventDefault();act(`/api/shared-demo/${b.id}/verify`,{code:codes[b.id]||''});}}><label>OTP 6 digit<input required pattern="[0-9]{6}" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codes[b.id]||''} onChange={e=>setCodes({...codes,[b.id]:e.target.value})}/></label><button disabled={busy}>Verifikasi</button></form><small>OTP 5 menit · 5 percobaan · jeda kirim 60 detik.</small></>}
        {b.status==='pending' && <p>WhatsApp terverifikasi. Admin akan menyetujui jadwal dan mengirim kode akses ke nomor yang sama.</p>}
        {b.status==='approved' && !b.expired && <><p>{b.codeSent?'Kode akses sudah dikirim oleh admin.':'Menunggu admin mengirim kode akses.'} Masuk hanya pada jadwal yang disetujui.</p><form className="visit-code-form" onSubmit={e=>{e.preventDefault();act(`/api/shared-demo/${b.id}/enter`,{code:codes[b.id]||''});}}><label>Kode akses dari WhatsApp<input required maxLength={50} value={codes[b.id]||''} onChange={e=>setCodes({...codes,[b.id]:e.target.value})}/></label><button disabled={busy || !b.enabled || !state.data.accepting}>Masuk kantor demo</button></form><small>Anda akan berpindah ke akun demo bersama. Keluar lalu login ulang untuk kembali ke akun pribadi. Kode hanya sekali pakai; jika keluar lebih awal, hubungi admin.</small></>}
      </article>)}
    </>}{message && <p className="visit-message" role="status">{message}</p>}
  </div></main>;
}
