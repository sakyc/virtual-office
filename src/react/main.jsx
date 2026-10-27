import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardPage, LandingPage, OnboardingPage } from './design-pages.jsx';
import './shell.css';
import { AuthPage } from './auth-pages.jsx';
import { SessionBoundary } from './session-boundary.jsx';
import { OfficePage } from './office-page.jsx';
import { AdminBilling } from './admin-billing.jsx';
import { canonicalCustomerPath } from './customer-routes.js';
import { JoinWorkspace } from './tenant-members.jsx';
import { pageTitle } from './page-title.js';
import { dashboardLinkDestination } from './spa-navigation.js';

const pages = { '/dashboard': 'Dashboard', '/dashboard/workers': 'Workers', '/dashboard/jobs': 'Jobs', '/dashboard/settings': 'Settings' };
const go = (path, { replace = false } = {}) => { history[replace ? 'replaceState' : 'pushState']({}, '', canonicalCustomerPath(path)); dispatchEvent(new PopStateEvent('popstate')); };

function App() {
  const [path, setPath] = useState(() => canonicalCustomerPath(location.pathname));
  useEffect(() => { document.title = pageTitle(path); }, [path]);
  useEffect(() => {
    const navigateLink = event => {
      const target = dashboardLinkDestination(event, location);
      if (!target) return;
      event.preventDefault();
      if (target !== location.pathname + location.search + location.hash) go(target);
    };
    document.addEventListener('click', navigateLink);
    return () => document.removeEventListener('click', navigateLink);
  }, []);
  useEffect(() => {
    const update = () => {
      const canonical = canonicalCustomerPath(location.pathname);
      if (canonical !== location.pathname) history.replaceState(history.state, '', canonical + location.search + location.hash);
      setPath(canonical);
    };
    update();
    addEventListener('popstate', update);
    return () => removeEventListener('popstate', update);
  }, []);
  let page;
  if (path === '/') page = <LandingPage onNavigate={go} />;
  else if (path === '/join') page = <JoinWorkspace onNavigate={go}/>;
  else if (path === '/admin' || path === '/admin/billing' || path === '/admin/models' || path === '/admin/audit' || path === '/admin/users' || path === '/admin/organizations' || path === '/admin/subscriptions') page = <AdminBilling onNavigate={go} section={path === '/admin' ? 'overview' : path.split('/')[2]}/>;
  else if (path === '/login' || path === '/register' || path === '/login/complete') page = <AuthPage key={path} register={path === '/register'} complete={path === '/login/complete'} onNavigate={go} />;
  else if (path === '/onboarding') page = <OnboardingPage onNavigate={go} />;
  else if (path === '/dashboard/office') page = <OfficePage onNavigate={go} />;
  else if (path === '/dashboard') page = <DashboardPage onNavigate={go} />;
  else if (path === '/dashboard/workers') page = <DashboardPage section="team" onNavigate={go} />;
  else if (path === '/dashboard/clients') page = <DashboardPage section="clients" onNavigate={go} />;
  else if (path === '/dashboard/members') page = <DashboardPage section="members" onNavigate={go} />;
  else if (path === '/dashboard/board') page = <DashboardPage section="board" onNavigate={go} />;
  else if (path === '/dashboard/jobs') page = <DashboardPage section="jobs" onNavigate={go} />;
  else if (path === '/dashboard/team') page = <DashboardPage section="team" onNavigate={go} />;
  else if (path === '/dashboard/templates') page = <DashboardPage section="templates" onNavigate={go} />;
  else if (path === '/dashboard/settings') page = <DashboardPage section="settings" onNavigate={go} />;
  else if (path === '/dashboard/billing') page = <DashboardPage section="billing" onNavigate={go} />;
  else if (path === '/dashboard/usage') page = <DashboardPage section="usage" onNavigate={go} />;
  else if (path === '/dashboard/models') page = <DashboardPage section="models" onNavigate={go} />;
  else if (path === '/dashboard/reference') page = <ReferencePage title="Karyora dashboard reference" src="/dashboard-reference/Dashboard.dc.html" />;
  else page = <div className="workspace"><aside><strong>Karyora</strong>{Object.entries(pages).map(([href, label]) => <button className={path === href ? 'active' : ''} onClick={() => go(href)} key={href}>{label}</button>)}<button onClick={() => go('/dashboard/office')}>Kantor</button></aside><main><p>WORKSPACE</p><h1>{pages[path] || 'Halaman belum tersedia'}</h1><span>Kerangka React siap. Desain halaman belum dimulai.</span></main></div>;
  return path === '/onboarding' || path === '/dashboard' || path.startsWith('/dashboard/')
    ? <SessionBoundary path={path} onNavigate={go} preserveShell={page.type === DashboardPage}>{page}</SessionBoundary> : page;
}

function ReferencePage({ title, src }) {
  return <iframe className="landing-reference" title={title} src={src} />;
}

createRoot(document.getElementById('root')).render(<App />);
