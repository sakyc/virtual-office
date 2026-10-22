import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './shell.css';

const pages = { '/app': 'Dashboard', '/app/workers': 'Workers', '/app/jobs': 'Jobs', '/app/settings': 'Settings' };
const go = (path) => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate')); };

function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => { const update = () => setPath(location.pathname); addEventListener('popstate', update); return () => removeEventListener('popstate', update); }, []);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const timer = setTimeout(() => setLoading(false), 1100); return () => clearTimeout(timer); }, []);
  let page;
  if (path === '/') page = <Landing />;
  else if (path === '/onboarding') page = <Onboarding />;
  else if (path === '/app/office') page = <div className="office"><button onClick={() => go('/app')}>← Dashboard</button><iframe title="Virtual Office 3D" src="/office.html" /></div>;
  else if (path === '/app') page = <Dashboard />;
  else if (path === '/app/reference') page = <ReferencePage title="Virtual Office dashboard reference" src="/dashboard-reference/Dashboard.dc.html" />;
  else page = <div className="workspace"><aside><strong>Virtual Office</strong>{Object.entries(pages).map(([href, label]) => <button className={path === href ? 'active' : ''} onClick={() => go(href)} key={href}>{label}</button>)}<button onClick={() => go('/app/office')}>Kantor</button></aside><main><p>WORKSPACE</p><h1>{pages[path] || 'Halaman belum tersedia'}</h1><span>Kerangka React siap. Desain halaman belum dimulai.</span></main></div>;
  return <>{page}{loading && <div className="app-splash"><div><i>V</i><b>virtual office</b><span></span></div></div>}</>;
}

function Landing() {
  return <iframe className="landing-reference" title="Virtual Office landing page" src="/landing-reference/Main.dc.html" />;
}

function ReferencePage({ title, src }) {
  return <iframe className="landing-reference" title={title} src={src} />;
}

const onboardingSteps = [
  ['Organisasi', 'Nama dan ukuran tim'],
  ['Workspace', 'Ruang kerja dan klien pertama'],
  ['Divisi awal', 'Tempat Anda mulai'],
];
const divisions = [
  ['proposal', 'Proposal Writer', '#4f7cff'], ['ads', 'Ads Copywriter', '#ff8a3d'],
  ['social', 'Social Media', '#ff5fa2'], ['qa', 'Web QA', '#2fbf71'],
  ['dev', 'Developer Helper', '#8a5cf6'], ['reporting', 'Reporting', '#14b8a6'],
  ['account', 'Account Manager', '#f5b82e'], ['finance', 'Finance', '#64748b'],
];

