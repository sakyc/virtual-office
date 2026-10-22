import React, { useEffect, useState } from 'react';
import { JOBS } from '../../shared/jobs.js';

const navItems = [['Overview', '/app', '⌂'], ['Office', '/app/office', '◫'], ['Workers', '/app/workers', '◌'], ['Jobs', '/app/jobs', '✓']];
const people = [
  ['Nara Putri', 'Strategist', 'Planning campaign & research', '#8b5cf6', 'Online'],
  ['Rina Ayu', 'Content Writer', 'Drafting founder story', '#ef5da8', 'Working'],
  ['Dio Pratama', 'Designer', 'Finishing visual system', '#34a4e8', 'Review'],
  ['Maya Kurnia', 'Account Manager', 'Preparing client update', '#e39b3a', 'Online'],
];
const starterJobs = [
  ['Q4 launch narrative', 'Strategy', 'Nara Putri', 'In progress', 72],
  ['Founder story: first draft', 'Content', 'Rina Ayu', 'In progress', 48],
  ['Homepage visual system', 'Design', 'Dio Pratama', 'Review', 86],
  ['October performance recap', 'Reporting', 'Maya Kurnia', 'Queued', 0],
];

function Shell({ title, eyebrow, active, onNavigate, children, action }) {
  return <div className="min-h-screen bg-[#f6f8fb] font-sans text-[#141a29]"><div className="flex min-h-screen flex-col md:flex-row"><aside className="flex w-full shrink-0 flex-col border-b border-[#e4e8f0] bg-white p-4 md:min-h-screen md:w-[272px] md:border-r md:border-b-0 md:p-5"><button onClick={() => onNavigate('/app')} className="flex items-center gap-2 px-2 py-1 text-left text-[17px] font-extrabold tracking-[-.05em]"><span className="grid h-8 w-8 place-content-center rounded-[9px] bg-[#3b63e0] text-[14px] text-white">V</span>Virtual Office</button><div className="mt-6 flex items-center gap-3 rounded-xl border border-[#e4e8f0] p-2.5"><span className="grid h-8 w-8 place-content-center rounded-lg bg-[#eaf0ff] text-xs font-extrabold text-[#3b63e0]">WC</span><span className="min-w-0 flex-1"><b className="block truncate text-sm">Workspace Contoh</b><small className="block truncate text-xs text-[#667085]">Organisasi Contoh</small></span><span className="text-[#667085]">⌄</span></div><nav className="mt-7 flex gap-1 overflow-x-auto md:flex-col">{navItems.map(([label, path, icon]) => <button key={path} onClick={() => onNavigate(path)} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold ${active === label ? 'bg-[#eaf0ff] text-[#3159cc]' : 'text-[#667085] hover:bg-[#eef2f8]'}`}><span className="w-4 text-center">{icon}</span>{label}{label === 'Workers' && <span className="ml-auto rounded-full bg-[#3b63e0] px-2 py-0.5 text-[10px] text-white">04</span>}</button>)}</nav><div className="mt-4 md:mt-auto"><button onClick={() => onNavigate('/app/settings')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${active === 'Settings' ? 'bg-[#eaf0ff] text-[#3159cc]' : 'text-[#667085] hover:bg-[#eef2f8]'}`}>Settings</button><div className="mt-3 flex items-center gap-3 border-t border-[#e4e8f0] px-2 pt-4"><span className="grid h-9 w-9 place-content-center rounded-full bg-[#dcebcf] text-xs font-extrabold text-[#35543b]">AS</span><span><b className="block text-xs">Angga Saputra</b><small className="text-xs text-[#667085]">Owner · Studio Garis</small></span></div></div></aside><main className="mx-auto w-full max-w-[1440px] p-5 sm:p-8 lg:p-11"><header className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="text-[11px] font-extrabold tracking-[.12em] text-[#667085]">{eyebrow}</p><h1 className="mt-2 font-serif text-4xl leading-none tracking-[-.07em] sm:text-5xl">{title}</h1></div>{action}</header>{children}</main></div></div>;
}

export function WorkersPage({ onNavigate }) {
  const [filter, setFilter] = useState('All');
  const visible = filter === 'All' ? people : people.filter(([, role]) => role.includes(filter));
  return <Shell active="Workers" onNavigate={onNavigate} eyebrow="YOUR DIGITAL TEAM" title="Workers" action={<button className="rounded-xl bg-[#3b63e0] px-4 py-2.5 text-sm font-bold text-white">+ Invite member</button>}><section className="rounded-2xl border border-[#c8daf3] bg-[#eaf2ff] p-6 sm:flex sm:items-center sm:justify-between"><div><p className="text-[11px] font-extrabold tracking-[.12em] text-[#3b63e0]">TEAM PULSE</p><h2 className="mt-2 font-serif text-3xl tracking-[-.05em]">Four people keeping work in motion.</h2><p className="mt-2 text-sm text-[#4e6381]">Assign jobs and follow their latest activity from one place.</p></div><div className="mt-5 grid h-24 w-24 place-content-center rounded-full bg-[#3b63e0] text-center text-white sm:mt-0"><b className="text-3xl">04</b><small className="text-[10px]">active workers</small></div></section><div className="mt-6 flex flex-wrap gap-2">{['All', 'Strategist', 'Content Writer', 'Designer', 'Account Manager'].map((option) => <button onClick={() => setFilter(option)} key={option} className={`rounded-full border px-3 py-2 text-xs font-bold ${filter === option ? 'border-[#3b63e0] bg-[#3b63e0] text-white' : 'border-[#e4e8f0] bg-white text-[#667085]'}`}>{option}</button>)}</div><section className="mt-4 grid gap-4 lg:grid-cols-2">{visible.map(([name, role, work, color, state]) => <article key={name} className="rounded-2xl border border-[#e4e8f0] bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-lg"><div className="flex items-start justify-between"><span className="grid h-12 w-12 place-content-center rounded-2xl text-sm font-extrabold text-white" style={{ background: color }}>{name.split(' ').map((part) => part[0]).join('')}</span><span className="rounded-full bg-[#e9f6ea] px-2.5 py-1 text-[10px] font-bold text-[#28753d]">● {state}</span></div><h2 className="mt-5 text-lg font-extrabold tracking-[-.04em]">{name}</h2><p className="mt-1 text-sm font-semibold text-[#3b63e0]">{role}</p><div className="mt-5 rounded-xl bg-[#f6f8fb] p-3"><p className="text-[10px] font-extrabold tracking-[.1em] text-[#98a2b3]">CURRENT FOCUS</p><p className="mt-1 text-sm text-[#475467]">{work}</p></div></article>)}</section></Shell>;
}

export function JobsPage({ onNavigate }) {
  const [jobs, setJobs] = useState(starterJobs);
  const [usingLiveJobs, setUsingLiveJobs] = useState(false);
  const [filter, setFilter] = useState('All');
  const [showComposer, setShowComposer] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState(JOBS[0].id);
  const [params, setParams] = useState(() => defaultParams(JOBS[0]));
  const [submitState, setSubmitState] = useState({ busy: false, error: '' });
  const [clients, setClients] = useState([]);
  const [items, setItems] = useState([]);
  const refreshJobs = async () => {
    const response = await fetch('/api/dashboard/jobs', { credentials: 'same-origin' });
    if (!response.ok) return false;
    const body = await response.json();
    if (!Array.isArray(body?.jobs)) return false;
    setJobs(body.jobs.map((job) => [job.clientName ? `${job.jobType} · ${job.clientName}` : job.jobType, job.jobType, job.agentId || 'Unassigned', job.status, job.status === 'done' ? 100 : job.status === 'generating' ? 50 : 0]));
    setUsingLiveJobs(true);
    return true;
  };
  useEffect(() => { void refreshJobs(); }, []);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/dashboard/clients', { credentials: 'same-origin' })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (!cancelled && Array.isArray(body?.clients)) setClients(body.clients); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!showComposer) return undefined;
    let cancelled = false;
    fetch('/api/dashboard/items', { credentials: 'same-origin' })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (!cancelled && Array.isArray(body?.items)) setItems(body.items); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [showComposer]);
  const selectedDefinition = JOBS.find((job) => job.id === selectedJobId) || JOBS[0];
  const visible = filter === 'All' ? jobs : jobs.filter(([, , , status]) => status === filter);
  const chooseJobType = (event) => { const definition = JOBS.find((job) => job.id === event.target.value) || JOBS[0]; setSelectedJobId(definition.id); setParams(defaultParams(definition)); setSubmitState({ busy: false, error: '' }); };
  const submitJob = async (event) => {
    event.preventDefault(); setSubmitState({ busy: true, error: '' });
    try {
      const response = await fetch('/api/dashboard/jobs', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobType: selectedDefinition.id, clientId: Number(params.clientId) || null, params }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Job tidak dapat dibuat.');
      await refreshJobs(); setShowComposer(false);
    } catch (error) { setSubmitState({ busy: false, error: error.message }); }
  };
  const statusOptions = usingLiveJobs ? ['All', 'generating', 'done', 'failed'] : ['All', 'In progress', 'Review', 'Queued'];
  return <Shell active="Jobs" onNavigate={onNavigate} eyebrow="WORK IN MOTION" title="Jobs" action={<button onClick={() => setShowComposer(true)} className="rounded-xl bg-[#3b63e0] px-4 py-2.5 text-sm font-bold text-white">+ New job</button>}><section className="grid gap-4 sm:grid-cols-3"><Stat value={String(jobs.length).padStart(2, '0')} label="Total jobs"/><Stat value={String(jobs.filter(([, , , status]) => status === (usingLiveJobs ? 'generating' : 'In progress')).length).padStart(2, '0')} label="In progress"/><Stat value={String(jobs.filter(([, , , status]) => status === (usingLiveJobs ? 'done' : 'Review')).length).padStart(2, '0')} label="Completed"/></section>{usingLiveJobs && <p className="mt-5 rounded-xl border border-[#c8daf3] bg-[#eef5ff] px-4 py-3 text-xs leading-5 text-[#3d5d8a]">Data ini hanya memuat job yang dimiliki workspace aktif.</p>}<div className="mt-7 flex flex-wrap gap-2">{statusOptions.map((option) => <button onClick={() => setFilter(option)} key={option} className={`rounded-full border px-3 py-2 text-xs font-bold ${filter === option ? 'border-[#3b63e0] bg-[#3b63e0] text-white' : 'border-[#e4e8f0] bg-white text-[#667085]'}`}>{option}</button>)}</div><section className="mt-4 overflow-hidden rounded-2xl border border-[#e4e8f0] bg-white"><div className="hidden grid-cols-[minmax(0,2fr)_1fr_1fr_110px] gap-5 border-b border-[#e4e8f0] px-6 py-4 text-[10px] font-extrabold tracking-[.1em] text-[#98a2b3] md:grid"><span>JOB</span><span>ASSIGNEE</span><span>STATUS</span><span>PROGRESS</span></div>{visible.length ? visible.map(([job, team, assignee, status, progress]) => <article key={job} className="grid gap-3 border-b border-[#edf0f4] px-5 py-5 last:border-0 md:grid-cols-[minmax(0,2fr)_1fr_1fr_110px] md:items-center md:gap-5 md:px-6"><div><b className="block text-sm">{job}</b><small className="mt-1 block text-xs text-[#667085]">{team}</small></div><p className="text-sm text-[#475467]">{assignee}</p><span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-bold ${status === 'failed' || status === 'Review' ? 'bg-[#fff0d5] text-[#925e08]' : status === 'Queued' ? 'bg-[#f0f2f5] text-[#667085]' : 'bg-[#e8f5e9] text-[#28753d]'}`}>{status}</span><div><b className="text-xs text-[#3b63e0]">{progress}%</b><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e9edf3]"><i className="block h-full rounded-full bg-[#3b63e0]" style={{ width: `${progress}%` }} /></div></div></article>) : <p className="px-6 py-10 text-sm text-[#667085]">Belum ada job dengan ownership pada workspace ini.</p>}</section>{showComposer && <TenantJobComposer clients={clients} items={items} definition={selectedDefinition} selectedJobId={selectedJobId} params={params} setParams={setParams} chooseJobType={chooseJobType} submitState={submitState} onCancel={() => setShowComposer(false)} onSubmit={submitJob}/>}</Shell>;
}

function defaultParams(definition) {
  return Object.fromEntries(definition.fields.map((field) => [field.name, field.type === 'multi' ? field.default || [] : field.default ?? (field.type === 'number' ? field.min || 1 : '')]));
}

function TenantJobComposer({ clients, items, definition, selectedJobId, params, setParams, chooseJobType, submitState, onCancel, onSubmit }) {
  const setValue = (name, value) => setParams((current) => ({ ...current, [name]: value }));
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#101827]/45 p-4" onMouseDown={onCancel}><form onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()} className="mx-auto my-8 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"><p className="text-[11px] font-extrabold tracking-[.12em] text-[#667085]">NEW TENANT JOB</p><h2 className="mt-1 font-serif text-3xl tracking-[-.05em]">Mulai pekerjaan baru</h2><label className="mt-5 block text-sm font-bold">Jenis pekerjaan<select value={selectedJobId} onChange={chooseJobType} className="mt-2 w-full rounded-xl border border-[#dce1e9] bg-[#f8fafc] px-4 py-3 outline-none">{JOBS.map((job) => <option key={job.id} value={job.id}>{job.label}</option>)}</select></label><p className="mt-2 text-sm leading-5 text-[#667085]">{definition.desc}</p><label className="mt-5 block text-sm font-bold">Client <span className="font-normal text-[#667085]">(opsional)</span><select value={params.clientId || ''} onChange={(event) => setValue('clientId', event.target.value)} className="mt-2 w-full rounded-xl border border-[#dce1e9] bg-[#f8fafc] px-4 py-3 outline-none"><option value="">Tanpa client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><div className="mt-6 grid gap-4 sm:grid-cols-2">{definition.fields.map((field) => <JobField key={field.name} field={field} items={items} value={params[field.name]} setValue={setValue}/>)}</div>{submitState.error && <p className="mt-5 rounded-xl bg-[#fff0ef] p-3 text-sm font-semibold text-[#a53d35]">{submitState.error}</p>}<div className="mt-7 flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 text-sm font-bold text-[#667085]">Batal</button><button disabled={submitState.busy} className="rounded-xl bg-[#3b63e0] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{submitState.busy ? 'Memulai…' : 'Buat job'}</button></div></form></div>;
}

function JobField({ field, items, value, setValue }) {
  const base = 'mt-2 w-full rounded-xl border border-[#dce1e9] bg-[#f8fafc] px-4 py-3 outline-none';
  const label = <span className="text-sm font-bold">{field.label}{field.required && <b className="ml-1 text-[#b54740]">*</b>}</span>;
  if (field.type === 'textarea') return <label className="block sm:col-span-2">{label}<textarea value={value || ''} onChange={(event) => setValue(field.name, event.target.value)} className={base} rows="4" placeholder={field.placeholder}/></label>;
  if (field.type === 'select') return <label className="block">{label}<select value={value || ''} onChange={(event) => setValue(field.name, event.target.value)} className={base}>{field.options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  if (field.type === 'multi') return <fieldset className="block sm:col-span-2">{label}<div className="mt-2 flex flex-wrap gap-2">{field.options.map((option) => { const checked = Array.isArray(value) && value.includes(option); return <button type="button" onClick={() => setValue(field.name, checked ? value.filter((item) => item !== option) : [...(value || []), option])} className={`rounded-full border px-3 py-2 text-xs font-bold ${checked ? 'border-[#3b63e0] bg-[#eaf0ff] text-[#3159cc]' : 'border-[#dce1e9] text-[#667085]'}`} key={option}>{option}</button>; })}</div></fieldset>;
  if (field.type === 'item') { const candidates = items.filter((item) => item.type === field.itemType); return <label className="block">{label}<select value={value || ''} onChange={(event) => setValue(field.name, event.target.value)} className={base}><option value="">Pilih item {field.itemType} (opsional)</option>{candidates.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>; }
  const type = field.type === 'number' ? 'number' : field.type === 'month' ? 'month' : 'text';
  return <label className="block">{label}<input type={type} min={field.min} max={field.max} value={value ?? ''} onChange={(event) => setValue(field.name, event.target.value)} className={base} placeholder={field.placeholder || (field.type === 'item' ? 'ID item dari board (opsional)' : undefined)}/></label>;
}

export function SettingsPage({ onNavigate }) {
  const [notifications, setNotifications] = useState(true);
  const [digest, setDigest] = useState(false);
  return <Shell active="Settings" onNavigate={onNavigate} eyebrow="WORKSPACE PREFERENCES" title="Settings"><section className="grid gap-4 lg:grid-cols-[1fr_.8fr]"><div className="rounded-2xl border border-[#e4e8f0] bg-white p-6"><h2 className="font-serif text-2xl tracking-[-.05em]">Workspace profile</h2><p className="mt-1 text-sm text-[#667085]">Atur informasi yang terlihat oleh anggota workspace.</p><label className="mt-6 block text-sm font-bold">Workspace name<input defaultValue="Workspace Contoh" className="mt-2 w-full rounded-xl border border-[#dce1e9] bg-[#f8fafc] px-4 py-3 outline-none"/></label><label className="mt-5 block text-sm font-bold">Timezone<select defaultValue="Asia/Jakarta" className="mt-2 w-full rounded-xl border border-[#dce1e9] bg-[#f8fafc] px-4 py-3 outline-none"><option>Asia/Jakarta</option><option>Asia/Singapore</option><option>UTC</option></select></label><button className="mt-6 rounded-xl bg-[#3b63e0] px-4 py-2.5 text-sm font-bold text-white">Save changes</button></div><div className="rounded-2xl border border-[#e4e8f0] bg-white p-6"><h2 className="font-serif text-2xl tracking-[-.05em]">Notifications</h2><p className="mt-1 text-sm text-[#667085]">Kontrol cara Anda mengikuti pekerjaan tim.</p><Toggle label="Activity notifications" description="Notifikasi ketika pekerjaan berubah status." enabled={notifications} onToggle={() => setNotifications(!notifications)}/><Toggle label="Daily digest" description="Ringkasan aktivitas setiap pagi." enabled={digest} onToggle={() => setDigest(!digest)}/></div></section><section className="mt-4 rounded-2xl border border-[#f2d1cf] bg-[#fff7f6] p-6"><p className="text-[11px] font-extrabold tracking-[.12em] text-[#b54740]">DANGER ZONE</p><h2 className="mt-1 font-serif text-2xl tracking-[-.05em]">Leave this workspace</h2><p className="mt-2 text-sm text-[#8d514c]">Aksi ini tidak dijalankan dari prototipe antarmuka.</p><button className="mt-4 rounded-xl border border-[#e8aaa5] bg-white px-4 py-2.5 text-sm font-bold text-[#b54740]">Leave workspace</button></section></Shell>;
}

function Stat({ value, label }) { return <article className="rounded-2xl border border-[#e4e8f0] bg-white p-5"><b className="font-serif text-4xl tracking-[-.07em]">{value}</b><p className="mt-5 text-sm text-[#667085]">{label}</p></article>; }
function Toggle({ label, description, enabled, onToggle }) { return <button onClick={onToggle} className="mt-6 flex w-full items-center gap-3 text-left"><span className={`relative h-6 w-11 shrink-0 rounded-full transition ${enabled ? 'bg-[#3b63e0]' : 'bg-[#d0d5dd]'}`}><i className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${enabled ? 'left-6' : 'left-1'}`}/></span><span><b className="block text-sm">{label}</b><small className="mt-1 block text-xs leading-5 text-[#667085]">{description}</small></span></button>; }
