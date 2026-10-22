import React, { useEffect, useMemo, useState } from 'react';

const initialTasks = [
  { id: 1, tag: 'STRATEGY', name: 'Q4 launch narrative', owner: 'Nara · Strategist', progress: 72, color: 'bg-violet-500' },
  { id: 2, tag: 'CONTENT', name: 'Founder story: first draft', owner: 'Rina · Writer', progress: 48, color: 'bg-rose-500' },
  { id: 3, tag: 'DESIGN', name: 'Homepage visual system', owner: 'Dio · Designer', progress: 86, color: 'bg-sky-500' },
];

const navigation = [
  ['Overview', '⌂'], ['Office', '◫'], ['Workers', '◌'], ['Jobs', '✓'],
];

export function NativeDashboard({ onNavigate }) {
  const [dark, setDark] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [tasks, setTasks] = useState(initialTasks);
  const [query, setQuery] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [active, setActive] = useState('Overview');
  const [profile, setProfile] = useState(null);
  const [workspaceSwitching, setWorkspaceSwitching] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // The server determines both the principal and allowed workspaces from the opaque session cookie.
    fetch('/auth/me', { credentials: 'same-origin' })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (!cancelled) setProfile(body); })
      .catch(() => { if (!cancelled) setProfile(null); });
    return () => { cancelled = true; };
  }, []);
  const filteredTasks = useMemo(() => tasks.filter((task) => task.name.toLowerCase().includes(query.toLowerCase())), [tasks, query]);
  const userName = profile?.user?.displayName || 'Angga Saputra';
  const firstName = userName.split(/\s+/)[0] || 'there';
  const activeWorkspace = profile?.activeWorkspace;
  const workspaceName = activeWorkspace?.name || 'Workspace Contoh';
  const organizationName = activeWorkspace?.organization?.name || 'Organisasi Contoh';
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'VO';
  const theme = dark ? 'bg-[#10131b] text-[#eef1f8]' : 'bg-[#f6f8fb] text-[#141a29]';
  const surface = dark ? 'border-[#283448] bg-[#151c28]' : 'border-[#e4e8f0] bg-white';
  const muted = dark ? 'text-[#aab5c8]' : 'text-[#667085]';
  const navigate = (label) => {
    setActive(label);
    if (label === 'Office') onNavigate('/app/office');
    else if (label === 'Workers') onNavigate('/app/workers');
    else if (label === 'Jobs') onNavigate('/app/jobs');
  };
  const createTask = (event) => {
    event.preventDefault();
    const name = taskTitle.trim();
    if (!name) return;
    setTasks((items) => [...items, { id: Date.now(), tag: 'NEW', name, owner: 'You · Owner', progress: 0, color: 'bg-[#3b63e0]' }]);
    setTaskTitle('');
    setComposerOpen(false);
  };
  const chooseWorkspace = async (workspace) => {
    if (!profile || workspace.id === activeWorkspace?.id || workspaceSwitching) { setWorkspaceOpen(false); return; }
    setWorkspaceSwitching(true);
    try {
      const response = await fetch('/auth/active-workspace', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId: workspace.id }),
      });
      if (response.ok) setProfile(await response.json());
    } finally { setWorkspaceSwitching(false); setWorkspaceOpen(false); }
  };
  return <div className={`min-h-screen font-["Plus_Jakarta_Sans",system-ui,sans-serif] ${theme}`}>
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className={`flex w-full shrink-0 flex-col border-b p-4 md:min-h-screen md:w-[272px] md:border-r md:border-b-0 md:p-5 ${surface}`}>
        <div className="flex items-center gap-2 px-2 py-1 text-[17px] font-extrabold tracking-[-.05em]"><span className="grid h-8 w-8 place-content-center rounded-[9px] bg-[#3b63e0] text-[14px] text-white">V</span>Virtual Office</div>
        <div className="relative mt-6">
          <button onClick={() => setWorkspaceOpen(!workspaceOpen)} className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left ${surface}`} aria-expanded={workspaceOpen}>
            <span className="grid h-8 w-8 place-content-center rounded-lg bg-[#eaf0ff] text-xs font-extrabold text-[#3b63e0]">{workspaceName.slice(0, 2).toUpperCase()}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{workspaceName}</b><small className={`block truncate text-xs ${muted}`}>{organizationName}</small></span><span className={muted}>⌄</span>
          </button>
          {workspaceOpen && <div className={`absolute z-20 mt-2 w-full rounded-xl border p-1 shadow-xl ${surface}`}>{(profile?.workspaces?.length ? profile.workspaces : [{ name: workspaceName, organization: { name: organizationName }, id: 'demo' }]).map((workspace) => <button key={workspace.id} onClick={() => chooseWorkspace(workspace)} disabled={workspaceSwitching} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-[#eaf0ff] disabled:opacity-60"><span className="min-w-0"><span className="block truncate">{workspace.name}</span><small className={`block truncate font-normal ${muted}`}>{workspace.organization.name}</small></span>{workspace.id === activeWorkspace?.id && <span className="text-[#3b63e0]">✓</span>}</button>)}{profile && <p className={`px-3 py-2 text-[11px] leading-4 ${muted}`}>{workspaceSwitching ? 'Mengganti workspace…' : 'Workspace divalidasi server sebelum sesi diperbarui.'}</p>}</div>}
        </div>
        <nav className="mt-7 flex gap-1 overflow-x-auto md:flex-col" aria-label="Navigasi workspace">
          {navigation.map(([label, icon]) => <button key={label} onClick={() => navigate(label)} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${active === label ? 'bg-[#eaf0ff] text-[#3159cc]' : `${muted} hover:bg-[#eef2f8]`}`}><span className="w-4 text-center">{icon}</span>{label}{label === 'Workers' && <span className="ml-auto rounded-full bg-[#3b63e0] px-2 py-0.5 text-[10px] text-white">04</span>}</button>)}
        </nav>
        <div className="mt-4 flex gap-2 md:mt-auto md:pt-6"><button onClick={() => onNavigate('/app/settings')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${muted} hover:bg-[#eef2f8]`}>Settings</button><button onClick={() => setDark(!dark)} className={`ml-auto rounded-lg border px-3 py-2 text-sm ${surface}`} aria-label="Ubah tema">{dark ? '☀' : '◐'}</button></div>
        <div className={`mt-4 flex items-center gap-3 border-t pt-4 ${dark ? 'border-[#283448]' : 'border-[#e4e8f0]'}`}><span className="grid h-9 w-9 place-content-center rounded-full bg-[#dcebcf] text-xs font-extrabold text-[#35543b]">{initials}</span><span><b className="block text-xs">{userName}</b><small className={muted}>{activeWorkspace?.role || 'Owner'} · {organizationName}</small></span></div>
      </aside>
      <main className="mx-auto w-full max-w-[1440px] p-5 sm:p-8 lg:p-11">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-5"><div><p className={`text-[11px] font-extrabold tracking-[.12em] ${muted}`}>TUESDAY, 21 OCTOBER</p><h1 className="mt-2 font-serif text-4xl leading-[.88] tracking-[-.07em] sm:text-6xl">Good morning,<br/><em className="text-[#5f8a5c]">{firstName}.</em></h1></div><div className="flex gap-2"><button onClick={() => setSearchOpen(true)} className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${surface} ${muted}`}>⌘ &nbsp; Search</button><button onClick={() => setComposerOpen(true)} className="rounded-xl bg-[#3b63e0] px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_20px_-10px_#3b63e0]">+ &nbsp; New task</button></div></header>
        <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]"><article className="relative min-h-[252px] overflow-hidden rounded-2xl border border-[#c7dcbf] bg-[#dfeeda] p-7"><p className="text-[11px] font-extrabold tracking-[.12em] text-[#4b794c]">WORKSPACE PULSE <i className="mx-1 inline-block h-1.5 w-1.5 rounded-full bg-[#4b9b57]"></i> LIVE</p><h2 className="mt-6 font-serif text-4xl leading-[.9] tracking-[-.06em]">A calm day<br/>for <em className="text-[#63875f]">great work.</em></h2><p className="mt-4 max-w-[260px] text-sm leading-6 text-[#557052]">{tasks.length + 9} tasks are moving through your office right now.</p><div className="absolute -bottom-8 right-3 grid h-36 w-36 place-content-center rounded-full bg-[#2c593d] text-center text-white shadow-[0_0_0_20px_#c6dfbe,0_0_0_40px_#edf5e9]"><b className="text-3xl">{tasks.length + 9}</b><small className="text-[10px]">in motion</small></div></article><div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1"><Metric dark={dark} value="86%" label="Tasks on track" trend="+12%"/><Metric dark={dark} value="24h" label="Avg. response time" trend="−18%"/><Metric dark={dark} value="04" label="Workers online" trend="All ready"/></div></section>
        <section className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]"><div className={`rounded-2xl border p-6 ${surface}`}><div className="mb-4 flex items-start justify-between"><div><p className={`text-[11px] font-extrabold tracking-[.12em] ${muted}`}>IN MOTION</p><h2 className="mt-1 font-serif text-2xl tracking-[-.05em]">Priority work</h2></div><button onClick={() => setSearchOpen(true)} className="text-sm font-bold text-[#3b63e0]">See all work ↗</button></div>{tasks.map((task) => <Task key={task.id} task={task} dark={dark}/>)}</div><div className={`rounded-2xl border p-6 ${surface}`}><p className={`text-[11px] font-extrabold tracking-[.12em] ${muted}`}>LIVE FEED</p><h2 className="mt-1 font-serif text-2xl tracking-[-.05em]">Recent activity</h2><Activity dark={dark} name="Dio completed" text="Homepage visual system" time="8 min"/><Activity dark={dark} name="Rina started" text="Founder story: first draft" time="21 min"/><Activity dark={dark} name="Nara shared" text="Q4 launch narrative" time="1 hr"/><button onClick={() => onNavigate('/app/office')} className={`mt-5 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-bold ${dark ? 'border-[#344258] bg-[#192231]' : 'border-[#dce1e9] bg-[#f8fafc]'}`}>Step into your office <span>↗</span></button></div></section>
      </main>
    </div>
    {searchOpen && <div className="fixed inset-0 z-50 grid place-items-start bg-[#101827]/45 p-4 pt-[12vh]" onMouseDown={() => setSearchOpen(false)}><section className={`w-full max-w-xl rounded-2xl border p-3 shadow-2xl ${surface}`} onMouseDown={(event) => event.stopPropagation()}><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className={`w-full rounded-xl border px-4 py-3 outline-none ${dark ? 'border-[#344258] bg-[#101722]' : 'border-[#dce1e9] bg-[#f8fafc]'}`} placeholder="Cari tugas…"/><div className="mt-2 max-h-60 overflow-auto">{filteredTasks.map((task) => <button key={task.id} onClick={() => setSearchOpen(false)} className={`block w-full rounded-lg px-4 py-3 text-left hover:bg-[#eaf0ff] ${muted}`}><b className={`block ${dark ? 'text-white' : 'text-[#141a29]'}`}>{task.name}</b><small>{task.owner}</small></button>)}{!filteredTasks.length && <p className={`p-4 text-sm ${muted}`}>Tidak ada tugas yang cocok.</p>}</div></section></div>}
    {composerOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-[#101827]/45 p-4" onMouseDown={() => setComposerOpen(false)}><form onSubmit={createTask} onMouseDown={(event) => event.stopPropagation()} className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${surface}`}><p className={`text-[11px] font-extrabold tracking-[.12em] ${muted}`}>NEW TASK</p><h2 className="mt-1 font-serif text-3xl tracking-[-.05em]">Mulai pekerjaan baru</h2><label className={`mt-5 block text-sm font-bold ${muted}`}>Judul tugas<input autoFocus value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} className={`mt-2 w-full rounded-xl border px-4 py-3 outline-none ${dark ? 'border-[#344258] bg-[#101722]' : 'border-[#dce1e9] bg-[#f8fafc]'}`} placeholder="Contoh: Audit campaign minggu ini"/></label><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setComposerOpen(false)} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${muted}`}>Batal</button><button className="rounded-xl bg-[#3b63e0] px-4 py-2.5 text-sm font-bold text-white">Buat tugas</button></div></form></div>}
  </div>;
}

function Metric({ value, label, trend, dark }) { return <article className={`flex min-h-[112px] flex-col justify-between rounded-2xl border p-5 ${dark ? 'border-[#283448] bg-[#151c28]' : 'border-[#e4e8f0] bg-white'}`}><div className="flex items-start justify-between"><b className="font-serif text-3xl tracking-[-.06em]">{value}</b><span className="rounded-md bg-[#e4f4e5] px-2 py-1 text-[10px] font-bold text-[#397044]">{trend}</span></div><p className={dark ? 'text-xs text-[#aab5c8]' : 'text-xs text-[#667085]'}>{label}</p></article>; }
function Task({ task, dark }) { return <article className={`border-t py-4 ${dark ? 'border-[#283448]' : 'border-[#edf0f4]'}`}><div className="flex items-center justify-between"><span className={`rounded-md px-2 py-1 text-[10px] font-extrabold tracking-[.08em] ${dark ? 'bg-[#202b3c] text-[#b4c1d6]' : 'bg-[#f0f3f7] text-[#667085]'}`}>{task.tag}</span><b className="text-xs text-[#3b63e0]">{task.progress}%</b></div><b className="mt-3 block text-sm">{task.name}</b><small className={dark ? 'mt-1 block text-xs text-[#aab5c8]' : 'mt-1 block text-xs text-[#667085]'}>{task.owner}</small><div className={`mt-3 h-1.5 overflow-hidden rounded-full ${dark ? 'bg-[#283448]' : 'bg-[#e9edf3]'}`}><i className={`block h-full rounded-full ${task.color}`} style={{ width: `${task.progress}%` }} /></div></article>; }
function Activity({ name, text, time, dark }) { return <article className={`flex gap-3 border-t py-4 ${dark ? 'border-[#283448]' : 'border-[#edf0f4]'}`}><i className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#5fa36a]"/><p className={`flex-1 text-xs leading-5 ${dark ? 'text-[#aab5c8]' : 'text-[#667085]'}`}><b className={dark ? 'text-white' : 'text-[#141a29]'}>{name}</b><br/>{text}</p><time className={dark ? 'text-[10px] text-[#8290a6]' : 'text-[10px] text-[#98a2b3]'}>{time}</time></article>; }
