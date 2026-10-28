import React,{useEffect,useRef,useState} from 'react';
import {BrandMark} from './brand.jsx';
import {preferredDark,saveTheme} from './theme-preference.js';
import './auth-appearance.css';

const errors={
  DEMO_UNAVAILABLE:'Demo belum tersedia. Hubungi admin untuk informasi aktivasi.',
  DEMO_SEND_UNCONFIRMED:'Pengiriman WhatsApp belum terkonfirmasi. Tunggu minimal 60 detik, lalu kirim ulang. Gunakan kode dari pengiriman terbaru yang berhasil.',
  DEMO_SEND_LIMIT:'Batas pengiriman atau percobaan tercapai. Tunggu sebentar sebelum mencoba lagi.',
  DEMO_CODE_INVALID:'Kode salah. Periksa pesan WhatsApp; input Anda tetap disimpan.',
  DEMO_CODE_EXPIRED:'Kode kedaluwarsa atau batas 5 percobaan tercapai. Minta kode baru.',
  DEMO_ALREADY_CLAIMED:'Nomor atau akun ini sudah memiliki klaim demo. Satu demo per nomor WhatsApp.',
  DEMO_PHONE_REQUIRED:'Akun belum memiliki nomor WhatsApp yang valid. Hubungi admin.',
  DEMO_PHONE_CHANGED:'Nomor akun berubah. Hubungi admin; klaim tidak dapat dipindahkan ke nomor lain.',
  DEMO_FRESH_ACCOUNT_REQUIRED:'Demo ini khusus akun yang belum memiliki organisasi atau workspace. Akun Anda tidak diubah.',
};
export async function demoRequest(path='',body,signal,request=fetch) {
  const response=await request(`/api/demo${path}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal,
    ...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(Error(response.status===401?'Silakan masuk atau daftar untuk mencoba demo.':errors[data?.code] || 'Demo belum dapat diproses. Coba lagi sebentar.'),{status:response.status});
  return data;
}
export function DemoPage({onNavigate}) {
  const [state,setState]=useState({loading:true}),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [dark,setDark]=useState(()=>{if(typeof window==='undefined')return false;try{return preferredDark({storage:localStorage,media:window.matchMedia?.bind(window)});}catch{return false;}});
  const locked=useRef(false),alive=useRef(false),controller=useRef(null);
  async function openOffice() {
    if(locked.current)return;locked.current=true;setBusy(true);setMessage('');
    try {
      const response=await fetch('/auth/active-workspace',{method:'POST',credentials:'same-origin',signal:controller.current.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({workspaceId:state.workspaceId})});
      if(!response.ok)throw Error('Kantor belum dapat dibuka. Silakan masuk ulang dan pilih workspace demo.');
      if(alive.current)onNavigate('/dashboard/office');
    }catch(e){if(alive.current && e.name!=='AbortError')setMessage(e.message);}
    finally{locked.current=false;if(alive.current)setBusy(false);}
  }
  async function refresh(signal) {const data=await demoRequest('',undefined,signal);if(alive.current)setState(data);}
  useEffect(()=>{alive.current=true;const abort=new AbortController();controller.current=abort;
    refresh(abort.signal).catch(e=>{if(!abort.signal.aborted)setState({error:e.message,login:e.status===401});});
    return()=>{alive.current=false;abort.abort();};},[]);
  async function act(path,body={}) {
    if(locked.current)return;locked.current=true;setBusy(true);setMessage('');
    try {
      const result=await demoRequest(path,body,controller.current.signal);
      if(!alive.current)return;
      if(result.activated){onNavigate('/dashboard/office');return;}
      setCode('');setMessage(result.sent?'Pesan dikirim ke WhatsApp terdaftar. Periksa pesan terbaru; jangan bagikan kode Anda.':'Nomor berhasil diverifikasi.');
      await refresh(controller.current.signal);
    }catch(e){if(alive.current && e.name!=='AbortError'){
      setMessage(e.message);await refresh(controller.current.signal).catch(()=>{});
    }}finally{locked.current=false;if(alive.current)setBusy(false);}
  }
  const activation=state.stage==='activation';
  const field='mt-2 block w-full rounded-xl border border-[var(--auth-line)] bg-[var(--auth-bg2)] px-4 py-3 text-sm outline-none focus:border-[#3b63e0]';
  const button='rounded-xl bg-[#3b63e0] px-5 py-3 text-sm font-bold text-white disabled:opacity-50';
  return <main className={`auth-page${dark?' dark':''} min-h-screen px-6 py-12`}>
    <div className="auth-atmosphere" aria-hidden="true"><span className="auth-orb auth-orb-blue"/><span className="auth-orb auth-orb-purple"/><span className="auth-orb auth-orb-pink"/></div>
    <div className="relative mx-auto max-w-xl">
      <header className="mb-8 flex items-center justify-between"><a href="/" className="inline-flex items-center gap-2 text-xl font-extrabold"><span className="h-8 w-8"><BrandMark/></span>Karyora</a><button type="button" onClick={()=>{setDark(!dark);try{saveTheme(!dark,localStorage);}catch{}}} className="text-sm">{dark?'Mode terang':'Mode gelap'}</button></header>
      <section className="auth-card rounded-3xl border border-[var(--auth-line)] bg-[var(--auth-surface)] p-8">
        <p className="text-xs font-bold tracking-widest text-[var(--auth-accent)]">KANTOR DEMO PRIBADI</p>
        <h1 className="mt-3 text-3xl font-extrabold">Buka kantor AI pertamamu.</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--auth-muted)]">6 divisi beserta agen bawaan · saldo AI Rp3.000 · 3 hari sejak aktivasi. Pilih model dari katalog aktif. Model dengan tarif lebih tinggi menghabiskan saldo lebih cepat. Tidak perlu kartu pembayaran.</p>
        <ol className="my-6 flex gap-3 text-xs text-[var(--auth-muted)]" aria-label="Tahapan demo"><li>1. Daftar</li><li>2. OTP WhatsApp</li><li>3. Kode aktivasi</li></ol>
        {state.loading?<p role="status">Memeriksa akses demo…</p>:state.error?<div><p role="alert">{state.error}</p>{state.login && <div className="mt-5 flex gap-3"><a className={button} href="/register?demo=1">Daftar untuk demo</a><a className={button} href="/login?demo=1">Masuk</a></div>}</div>:state.stage==='activated'?<div><h2 className="font-bold">{state.active?'Demo sudah aktif':'Masa demo sudah berakhir'}</h2><p className="my-3 text-sm">Jatah demo tidak diperbarui melalui kirim ulang kode. Riwayat tetap tersimpan; penggunaan AI mengikuti saldo dan masa aktif.</p><button className={button} disabled={busy} onClick={openOffice}>Buka kantor</button><a className="ml-4 text-sm underline" href="/dashboard/billing">Lihat paket</a></div>:<>
          <h2 className="font-bold">{activation?'Aktifkan demo Anda':'Verifikasi nomor WhatsApp'}</h2>
          <p className="my-3 text-sm leading-6 text-[var(--auth-muted)]">{activation?'Setelah OTP benar, kode aktivasi dikirim ke WhatsApp yang sama. Kode berlaku 24 jam dan hanya dapat digunakan sekali.':'Kirim OTP ke nomor terdaftar. OTP berlaku 5 menit, maksimal 5 percobaan.'} {state.phone}</p>
          <button type="button" className={button} disabled={busy} onClick={()=>act(activation?'/activation-code':'/otp')}>{busy?'Memproses…':activation?'Kirim ulang kode aktivasi':'Kirim / kirim ulang OTP'}</button>
          <form className="mt-6 grid gap-4" onSubmit={e=>{e.preventDefault();act(activation?'/activate':'/verify',{code});}}>
            <label className="text-sm font-semibold">{activation?'Kode aktivasi dari WhatsApp':'Kode OTP dari WhatsApp'}<input className={field} autoComplete="one-time-code" inputMode={activation?'text':'numeric'} maxLength={activation?40:6} placeholder={activation?'KRY-DEMO-…':'6 digit OTP'} required value={code} onChange={e=>setCode(e.target.value)} disabled={busy}/></label>
            <button className={button} disabled={busy || !code.trim()}>{busy?'Memproses…':activation?'Aktifkan demo':'Verifikasi & kirim kode aktivasi'}</button>
          </form>
          <p className="mt-4 text-xs leading-6 text-[var(--auth-muted)]">Jeda kirim ulang minimal 60 detik, maksimal 10 pengiriman per 24 jam. Demo khusus akun tanpa workspace; satu klaim per akun dan nomor WA.</p>
        </>}
        {message && <p className="mt-5 text-sm leading-6" role="status">{message}</p>}
      </section>
    </div>
  </main>;
}
