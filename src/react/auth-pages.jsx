import React, { useEffect, useState } from 'react';
import { BrandMark } from './brand.jsx';
import { preferredDark, saveTheme } from './theme-preference.js';
import './auth-appearance.css';
import { destinationForProfile, loadAuthProfile } from './auth-flow.js';
import { passwordRequirements, validateAuthFields } from '../../shared/auth-validation.js';

function Brand() {
  return <a href="/" className="inline-flex items-center gap-2.5 text-lg font-extrabold tracking-tight"><span className="grid h-8 w-8 place-items-center rounded-[9px] bg-[#4f7cff]" aria-hidden="true"><BrandMark /></span>Karyora</a>;
}

export function AuthPage({ register = false, complete = false, demo = false, scheduledDemo = false, onNavigate }) {
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    let storage; try { storage = window.localStorage; } catch {}
    return preferredDark({ storage, media: window.matchMedia?.bind(window) });
  });
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    try { saveTheme(next, window.localStorage); } catch {}
  };
  const [state, setState] = useState({ loading: true, enabled: false, profile: null, error: '' });
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [form, setForm] = useState({ email: '', password: '', displayName: '', whatsappNumber: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({});
  const errors = validateAuthFields(form, { register });
  const rules = passwordRequirements(form.password);
  const changeField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setTouched((current) => ({ ...current, [field]: true }));
  };
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
          if(scheduledDemo){onNavigate('/scheduled-demo');return;}
          if(demo){onNavigate('/demo');return;}
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
  }, [complete, demo, scheduledDemo, onNavigate, retry]);
  const select = async (workspaceId) => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch('/auth/active-workspace', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId }) });
      if (response.status === 401) { onNavigate('/login'); return; }
      if (!response.ok) throw new Error();
      const profile = await response.json();
      if (destinationForProfile(profile) !== '/dashboard') throw new Error();
      onNavigate('/dashboard');
    } catch { setState((value) => ({ ...value, error: 'Workspace tidak dapat dibuka. Muat ulang lalu coba lagi.' })); }
    finally { setBusy(false); }
  };
  const choosing = Boolean(state.profile);
  const submit = async (event) => {
    event.preventDefault();
    if (busy || !state.enabled) return;
    setTouched({ email: true, password: true, displayName: true, whatsappNumber: true });
    if (Object.keys(errors).length) {
      event.currentTarget.elements.namedItem(Object.keys(errors)[0])?.focus();
      return;
    }
    setShowPassword(false);
    setBusy(true); setState((value) => ({ ...value, error: '' }));
    try {
      const response = await fetch(register ? '/auth/register' : '/auth/login', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(register ? form : { email: form.email, password: form.password }),
      });
      if (!response.ok) {
        const message = response.status === 401 ? 'Email atau kata sandi salah.'
          : response.status === 429 ? 'Terlalu banyak percobaan. Tunggu 15 menit lalu coba lagi.'
          : response.status === 400 ? 'Data tidak dapat digunakan. Periksa isian atau coba masuk dengan akun yang sudah ada.'
          : 'Layanan autentikasi belum tersedia. Coba lagi sebentar.';
        throw new Error(message);
      }
      setForm({ email: '', password: '', displayName: '', whatsappNumber: '' });
      onNavigate(scheduledDemo?'/scheduled-demo':demo?'/demo':'/login/complete');
    } catch (error) {
      setState((value) => ({ ...value, error: error instanceof TypeError ? 'Tidak dapat menghubungi layanan. Coba lagi.' : error.message }));
    } finally { setBusy(false); }
  };
  const fieldStyle = 'mt-2 block w-full rounded-xl border border-[var(--auth-line)] bg-[var(--auth-bg2)] px-4 py-3 text-sm outline-none focus:border-[#3b63e0] focus:ring-2 focus:ring-[#3b63e0]/15';
  return <div className={`auth-page${dark ? ' dark' : ''}`} style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
    <div className="auth-atmosphere" aria-hidden="true"><i className="auth-orb auth-orb-blue"/><i className="auth-orb auth-orb-purple"/><i className="auth-orb auth-orb-pink"/></div>
    <header className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-6"><Brand/><div className="flex items-center gap-3"><button type="button" className="auth-theme-toggle" onClick={toggleTheme} aria-label={dark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'} aria-pressed={dark}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{dark ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></> : <path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>}</svg></button><a href="/" className="text-sm font-semibold text-[var(--auth-soft)] hover:text-[var(--auth-accent)]">← Beranda</a></div></header>
    <main className="mx-auto grid max-w-[1100px] items-center gap-12 px-6 py-12 lg:grid-cols-2 lg:py-20">
      <section><p className="text-xs font-extrabold tracking-[.15em] text-[var(--auth-accent)]">KANTOR DIGITAL, TIM NYATA.</p><h1 className="mt-5 text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl">Satu tempat untuk<br/><span className="bg-gradient-to-r from-[#3b63e0] via-[#8a5cf6] to-[#e0568f] bg-clip-text text-transparent">ide besar timmu.</span></h1><p className="mt-6 max-w-md text-base leading-7 text-[var(--auth-soft)]">Bekerja bersama tim AI, kelola perintah, dan tinjau hasilnya di kantor virtual kamu.</p><div className="mt-8 flex gap-2" aria-hidden="true">{['#4f7cff', '#ff8a3d', '#ff5fa2', '#2fbf71', '#8a5cf6', '#14b8a6'].map((color) => <span key={color} className="h-9 w-9 rounded-xl" style={{ background: color }}/>)}</div></section>
      <section className="auth-card rounded-3xl border border-[var(--auth-line)] bg-[var(--auth-surface)] p-7 sm:p-10" aria-labelledby="auth-title">
        <h2 id="auth-title" className="text-2xl font-extrabold tracking-tight">{choosing ? 'Pilih workspace' : register ? 'Mulai kantor virtualmu' : 'Selamat datang kembali'}</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--auth-muted)]">{choosing ? 'Pilih ruang kerja untuk melanjutkan.' : register ? 'Buat akun untuk menyiapkan workspace dan tim kamu.' : 'Masuk untuk melanjutkan pekerjaan bersama tim kamu.'}</p>
        {state.loading && <p role="status" className="mt-8 text-sm text-[var(--auth-muted)]">Memeriksa sesi…</p>}
        {state.error && <p role="alert" className="mt-6 rounded-xl bg-[var(--auth-alert-bg)] p-4 text-sm leading-6 text-[var(--auth-alert-ink)]">{state.error}</p>}
        {choosing ? <div className="mt-6 grid gap-3">{state.profile.workspaces.map((workspace) => <button key={workspace.id} disabled={busy} onClick={() => select(workspace.id)} className="rounded-xl border border-[var(--auth-line)] p-4 text-left hover:border-[#3b63e0] focus-visible:outline-2 focus-visible:outline-[#3b63e0] disabled:opacity-50"><span className="block text-sm font-bold">{workspace.name}</span><span className="mt-1 block text-xs text-[var(--auth-muted)]">{workspace.organization?.name}</span></button>)}</div>
          : !state.loading && <form noValidate onSubmit={submit} className="mt-6 grid gap-4">
            {register && <div><label htmlFor="auth-name" className="text-sm font-semibold">Nama lengkap</label><input id="auth-name" name="displayName" className={fieldStyle} required maxLength={150} autoComplete="name" value={form.displayName} onChange={(event) => changeField('displayName', event.target.value)} aria-invalid={Boolean(touched.displayName && errors.displayName)} aria-describedby={touched.displayName && errors.displayName ? 'name-error' : undefined}/>{touched.displayName && errors.displayName && <p id="name-error" className="mt-2 text-xs text-[var(--auth-error)]" role="status">{errors.displayName}</p>}</div>}
            <div><label htmlFor="auth-email" className="text-sm font-semibold">Email</label><input id="auth-email" name="email" className={`${fieldStyle} ${touched.email && errors.email ? 'border-[var(--auth-error)]' : ''}`} required type="email" inputMode="email" maxLength={254} autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="nama@domain.com" value={form.email} onChange={(event) => changeField('email', event.target.value)} onBlur={() => setTouched((current) => ({ ...current, email: true }))} aria-invalid={Boolean(touched.email && errors.email)} aria-describedby={touched.email && errors.email ? 'email-error' : undefined}/>{touched.email && errors.email && <p id="email-error" className="mt-2 text-xs text-[var(--auth-error)]" role="status">{errors.email}</p>}</div>
            {register && <div><label htmlFor="auth-whatsapp" className="text-sm font-semibold">Nomor WhatsApp</label><input id="auth-whatsapp" name="whatsappNumber" type="tel" inputMode="tel" autoComplete="tel" required maxLength={24} placeholder="081234567890" className={fieldStyle} value={form.whatsappNumber} onChange={e => changeField('whatsappNumber', e.target.value)} aria-invalid={Boolean(touched.whatsappNumber && errors.whatsappNumber)} aria-describedby="whatsapp-help whatsapp-error"/><p id="whatsapp-help" className="mt-2 text-xs leading-5 text-[var(--auth-muted)]">Untuk notifikasi tugas ke nomor Anda saat integrasi WhatsApp dan benefit paket tersedia. Nomor belum diverifikasi; pesan belum dikirim otomatis.</p>{touched.whatsappNumber && errors.whatsappNumber && <p id="whatsapp-error" className="mt-2 text-xs text-[var(--auth-error)]" role="status">{errors.whatsappNumber}</p>}</div>}
            <div><label htmlFor="auth-password" className="text-sm font-semibold">Kata sandi</label><div className="relative"><input id="auth-password" name="password" className={`${fieldStyle} pr-12`} required type={showPassword ? 'text' : 'password'} maxLength={256} autoComplete={register ? 'new-password' : 'current-password'} value={form.password} onChange={(event) => changeField('password', event.target.value)} aria-invalid={Boolean(touched.password && errors.password)} aria-describedby={[register && 'password-rules', touched.password && errors.password && 'password-error'].filter(Boolean).join(' ') || undefined}/><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} aria-pressed={showPassword} aria-controls="auth-password" className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-[var(--auth-muted)] hover:text-[var(--auth-accent)] focus-visible:outline-2 focus-visible:outline-[#3b63e0]"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{showPassword && <path d="m3 3 18 18"/>}</svg></button></div>{touched.password && errors.password && <p id="password-error" className="mt-2 text-xs text-[var(--auth-error)]" role="status">{errors.password}</p>}
              {register && <ul id="password-rules" aria-label="Persyaratan kata sandi" className="mt-3 grid gap-2 rounded-xl bg-[var(--auth-bg2)] p-3">{rules.map((rule) => <li key={rule.id} className={`flex items-start gap-2 text-xs leading-5 ${rule.passed ? 'text-[var(--auth-ok)]' : 'text-[var(--auth-muted)]'}`}><span aria-hidden="true" className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${rule.passed ? 'bg-[var(--auth-ok-bg)]' : 'border border-[var(--auth-ring)]'}`}>{rule.passed && <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 8 3 3 7-7"/></svg>}</span><span><span className="sr-only">{rule.passed ? 'Terpenuhi: ' : 'Belum terpenuhi: '}</span>{rule.label}</span></li>)}</ul>}
            </div>
            <button disabled={!state.enabled || busy} className="mt-2 w-full rounded-xl bg-gradient-to-br from-[#3b63e0] to-[#5a4de0] px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#3b63e0]/15 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#3b63e0] disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Memproses…' : register ? 'Buat akun' : 'Masuk'}</button>
          </form>}
        {state.error && <button onClick={() => setRetry((value) => value + 1)} className="mt-4 text-sm font-semibold text-[var(--auth-accent)]">Coba lagi</button>}
        {!choosing && <p className="mt-8 border-t border-[var(--auth-line)] pt-6 text-center text-sm text-[var(--auth-soft)]">{register ? 'Sudah punya akun?' : 'Belum punya akun?'} <a className="font-bold text-[var(--auth-accent)]" href={(register ? '/login' : '/register')+(scheduledDemo?'?visit=1':demo?'?demo=1':'')}>{register ? 'Masuk' : 'Daftar sekarang'}</a></p>}
      </section>
    </main>
  </div>;
}
