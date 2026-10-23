import React, { useEffect, useState } from 'react';
import { destinationForProfile, loadAuthProfile } from './auth-flow.js';

function Brand() {
  return <a href="/" className="inline-flex items-center gap-2.5 text-lg font-extrabold tracking-tight"><span className="grid h-8 w-8 place-items-center rounded-[9px] bg-[#4f7cff]" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 32 32"><rect x="5" y="6" width="22" height="15" rx="3" fill="white"/><rect x="11" y="24" width="10" height="3" rx="1.5" fill="white"/></svg></span>Virtual Office</a>;
}

export function AuthPage({ register = false, complete = false, onNavigate }) {
  const [state, setState] = useState({ loading: true, enabled: false, profile: null, error: '' });
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, enabled: false, profile: null, error: '' });
    const load = async () => {
      try {
        const response = await fetch('/auth/status', { signal: controller.signal, credentials: 'same-origin' });
        if (!response.ok) throw new Error('Layanan masuk belum tersedia. Coba lagi sebentar.');
        const status = await response.json();
        if (typeof status.enabled !== 'boolean') throw new Error('Layanan masuk belum tersedia. Coba lagi sebentar.');
        if (!status.enabled) {
          setState({ loading: false, enabled: false, profile: null, error: 'Login belum tersedia. Silakan coba lagi setelah layanan diaktifkan.' }); return;
        }
        const profile = await loadAuthProfile(controller.signal);
        if (controller.signal.aborted) return;
        if (profile) {
          const destination = destinationForProfile(profile);
          if (destination) { onNavigate(destination); return; }
        } else if (complete) { onNavigate('/login'); return; }
        setState({ loading: false, enabled: true, profile, error: '' });
      } catch (error) {
        if (!controller.signal.aborted) setState({ loading: false, enabled: false, profile: null, error: error.message === 'Profil sesi tidak valid.' ? error.message : 'Layanan masuk belum tersedia. Coba lagi sebentar.' });
      }
    };
    void load();
    return () => controller.abort();
  }, [complete, onNavigate, retry]);
  const select = async (workspaceId) => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch('/auth/active-workspace', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId }) });
      if (response.status === 401) { onNavigate('/login'); return; }
      if (!response.ok) throw new Error();
      const profile = await response.json();
      if (destinationForProfile(profile) !== '/app') throw new Error();
      onNavigate('/app');
    } catch { setState((value) => ({ ...value, error: 'Workspace tidak dapat dibuka. Muat ulang lalu coba lagi.' })); }
    finally { setBusy(false); }
  };
  const choosing = Boolean(state.profile);
  return <div className="min-h-screen bg-[#f6f8fc] text-[#141a29]" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
    <header className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-6"><Brand/><a href="/" className="text-sm font-semibold text-[#4b5568] hover:text-[#3b63e0]">← Beranda</a></header>
    <main className="mx-auto grid max-w-[1100px] items-center gap-12 px-6 py-12 lg:grid-cols-2 lg:py-20">
      <section><p className="text-xs font-extrabold tracking-[.15em] text-[#3b63e0]">KANTOR DIGITAL, TIM NYATA.</p><h1 className="mt-5 text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl">Satu tempat untuk<br/><span className="bg-gradient-to-r from-[#3b63e0] via-[#8a5cf6] to-[#e0568f] bg-clip-text text-transparent">ide besar timmu.</span></h1><p className="mt-6 max-w-md text-base leading-7 text-[#4b5568]">Bekerja bersama tim AI, kelola perintah, dan tinjau hasilnya di kantor virtual kamu.</p><div className="mt-8 flex gap-2" aria-hidden="true">{['#4f7cff', '#ff8a3d', '#ff5fa2', '#2fbf71', '#8a5cf6', '#14b8a6'].map((color) => <span key={color} className="h-9 w-9 rounded-xl" style={{ background: color }}/>)}</div></section>
      <section className="rounded-3xl border border-[#e4e8f0] bg-white p-7 shadow-[0_24px_60px_-24px_rgba(30,45,80,0.28)] sm:p-10" aria-labelledby="auth-title">
        <h2 id="auth-title" className="text-2xl font-extrabold tracking-tight">{choosing ? 'Pilih workspace' : register ? 'Mulai kantor virtualmu' : 'Selamat datang kembali'}</h2>
        <p className="mt-3 text-sm leading-6 text-[#667085]">{choosing ? 'Pilih ruang kerja untuk melanjutkan.' : register ? 'Buat akun untuk menyiapkan workspace dan tim kamu.' : 'Masuk untuk melanjutkan pekerjaan bersama tim kamu.'}</p>
        {state.loading && <p role="status" className="mt-8 text-sm text-[#667085]">Memeriksa sesi…</p>}
        {state.error && <p role="alert" className="mt-6 rounded-xl bg-[#fff4ed] p-4 text-sm leading-6 text-[#9a3412]">{state.error}</p>}
        {choosing ? <div className="mt-6 grid gap-3">{state.profile.workspaces.map((workspace) => <button key={workspace.id} disabled={busy} onClick={() => select(workspace.id)} className="rounded-xl border border-[#e4e8f0] p-4 text-left hover:border-[#3b63e0] focus-visible:outline-2 focus-visible:outline-[#3b63e0] disabled:opacity-50"><span className="block text-sm font-bold">{workspace.name}</span><span className="mt-1 block text-xs text-[#667085]">{workspace.organization?.name}</span></button>)}</div>
: !state.loading && <button disabled={!state.enabled || busy} onClick={() => { setBusy(true); window.location.assign(register ? '/auth/login?screen_hint=signup' : '/auth/login'); }} className="mt-7 w-full rounded-xl bg-gradient-to-br from-[#3b63e0] to-[#5a4de0] px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#3b63e0]/15 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3b63e0] disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Mengalihkan…' : register ? 'Daftar dengan Auth0' : 'Masuk dengan Auth0'}</button>}
        {state.error && <button onClick={() => setRetry((value) => value + 1)} className="mt-4 text-sm font-semibold text-[#3b63e0]">Coba lagi</button>}
        {!choosing && <><p className="mt-5 text-center text-xs leading-5 text-[#667085]">Email dan kata sandi diisi pada halaman aman Auth0.</p><p className="mt-8 border-t border-[#e4e8f0] pt-6 text-center text-sm text-[#4b5568]">{register ? 'Sudah punya akun?' : 'Belum punya akun?'} <a className="font-bold text-[#3b63e0]" href={register ? '/login' : '/register'}>{register ? 'Masuk' : 'Daftar sekarang'}</a></p></>}
      </section>
    </main>
  </div>;
}
