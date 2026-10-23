import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ClientsPage, SettingsPage, WorkersPage } from './workspace-pages.jsx';
import { DashboardPage, LandingPage, OnboardingPage } from './design-pages.jsx';
import './shell.css';

const pages = { '/app': 'Dashboard', '/app/workers': 'Workers', '/app/jobs': 'Jobs', '/app/settings': 'Settings' };
const go = (path) => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate')); };

function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => { const update = () => setPath(location.pathname); addEventListener('popstate', update); return () => removeEventListener('popstate', update); }, []);
  let page;
  if (path === '/') page = <LandingPage onNavigate={go} />;
  else if (path === '/onboarding') page = <OnboardingPage onNavigate={go} />;
  else if (path === '/app/office') page = <OfficePage onNavigate={go} />;
  else if (path === '/app') page = <DashboardPage onNavigate={go} />;
  else if (path === '/app/workers') page = <WorkersPage onNavigate={go} />;
  else if (path === '/app/clients') page = <ClientsPage onNavigate={go} />;
  else if (path === '/app/board') page = <DashboardPage section="board" onNavigate={go} />;
  else if (path === '/app/jobs') page = <DashboardPage section="jobs" onNavigate={go} />;
  else if (path === '/app/settings') page = <SettingsPage onNavigate={go} />;
  else if (path === '/app/reference') page = <ReferencePage title="Virtual Office dashboard reference" src="/dashboard-reference/Dashboard.dc.html" />;
  else page = <div className="workspace"><aside><strong>Virtual Office</strong>{Object.entries(pages).map(([href, label]) => <button className={path === href ? 'active' : ''} onClick={() => go(href)} key={href}>{label}</button>)}<button onClick={() => go('/app/office')}>Kantor</button></aside><main><p>WORKSPACE</p><h1>{pages[path] || 'Halaman belum tersedia'}</h1><span>Kerangka React siap. Desain halaman belum dimulai.</span></main></div>;
  return page;
}

function ReferencePage({ title, src }) {
  return <iframe className="landing-reference" title={title} src={src} />;
}

function OfficePage({ onNavigate }) {
  const [frame, setFrame] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const publish = async () => {
      const response = await fetch('/api/dashboard/workers', { credentials: 'same-origin' });
      if (!response.ok || cancelled) return;
      const body = await response.json();
      if (Array.isArray(body?.workers)) frame?.contentWindow?.postMessage({ type: 'virtual-office:worker-loads', workers: body.workers }, window.location.origin);
    };
    void publish();
    const interval = setInterval(publish, 20_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [frame]);
  return <div className="office"><button onClick={() => onNavigate('/app')}>← Dashboard</button><iframe ref={setFrame} title="Virtual Office 3D" src="/office.html" /></div>;
}

createRoot(document.getElementById('root')).render(<App />);
