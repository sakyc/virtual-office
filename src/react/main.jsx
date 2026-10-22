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
  else if (path === '/onboarding') page = <ReferencePage title="Virtual Office onboarding" src="/onboarding-reference/Onboarding.dc.html" />;
  else if (path === '/app/office') page = <div className="office"><button onClick={() => go('/app')}>← Dashboard</button><iframe title="Virtual Office 3D" src="/office.html" /></div>;
  else if (path === '/app') page = <ReferencePage title="Virtual Office dashboard" src="/dashboard-reference/Dashboard.dc.html" />;
  else page = <div className="workspace"><aside><strong>Virtual Office</strong>{Object.entries(pages).map(([href, label]) => <button className={path === href ? 'active' : ''} onClick={() => go(href)} key={href}>{label}</button>)}<button onClick={() => go('/app/office')}>Kantor</button></aside><main><p>WORKSPACE</p><h1>{pages[path] || 'Halaman belum tersedia'}</h1><span>Kerangka React siap. Desain halaman belum dimulai.</span></main></div>;
  return <>{page}{loading && <div className="app-splash"><div><i>V</i><b>virtual office</b><span></span></div></div>}</>;
}

function Landing() {
  return <iframe className="landing-reference" title="Virtual Office landing page" src="/landing-reference/Main.dc.html" />;
}

function ReferencePage({ title, src }) {
  return <iframe className="landing-reference" title={title} src={src} />;
}

function Dashboard() {
  return <div className="dash"><aside className="dash-nav"><div className="dash-brand"><i>V</i><span>virtual office</span></div><p className="nav-label">WORKSPACE</p><nav><button className="selected">Overview</button><button onClick={() => go('/app/office')}>Office <b>↗</b></button><button onClick={() => go('/app/workers')}>Workers <em>04</em></button><button onClick={() => go('/app/jobs')}>Jobs</button></nav><div className="nav-bottom"><button onClick={() => go('/app/settings')}>Settings</button><div className="profile"><b>AS</b><span>Angga Saputra<small>Owner · Studio Garis</small></span></div></div></aside><main className="dash-main"><header><div><p className="eyebrow">TUESDAY, 21 OCTOBER</p><h1>Good morning,<br/><em>Angga.</em></h1></div><div className="header-actions"><button className="ghost">⌘ &nbsp; Search</button><button className="new">+ &nbsp; New task</button></div></header><section className="overview"><article className="hero-card"><p>WORKSPACE PULSE <i></i> LIVE</p><h2>A calm day<br/>for <em>great work.</em></h2><span>12 tasks are moving through your office right now.</span><div className="orbit"><b>12</b><small>in motion</small></div></article><div className="metrics"><Metric value="86%" label="Tasks on track" trend="+12%"/><Metric value="24h" label="Avg. response time" trend="−18%"/><Metric value="04" label="Workers online" trend="All ready"/></div></section><section className="dash-grid"><div className="panel"><div className="section-head"><div><p className="eyebrow">IN MOTION</p><h2>Priority work</h2></div><button>See all work ↗</button></div><Task tag="STRATEGY" name="Q4 launch narrative" owner="Nara · Strategist" progress="72"/><Task tag="CONTENT" name="Founder story: first draft" owner="Rina · Writer" progress="48"/><Task tag="DESIGN" name="Homepage visual system" owner="Dio · Designer" progress="86"/></div><div className="panel activity"><div className="section-head"><div><p className="eyebrow">LIVE FEED</p><h2>Recent activity</h2></div></div><Event name="Dio completed" text="Homepage visual system" time="8 min"/><Event name="Rina started" text="Founder story: first draft" time="21 min"/><Event name="Nara shared" text="Q4 launch narrative" time="1 hr"/><button className="office-link" onClick={() => go('/app/office')}>Step into your office <span>↗</span></button></div></section></main></div>;
}
function Metric({ value, label, trend }) { return <article className="metric"><div><strong>{value}</strong><span>{trend}</span></div><p>{label}</p></article>; }
function Task({ tag, name, owner, progress }) { return <div className="task"><div className="task-top"><span>{tag}</span><b>{progress}%</b></div><strong>{name}</strong><small>{owner}</small><div className="progress"><i style={{ width: `${progress}%` }} /></div></div>; }
function Event({ name, text, time }) { return <div className="event"><i></i><p><b>{name}</b><br/>{text}</p><time>{time}</time></div>; }
createRoot(document.getElementById('root')).render(<App />);