function Onboarding() {
  const [step, setStep] = useState(1);
  const [dark, setDark] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [teamSize, setTeamSize] = useState(0);
  const [chosenDivisions, setChosenDivisions] = useState(['proposal', 'social']);
  const [form, setForm] = useState({ organization: '', workspace: '', client: '', brief: '' });
  const [submitState, setSubmitState] = useState({ busy: false, error: '' });
  const replaySplash = () => { setShowSplash(true); window.setTimeout(() => setShowSplash(false), 2200); };
  useEffect(() => { const timer = window.setTimeout(() => setShowSplash(false), 2200); return () => clearTimeout(timer); }, []);
  const updateForm = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const toggleDivision = (id) => setChosenDivisions((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const finish = async () => {
    setSubmitState({ busy: true, error: '' });
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationName: form.organization, workspaceName: form.workspace, clientName: form.client, clientBrief: form.brief, teamSize: ['1-5', '6-20', '21-50', '50+'][teamSize] }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Onboarding belum dapat diselesaikan.');
      go('/app');
    } catch (error) { setSubmitState({ busy: false, error: error.message }); }
  };
  const inputClass = 'mt-2 w-full rounded-xl border border-[#dedbd1] bg-[#f7f6f1] px-4 py-3 text-[15px] outline-none transition placeholder:text-[#a6a298] focus:border-[#4f7cff] focus:ring-2 focus:ring-[#dce7ff]';
  return <div className={dark ? 'min-h-screen bg-[#1f211f] text-[#f4f1e8]' : 'min-h-screen bg-[#f0eee6] text-[#292821]'}>
    {showSplash && <OnboardingSplash />}
    <div className="flex min-h-screen flex-wrap">
      <aside className={dark ? 'flex min-h-[500px] max-w-[520px] flex-[1_1_380px] flex-col gap-12 border-r border-white/10 bg-[#292b29] px-8 py-10 md:px-12' : 'flex min-h-[500px] max-w-[520px] flex-[1_1_380px] flex-col gap-12 border-r border-[#ddd9ce] bg-[#fbfaf7] px-8 py-10 md:px-12'}>
        <button onClick={() => go('/')} className="flex w-fit items-center gap-2 text-lg font-extrabold tracking-[-.03em]"><i className="grid h-8 w-8 place-content-center rounded-[9px] bg-[#4f7cff] text-sm not-italic text-white">V</i>Virtual Office</button>
        <div><h1 className="text-[32px] font-extrabold leading-tight tracking-[-.04em]">Siapkan kantor virtual Anda.</h1><p className={dark ? 'mt-3 text-base leading-7 text-[#b8b6ad]' : 'mt-3 text-base leading-7 text-[#747169]'}>Tiga langkah singkat. Anda bisa mengubah semuanya nanti di dashboard.</p></div>
        <ol className="grid gap-1.5">{onboardingSteps.map(([title, sub], index) => { const number = index + 1; const current = step === number; const done = step > number; return <li key={title} className={current ? 'flex items-center gap-3 rounded-[14px] bg-[#e7efff] p-3.5' : 'flex items-center gap-3 rounded-[14px] p-3.5'}><span className={done || current ? 'grid h-[34px] w-[34px] place-content-center rounded-full border-2 border-[#4f7cff] bg-[#4f7cff] text-sm font-extrabold text-white' : 'grid h-[34px] w-[34px] place-content-center rounded-full border-2 border-[#d8d5ca] text-sm font-extrabold text-[#a19e94]'}>{done ? '✓' : number}</span><span><b className={current || done ? 'block text-[15px]' : 'block text-[15px] text-[#969389]'}>{title}</b><small className="block text-[13px] text-[#99968c]">{sub}</small></span></li>; })}</ol>
        <div className="mt-auto flex flex-wrap gap-2"><button onClick={replaySplash} className={dark ? 'rounded-xl border border-white/15 px-3 py-2 text-[13px] font-bold text-[#d8d6cf]' : 'rounded-xl border border-[#d8d5ca] px-3 py-2 text-[13px] font-bold text-[#68655d]'}>↻ Putar ulang splash</button><button onClick={() => setDark(!dark)} className={dark ? 'rounded-xl border border-white/15 px-3 py-2 text-[13px] font-bold text-[#d8d6cf]' : 'rounded-xl border border-[#d8d5ca] px-3 py-2 text-[13px] font-bold text-[#68655d]'}>{dark ? '☀ Mode terang' : '◐ Mode gelap'}</button></div>
      </aside>
      <main className="relative flex min-w-0 flex-[999_1_520px] items-center justify-center overflow-hidden px-6 py-12 md:px-8"><i className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-[#4f7cff]/15 blur-3xl"></i><i className="absolute -bottom-16 -right-16 h-80 w-80 rounded-full bg-[#ff9cc4]/20 blur-3xl"></i><section className={dark ? 'relative z-10 w-full max-w-[620px] rounded-3xl border border-white/10 bg-[#292b29] p-7 shadow-2xl md:p-10' : 'relative z-10 w-full max-w-[620px] rounded-3xl border border-[#dedbd1] bg-[#fbfaf7] p-7 shadow-[0_20px_70px_rgba(55,50,38,.12)] md:p-10'}><p className="text-[13px] font-extrabold uppercase tracking-[.06em] text-[#4167d9]">Langkah {step} dari 3</p>
        {step === 1 && <div><h2 className="mt-2 text-[26px] font-extrabold tracking-[-.035em]">Ceritakan tentang organisasi Anda</h2><p className={dark ? 'mt-2 leading-6 text-[#b8b6ad]' : 'mt-2 leading-6 text-[#747169]'}>Organisasi adalah wadah untuk anggota, workspace, dan paket langganan.</p><label className="mt-7 block text-sm font-bold">Nama organisasi<input value={form.organization} onChange={updateForm('organization')} className={inputClass} placeholder="mis. Studio Kreatif Nusantara" /></label><p className="mt-6 text-sm font-bold">Ukuran tim</p><div className="mt-2 grid grid-cols-2 gap-2">{['1–5 orang', '6–20 orang', '21–50 orang', '50+ orang'].map((label, index) => <button key={label} onClick={() => setTeamSize(index)} className={teamSize === index ? 'rounded-xl border-2 border-[#4f7cff] bg-[#e7efff] p-3 text-sm font-bold text-[#3159cc]' : 'rounded-xl border-2 border-[#dedbd1] p-3 text-sm font-bold'}>{label}</button>)}</div></div>}
        {step === 2 && <div><h2 className="mt-2 text-[26px] font-extrabold tracking-[-.035em]">Buat workspace pertama</h2><p className={dark ? 'mt-2 leading-6 text-[#b8b6ad]' : 'mt-2 leading-6 text-[#747169]'}>Workspace memisahkan pekerjaan, misalnya per tim atau per klien.</p><label className="mt-7 block text-sm font-bold">Nama workspace<input value={form.workspace} onChange={updateForm('workspace')} className={inputClass} placeholder="mis. Tim Kreatif" /></label><label className="mt-5 block text-sm font-bold">Klien pertama <span className="font-semibold text-[#a19e94]">(opsional)</span><input value={form.client} onChange={updateForm('client')} className={inputClass} placeholder="Nama klien" /></label><label className="mt-5 block text-sm font-bold">Brief klien <span className="font-semibold text-[#a19e94]">(opsional)</span><textarea value={form.brief} onChange={updateForm('brief')} className={inputClass} rows="4" placeholder="Brand voice, produk, dan target audiens" /></label></div>}
        {step === 3 && <div><h2 className="mt-2 text-[26px] font-extrabold tracking-[-.035em]">Pilih divisi untuk dimulai</h2><p className={dark ? 'mt-2 leading-6 text-[#b8b6ad]' : 'mt-2 leading-6 text-[#747169]'}>Semua divisi tetap ada di kantor. Pilihan ini hanya menentukan tempat Anda mulai.</p><div className="mt-7 grid gap-2 sm:grid-cols-2">{divisions.map(([id, name, color]) => { const selected = chosenDivisions.includes(id); return <button key={id} onClick={() => toggleDivision(id)} className={selected ? 'flex items-center gap-3 rounded-xl border-2 border-[#4f7cff] bg-[#e7efff] p-3.5 text-left text-sm font-bold' : 'flex items-center gap-3 rounded-xl border-2 border-[#dedbd1] p-3.5 text-left text-sm font-bold'}><i className="h-3 w-3 rounded" style={{ background: color }}></i><span className="flex-1">{name}</span>{selected && <b className="text-[#3159cc]">✓</b>}</button>; })}</div></div>}
        {submitState.error && <p className="mt-5 rounded-xl bg-[#fff0ef] p-3 text-sm font-semibold text-[#a53d35]">{submitState.error}</p>}
        <div className="mt-9 flex items-center gap-3">{step > 1 && <button onClick={() => setStep(step - 1)} className="rounded-xl border border-[#d8d5ca] px-5 py-3.5 text-[15px] font-bold">Kembali</button>}{step < 3 ? <button onClick={() => setStep(step + 1)} className="ml-auto rounded-xl bg-[#4f7cff] px-7 py-3.5 text-[15px] font-bold text-white">Lanjut</button> : <button disabled={submitState.busy} onClick={finish} className="ml-auto rounded-xl bg-[#4f7cff] px-7 py-3.5 text-[15px] font-bold text-white disabled:cursor-wait disabled:opacity-60">{submitState.busy ? 'Menyiapkan…' : 'Buka kantor'}</button>}</div>
      </section></main>
    </div>
  </div>;
}

function OnboardingSplash() {
  return <div className="fixed inset-0 z-[1000] grid place-content-center bg-[#f0eee6]"><div className="grid justify-items-center gap-4"><div className="grid grid-cols-3 gap-1">{['#4f7cff','#ff8a3d','#ff5fa2','#2fbf71','#8a5cf6','#14b8a6','#f5b82e','#64748b','#d8d5ca'].map((color, index) => <i key={index} className="h-7 w-7 animate-pulse rounded-[7px]" style={{ background: color, animationDelay: `${index * 80}ms` }} />)}</div><b className="text-lg tracking-[-.04em]"><span className="mr-2 rounded-lg bg-[#4f7cff] px-2 py-1 text-white">V</span>Virtual Office</b><span className="text-sm text-[#77746b]">Menyiapkan kantor…</span><i className="h-1 w-20 overflow-hidden rounded bg-[#d8d5ca]"><b className="block h-full w-1/2 animate-pulse bg-[#4f7cff]"></b></i></div></div>;
}

function Dashboard() {
  return <div className="dash"><aside className="dash-nav"><div className="dash-brand"><i>V</i><span>virtual office</span></div><p className="nav-label">WORKSPACE</p><nav><button className="selected">Overview</button><button onClick={() => go('/app/office')}>Office <b>↗</b></button><button onClick={() => go('/app/workers')}>Workers <em>04</em></button><button onClick={() => go('/app/jobs')}>Jobs</button></nav><div className="nav-bottom"><button onClick={() => go('/app/settings')}>Settings</button><div className="profile"><b>AS</b><span>Angga Saputra<small>Owner · Studio Garis</small></span></div></div></aside><main className="dash-main"><header><div><p className="eyebrow">TUESDAY, 21 OCTOBER</p><h1>Good morning,<br/><em>Angga.</em></h1></div><div className="header-actions"><button className="ghost">⌘ &nbsp; Search</button><button className="new">+ &nbsp; New task</button></div></header><section className="overview"><article className="hero-card"><p>WORKSPACE PULSE <i></i> LIVE</p><h2>A calm day<br/>for <em>great work.</em></h2><span>12 tasks are moving through your office right now.</span><div className="orbit"><b>12</b><small>in motion</small></div></article><div className="metrics"><Metric value="86%" label="Tasks on track" trend="+12%"/><Metric value="24h" label="Avg. response time" trend="−18%"/><Metric value="04" label="Workers online" trend="All ready"/></div></section><section className="dash-grid"><div className="panel"><div className="section-head"><div><p className="eyebrow">IN MOTION</p><h2>Priority work</h2></div><button>See all work ↗</button></div><Task tag="STRATEGY" name="Q4 launch narrative" owner="Nara · Strategist" progress="72"/><Task tag="CONTENT" name="Founder story: first draft" owner="Rina · Writer" progress="48"/><Task tag="DESIGN" name="Homepage visual system" owner="Dio · Designer" progress="86"/></div><div className="panel activity"><div className="section-head"><div><p className="eyebrow">LIVE FEED</p><h2>Recent activity</h2></div></div><Event name="Dio completed" text="Homepage visual system" time="8 min"/><Event name="Rina started" text="Founder story: first draft" time="21 min"/><Event name="Nara shared" text="Q4 launch narrative" time="1 hr"/><button className="office-link" onClick={() => go('/app/office')}>Step into your office <span>↗</span></button></div></section></main></div>;
}
function Metric({ value, label, trend }) { return <article className="metric"><div><strong>{value}</strong><span>{trend}</span></div><p>{label}</p></article>; }
function Task({ tag, name, owner, progress }) { return <div className="task"><div className="task-top"><span>{tag}</span><b>{progress}%</b></div><strong>{name}</strong><small>{owner}</small><div className="progress"><i style={{ width: `${progress}%` }} /></div></div>; }
function Event({ name, text, time }) { return <div className="event"><i></i><p><b>{name}</b><br/>{text}</p><time>{time}</time></div>; }
createRoot(document.getElementById('root')).render(<App />);
