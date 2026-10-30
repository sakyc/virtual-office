import React,{useEffect,useRef,useState} from 'react';
import {BrandMark} from './brand.jsx';
import {formatIdr} from './billing-data.js';
import './shared-demo.css';

export const visitMessages={
  VISIT_UNAVAILABLE:'Demo belum dikonfigurasi. Hubungi admin.',
  VISIT_SERVICE_ERROR:'Layanan demo sedang bermasalah. Coba lagi atau hubungi admin; input Anda tidak dihapus.',
  VISIT_SCHEMA_REQUIRED:'Database demo belum diperbarui. Hubungi admin.',
  VISIT_NOT_FOUND:'Pengajuan tidak ditemukan di browser ini. Gunakan browser saat mengajukan, atau tautan dan kode akses dari WhatsApp.',
  VISIT_SESSION_REQUIRED:'Masuk dengan akun pemohon terlebih dahulu, lalu buka kembali halaman ini.',
  VISIT_PAUSED:'Akses demo sedang dinonaktifkan admin.',
  VISIT_REQUEST_EXISTS:'Anda masih memiliki pengajuan berjalan. Gunakan pengajuan yang sudah ada.',
  VISIT_FIELDS_INVALID:'Periksa isian formulir. Input Anda tidak dihapus.',
  VISIT_DATE_INVALID:'Usulan jadwal harus di waktu mendatang (hingga 90 hari ke depan). Boleh dikosongkan agar admin memilih jadwal; tidak perlu menunggu 90 hari.',
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
  VISIT_OCCUPIED:'Demo sedang digunakan. Kode dan durasi Anda belum terpakai.',
};
export const visitStatus=b=>b.expired && ['approved','active'].includes(b.status)?'Waktu berakhir':({verifying:'Verifikasi WA',pending:'Menunggu admin',approved:'Disetujui',active:'Sedang digunakan',ended:'Selesai',rejected:'Ditolak'}[b.status] || b.status);
export const visitDate=v=>v?new Date(v).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'})+' WIB':'—';
export async function visitRequest(path,body,signal,request=fetch) {
  const r=await request(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal,
    ...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  const data=await r.json().catch(()=>null);
  if(!r.ok)throw Object.assign(Error(visitMessages[data?.code] || (r.status===401?'Silakan masuk dengan akun pemohon.':'Permintaan belum dapat diproses. Muat ulang dan coba kembali.')),{status:r.status,code:data?.code,saved:data?.saved});
  return data;
}
export function visitRemaining(data,elapsed=0) {
  const end=Date.parse(data?.occupiedUntil),now=Date.parse(data?.serverNow);
  return Number.isFinite(end)&&Number.isFinite(now)?Math.max(0,Math.ceil((end-now-Math.max(0,elapsed))/1000)):null;
}
export function DemoAvailability({version=0}) {
  const [state,setState]=useState(null),[,tick]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let running=false;
    const check=async()=>{
      if(running)return;running=true;
      try {
        const data=await visitRequest('/api/shared-demo/availability',undefined,controller.signal);
        if(!controller.signal.aborted)setState({data,receivedAt:performance.now()});
      }catch{if(!controller.signal.aborted)setState({error:true});}finally{running=false;}
    };
    check();const poll=setInterval(check,15000),timer=setInterval(()=>tick(n=>n+1),1000);
    return()=>{controller.abort();clearInterval(poll);clearInterval(timer);};
  },[version]);
  const data=state?.data,seconds=data?visitRemaining(data,performance.now()-state.receivedAt):null;
  return <aside className="visit-note visit-availability" role="status">
    {!state?'Memeriksa ketersediaan demo…':state.error?'Ketersediaan belum dapat diperbarui. Kami akan mencoba lagi otomatis.':!data.enabled?'Akses demo sedang ditutup admin.':data.available?<><strong>Demo tersedia</strong><p>Gunakan kode Anda untuk masuk. Durasi baru dimulai setelah berhasil masuk.</p></>:<><strong>Demo sedang digunakan</strong><p>{seconds>0?<>Perkiraan tersedia dalam <b>{Math.floor(seconds/60)} menit {seconds%60} detik</b>, sekitar {visitDate(data.occupiedUntil)}.</>:'Sisa waktu selesai. Sedang menunggu konfirmasi ketersediaan dari server…'}</p><p>Kode dan durasi Anda belum terpakai. Kode tetap memiliki batas aktivasi 7 hari. Status diperbarui otomatis.</p></>}
    <small>Tidak ada nomor antrean atau reservasi. Setelah tersedia, yang berhasil masuk lebih dahulu mendapat akses. Identitas pengunjung lain tidak ditampilkan.</small>
  </aside>;
}
export function ScheduledDemoPage() {
  const [state,setState]=useState({loading:true}),[form,setForm]=useState({name:'',email:'',phone:'',company:'',needs:''});
  const [entry,setEntry]=useState(()=>({booking:typeof window==='undefined'?'':new URLSearchParams(window.location.search).get('booking')||'',code:'',legacy:typeof window!=='undefined' && new URLSearchParams(window.location.search).get('legacy')==='1'}));
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
      if(result.occupied){setMessage('Demo sedang digunakan. Lihat sisa waktu di panel ketersediaan. Kode dan durasi Anda belum terpakai.');setRetry(n=>n+1);return;}
      if(result.verified)setCodes({});
      setMessage(result.sent?'Pesan diterima gateway WhatsApp. Periksa WA Anda.':result.verified?'Nomor terverifikasi. Pengajuan menunggu persetujuan admin.':'Pengajuan tersimpan. Kirim OTP untuk verifikasi WhatsApp.');
      setRetry(n=>n+1);
    }catch(e){if(!c.signal.aborted)setMessage(e.message);}finally{lock.current=false;if(!c.signal.aborted)setBusy(false);}
  }
  return <main className="scheduled-demo-page"><div className="visit-orb" aria-hidden="true"/><div className="visit-container">
    <header className="visit-brand"><a href="/"><BrandMark/>Karyora</a><a href="/demo">Trial pribadi 7 hari →</a></header>
    <section className="visit-hero"><span className="visit-kicker">DEMO BERGANTIAN · TANPA DAFTAR AKUN</span><h1>Kenali kantor AI,<br/>tanpa atur jadwal.</h1><p>Isi biodata dan verifikasi WhatsApp. Setelah admin menyetujui, kode akses otomatis dikirim ke WA. Gunakan kapan saja dalam 7 hari ketika demo tersedia.</p><div className="visit-steps"><span>01 · Biodata & OTP WA</span><span>02 · Persetujuan admin</span><span>03 · Masuk saat tersedia</span></div></section>
    <aside className="visit-note">6 divisi berisi agen siap dicoba. Saldo AI dan durasi ditentukan admin. Data percobaan Anda dipisahkan dari pengunjung lain. Ini bukan trial pribadi 7 hari.</aside>
    <DemoAvailability version={retry}/>
    {state.loading?<p role="status">Memuat pengajuan…</p>:state.error?<section className="visit-card"><p role="alert">{state.error}</p>{state.login?<p><a href="/login?visit=1">Masuk</a> atau <a href="/register?visit=1">daftar akun</a> untuk melanjutkan pengajuan demo.</p>:<button onClick={()=>setRetry(n=>n+1)}>Coba lagi</button>}</section>:<>
      {!state.data.accepting && <p role="status" className="visit-note">Pengajuan dan akses demo sedang ditutup admin.</p>}
      {!state.data.rows.some(b=>['verifying','pending'].includes(b.status) || (['approved','active'].includes(b.status)&&!b.expired)) && state.data.accepting && <form className="visit-card visit-form" onSubmit={e=>{e.preventDefault();act('/api/shared-demo',form);}}>
        <h2>Ajukan demo</h2><p>Tidak perlu membuat akun atau memilih tanggal. WhatsApp dipakai untuk OTP dan kode akses. Email hanya untuk kontak, bukan email terverifikasi.</p><fieldset disabled={busy}>
          <label>Nama lengkap<input required autoComplete="name" minLength={2} maxLength={150} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
          <label>Email<input required type="email" autoComplete="email" maxLength={254} value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
          <label>Nomor WhatsApp aktif<input required type="tel" autoComplete="tel" placeholder="0812… / +62812…" maxLength={20} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
          <label>Perusahaan / organisasi<input required minLength={2} maxLength={150} value={form.company} onChange={e=>setForm({...form,company:e.target.value})}/></label><label>Kebutuhan yang ingin dicoba<textarea required minLength={5} maxLength={2000} value={form.needs} onChange={e=>setForm({...form,needs:e.target.value})}/></label><button type="submit">{busy?'Memproses…':'Lanjut verifikasi WhatsApp'}</button></fieldset>
      </form>}
      <div className="visit-section-heading"><h2>Pengajuan saya</h2><button disabled={busy} onClick={()=>setRetry(n=>n+1)}>Muat ulang</button></div>
      {!state.data.rows.length && <p>Belum ada pengajuan di browser ini. Sudah menerima kode? Gunakan formulir masuk di bawah.</p>}
      {state.data.rows.map(b=><article className="visit-card" key={b.id}><div className="visit-section-heading"><h3>{b.company}</h3><span className="visit-badge">{visitStatus(b)}{!b.enabled?' · Dijeda':''}</span></div>{b.durationMinutes?<p>Durasi {b.durationMinutes} menit · Saldo AI {formatIdr(b.creditIdr)}<br/>{b.startsAt?<>Mulai {visitDate(b.startsAt)} · berakhir {visitDate(b.endsAt)}</>:<>Durasi belum berjalan. Aktifkan kode sebelum {visitDate(b.codeExpiresAt)}.</>}</p>:b.startsAt && <p>Pengajuan jadwal lama: {visitDate(b.startsAt)} s/d {visitDate(b.endsAt)}<br/>Saldo AI {formatIdr(b.creditIdr)}</p>}
        {b.status==='verifying' && <><button disabled={busy} onClick={()=>act(`/api/shared-demo/${b.id}/${b.legacy?'legacy-otp':'otp'}`)}>Kirim / kirim ulang OTP WhatsApp</button><form className="visit-code-form" onSubmit={e=>{e.preventDefault();act(`/api/shared-demo/${b.id}/${b.legacy?'legacy-verify':'verify'}`,{code:codes[b.id]||''});}}><label>OTP 6 digit<input required pattern="[0-9]{6}" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codes[b.id]||''} onChange={e=>setCodes({...codes,[b.id]:e.target.value})}/></label><button disabled={busy}>Verifikasi</button></form><small>OTP 5 menit · 5 percobaan · jeda kirim 60 detik.</small></>}
        {b.status==='pending' && <p>WhatsApp terverifikasi. Admin akan menentukan durasi dan saldo; kode otomatis dikirim setelah disetujui.</p>}
        {b.status==='approved' && !b.expired && <><p>{b.codeSent?'Kode akses sudah dikirim ke WhatsApp.':'Pengiriman kode belum dikonfirmasi. Hubungi admin untuk kirim ulang.'} {b.durationMinutes?'Tidak perlu memilih jadwal. Durasi dimulai setelah berhasil masuk.':'Pengajuan lama tetap mengikuti jadwal persetujuannya.'}</p><form className="visit-code-form" onSubmit={e=>{e.preventDefault();act(`/api/shared-demo/${b.id}/${b.legacy?'legacy-enter':'enter'}`,{code:codes[b.id]||''});}}><label>Kode akses dari WhatsApp<input required maxLength={50} value={codes[b.id]||''} onChange={e=>setCodes({...codes,[b.id]:e.target.value})}/></label><button disabled={busy || !b.enabled || !state.data.accepting}>Masuk kantor demo</button></form><small>Anda akan berpindah ke akun demo bersama. Keluar lalu login ulang untuk kembali ke akun pribadi. Kode hanya sekali pakai; jika keluar lebih awal, hubungi admin.</small></>}
      </article>)}
    </>}
    <form className="visit-card visit-form" onSubmit={e=>{e.preventDefault();act(`/api/shared-demo/${entry.booking}/${entry.legacy?'legacy-enter':'enter'}`,{code:entry.code});}}>
      <h2>Sudah menerima kode akses?</h2><p>Buka tautan dari WA agar referensi terisi otomatis. Kode akses tetap dimasukkan di sini, tidak disimpan di URL. Pengajuan baru tidak perlu login.</p>
      {entry.legacy && <p>Ini pengajuan lama berbasis akun. <a href="/login?visit=1">Masuk sebagai pemohon</a> terlebih dahulu.</p>}
      <fieldset disabled={busy}><label>Referensi pengajuan<input required pattern="[a-f0-9-]{36}" maxLength={36} value={entry.booking} onChange={e=>setEntry({...entry,booking:e.target.value})}/></label>
      <label>Kode akses dari WA<input required maxLength={50} autoComplete="off" value={entry.code} onChange={e=>setEntry({...entry,code:e.target.value})}/></label><button>Masuk kantor demo</button></fieldset>
      <small>Kode baru berlaku untuk aktivasi dalam 7 hari setelah disetujui, sekali pakai. Jika sedang digunakan, tunggu lalu coba lagi. Durasi belum berjalan sampai Anda berhasil masuk. Masuk demo mengganti sesi akun pribadi pada browser ini.</small>
    </form>
    {message && <p className="visit-message" role="status">{message}</p>}
  </div></main>;
}
