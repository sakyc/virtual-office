import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ClientsPage, WorkersPage } from './workspace-pages.jsx';
import { DashboardPage, LandingPage, OnboardingPage } from './design-pages.jsx';
import './shell.css';
import { AuthPage } from './auth-pages.jsx';
import { SessionBoundary } from './session-boundary.jsx';
import { OfficePage } from './office-page.jsx';

const pages = { '/app': 'Dashboard', '/app/workers': 'Workers', '/app/jobs': 'Jobs', '/app/settings': 'Settings' };
const go = (path, { replace = false } = {}) => { history[replace ? 'replaceState' : 'pushState']({}, '', path); dispatchEvent(new PopStateEvent('popstate')); };

function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => { const update = () => setPath(location.pathname); addEventListener('popstate', update); return () => removeEventListener('popstate', update); }, []);
  let page;
  if (path === '/') page = <LandingPage onNavigate={go} />;
  else if (path === '/login' || path === '/register' || path === '/login/complete') page = <AuthPage key={path} register={path === '/register'} complete={path === '/login/complete'} onNavigate={go} />;
  else if (path === '/onboarding') page = <OnboardingPage onNavigate={go} />;
  else if (path === '/app/office') page = <OfficePage onNavigate={go} />;
  else if (path === '/app') page = <DashboardPage onNavigate={go} />;
  else if (path === '/app/workers') page = <WorkersPage onNavigate={go} />;
  else if (path === '/app/clients') page = <ClientsPage onNavigate={go} />;
  else if (path === '/app/board') page = <DashboardPage section="board" onNavigate={go} />;
  else if (path === '/app/jobs') page = <DashboardPage section="jobs" onNavigate={go} />;
  else if (path === '/app/team') page = <DashboardPage section="team" onNavigate={go} />;
  else if (path === '/app/settings') page = <DashboardPage section="settings" onNavigate={go} />;
  else if (path === '/app/reference') page = <ReferencePage title="Virtual Office dashboard reference" src="/dashboard-reference/Dashboard.dc.html" />;
  else page = <div className="workspace"><aside><strong>Virtual Office</strong>{Object.entries(pages).map(([href, label]) => <button className={path === href ? 'active' : ''} onClick={() => go(href)} key={href}>{label}</button>)}<button onClick={() => go('/app/office')}>Kantor</button></aside><main><p>WORKSPACE</p><h1>{pages[path] || 'Halaman belum tersedia'}</h1><span>Kerangka React siap. Desain halaman belum dimulai.</span></main></div>;
  return path === '/onboarding' || path === '/app' || path.startsWith('/app/')
    ? <SessionBoundary path={path} onNavigate={go}>{page}</SessionBoundary> : page;
}

function ReferencePage({ title, src }) {
  return <iframe className="landing-reference" title={title} src={src} />;
}

createRoot(document.getElementById('root')).render(<App />);
