import React, { useCallback, useEffect, useRef, useState } from 'react';
import './reference/reset.css';
import { LandingDesign } from './reference/landing.jsx';
import { OnboardingDesign } from './reference/onboarding.jsx';
import { DashboardDesign } from './reference/dashboard.jsx';
import { TenantWork } from './tenant-work.jsx';
import { ProfileMenu } from './profile-menu.jsx';
import { destinationForProfile, loadAuthProfile, logoutSession } from './auth-flow.js';
import { onboardingErrors } from '../../shared/onboarding-validation.js';
import { loadDashboardOverview } from './dashboard-data.js';
import { DashboardUnavailable, LiveDashboardOverview } from './dashboard-overview.jsx';
import { AccountSettings } from './account-settings.jsx';
import { UsagePage } from './usage-page.jsx';

export function LandingPage() {
  return <LandingDesign />;
}

export function OnboardingPage({ onNavigate }) {
  const [form, setForm] = useState({ organizationName: '', workspaceName: '', clientName: '', clientBrief: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const decorate = (values, design) => ({
    ...values, form, submitting, error,
    divs: [],
    steps: values.steps.map((step, index) => index === 2 ? { ...step, title: 'Konfirmasi', sub: 'Periksa kantor Anda' } : step),
    updateField: (field, value) => { setError(''); setForm((current) => ({ ...current, [field]: value })); },
    next: () => {
      const errors = onboardingErrors(form, design.state.step);
      setError(Object.values(errors)[0] || '');
      if (!Object.keys(errors).length) values.next();
    },
    back: () => { setError(''); values.back(); },
    submitOnboarding: async (event) => {
      event.preventDefault();
      if (inFlight.current) return;
      const errors = onboardingErrors(form);
      if (Object.keys(errors).length) { setError(Object.values(errors)[0]); design.setState({ step: errors.organizationName ? 1 : 2 }); return; }
      inFlight.current = true;
      setSubmitting(true); setError('');
      try {
        const response = await fetch('/api/onboarding', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, teamSize: ['1-5', '6-20', '21-50', '50+'][design.state.size] }),
        });
        const body = await response.json().catch(() => ({}));
        if (response.status === 401) { onNavigate('/login', { replace: true }); return; }
        if (!response.ok) throw new Error(response.status === 409 ? 'Nama organisasi sudah digunakan. Kembali dan gunakan nama lain.' : 'Onboarding belum dapat diselesaikan. Coba lagi.');
        const profile = await loadAuthProfile();
        if (!profile || destinationForProfile(profile) !== '/app' || profile.activeWorkspace.id !== body.workspace?.id) throw new Error('Workspace belum aktif. Coba lagi untuk memeriksa hasil penyiapan.');
        onNavigate('/app', { replace: true });
      } catch (failure) {
        setError(failure instanceof TypeError ? 'Tidak dapat menghubungi layanan. Coba lagi.' : failure.message);
      } finally {
        inFlight.current = false; setSubmitting(false);
      }
    },
  });
  return <OnboardingDesign decorate={decorate} />;
}

export function DashboardPage({ onNavigate, section = 'overview' }) {
  const [logoutState, setLogoutState] = useState({ busy: false, error: '' });
  const [profile, setProfile] = useState(null);
  const [sessionState, setSessionState] = useState({ loading: true, error: null });
  const [overview, setOverview] = useState(null);
  const [overviewState, setOverviewState] = useState({ loading: true, error: '' });
  const [overviewRetry, setOverviewRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/auth/me', { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const diagnostic = await response.json().catch(() => ({}));
          const message = diagnostic.code === 'AUTHENTICATION_DISABLED'
            ? 'Login belum tersedia. Coba lagi setelah layanan diaktifkan.'
            : response.status === 401 ? 'Login diperlukan untuk membuka pekerjaan workspace.' : 'Layanan autentikasi belum tersedia.';
          throw Object.assign(new Error(message), { status: response.status });
        }
        const body = await response.json();
        if (!body?.user) throw new Error('Profil sesi tidak valid.');
        return body;
      })
      .then((body) => { if (!controller.signal.aborted) { setProfile(body); setSessionState({ loading: false, error: null }); } })
      .catch((error) => { if (!controller.signal.aborted) { setProfile(null); setSessionState({ loading: false, error: { message: error.status ? error.message : 'Tidak dapat memuat sesi. Coba lagi.', status: error.status } }); } });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (section !== 'overview' || !profile?.activeWorkspace?.id) return undefined;
    const controller = new AbortController();
    setOverview(null); setOverviewState({ loading: true, error: '' });
    loadDashboardOverview(controller.signal)
      .then((body) => { if (!controller.signal.aborted) { setOverview(body); setOverviewState({ loading: false, error: '' }); } })
      .catch((error) => { if (!controller.signal.aborted) setOverviewState({ loading: false, error: error.message }); });
    return () => controller.abort();
  }, [profile?.activeWorkspace?.id, section, overviewRetry]);
  const logout = useCallback(async (event) => {
    event?.preventDefault();
    if (logoutState.busy) return;
    setLogoutState({ busy: true, error: '' });
    try { await logoutSession(); setProfile(null); setOverview(null); onNavigate('/login'); }
    catch (error) { setLogoutState({ busy: false, error: error.message }); }
  }, [onNavigate, logoutState.busy]);
  const decorate = (values, design) => {
    // Prototype role controls affect preview state only; real permissions always come from the session.
    const paths = { overview: '/app', office: '/app/office', jobs: '/app/board', agents: '/app/jobs', settings: '/app/settings' };
    const navGroups = values.navGroups.map((group) => ({ ...group, items: group.items.map((item) => {
      const active = item.id === (section === 'settings' ? 'settings' : 'jobs') && section !== 'overview';
      return { ...item, ...(active ? { current: 'page', bg: 'var(--accentSoft)', ink: 'var(--accentText)', weight: 800, shadow: 'inset 3px 0 0 var(--accent)' } : {}),
        ...(section !== 'overview' && item.id === 'overview' ? { current: undefined, bg: 'transparent', ink: 'var(--soft)', weight: 600, shadow: 'none' } : {}),
        badge: item.id === 'jobs' ? undefined : item.badge,
        go: paths[item.id] ? () => { if (item.id === 'overview') design.setState({ view: 'overview' }); onNavigate(paths[item.id]); }
          : section !== 'overview' ? () => { design.setState({ view: item.id }); onNavigate('/app'); } : item.go,
      };
    }) }));
    const result = { ...values, live: true, navGroups: navGroups.filter((group) => group.title !== 'Admin platform'),
      workspaceName: 'Memuat workspace…', organizationName: '', userName: 'Memuat akun…', roleLabel: 'Memeriksa sesi',
      userInitials: '', goOffice: () => onNavigate('/app/office'), logout };
    if (section === 'overview') result.content = values.v.overview
      ? <LiveDashboardOverview profile={profile} overview={overview} loading={overviewState.loading && !sessionState.error} error={sessionState.error?.message || overviewState.error} onRetry={() => sessionState.error ? onNavigate('/login') : setOverviewRetry((value) => value + 1)} onNavigate={onNavigate} />
      : values.v.usage ? <UsagePage key={`${profile?.user?.id}:${profile?.activeWorkspace?.id}`} /> : <DashboardUnavailable title={values.pageTitle} />;
    if (section === 'settings') {
      result.pageTitle = 'Pengaturan';
      result.content = profile ? <AccountSettings key={profile.activeWorkspace?.id} profile={profile} onSaved={setProfile}/> : <p role="status">Memuat pengaturan…</p>;
    }
    result.profileMenu = <ProfileMenu profile={profile} loading={sessionState.loading} busy={logoutState.busy} error={logoutState.error} onLogout={logout} onSaved={setProfile} onSettings={() => onNavigate('/app/settings')} />;
    result.goJobs = () => onNavigate(values.v.agents ? '/app/jobs' : '/app/board');
    result.goAgents = () => onNavigate('/app/jobs');
    if (section !== 'overview' && section !== 'settings') {
      result.pageTitle = section === 'board' ? 'Perintah & Board' : 'Perintah';
      result.content = <TenantWork key={`${section}:${profile?.activeWorkspace?.id || 'none'}`} section={section} profile={profile} sessionState={sessionState} onNavigate={onNavigate} />;
      result.live = true;
      result.workspaceName = profile?.activeWorkspace?.name || 'Workspace';
      result.organizationName = profile?.activeWorkspace?.organization?.name || '';
      result.userName = profile?.user?.displayName || profile?.user?.email || 'Belum login';
      result.roleLabel = profile?.activeWorkspace?.role || 'Sesi diperlukan';
      result.navGroups = navGroups.filter((group) => group.title !== 'Admin platform');
    }
    if (!profile) return result;
    const workspace = profile.activeWorkspace;
    result.live = true;
    result.workspaceName = workspace?.name || 'Pilih workspace';
    result.organizationName = workspace?.organization?.name || '';
    result.userName = profile.user.displayName || profile.user.email;
    result.userInitials = result.userName.split(/\s+/).slice(0, 2).map((part) => [...part][0]).join('').toUpperCase();
    result.greeting = `Selamat siang, ${result.userName.split(/\s+/)[0]}`;
    result.roleLabel = workspace?.role || 'Tanpa workspace';
    result.asAdmin = result.asOwner = () => {};
    // Customer sessions do not gain platform admin capabilities via the design preview switch.
    result.navGroups = navGroups.filter((group) => group.title !== 'Admin platform');
    result.isAdmin = false; result.isOwner = workspace?.role === 'owner';
    result.goJobs = () => onNavigate(values.v.agents ? '/app/jobs' : '/app/board');
    result.goAgents = () => onNavigate('/app/jobs');
    return result;
  };
  return <DashboardDesign decorate={decorate} />;
}
