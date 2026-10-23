import React, { useCallback, useEffect, useState } from 'react';
import './reference/reset.css';
import { LandingDesign } from './reference/landing.jsx';
import { OnboardingDesign } from './reference/onboarding.jsx';
import { DashboardDesign } from './reference/dashboard.jsx';
import { TenantWork } from './tenant-work.jsx';

export function LandingPage() {
  return <LandingDesign />;
}

export function OnboardingPage({ onNavigate }) {
  const [form, setForm] = useState({ organizationName: '', workspaceName: '', clientName: '', clientBrief: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const decorate = (values, design) => ({
    ...values, form, submitting, error,
    updateField: (field, value) => setForm((current) => ({ ...current, [field]: value })),
    submitOnboarding: async (event) => {
      event.preventDefault();
      if (submitting) return;
      setSubmitting(true); setError('');
      try {
        const response = await fetch('/api/onboarding', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, teamSize: ['1-5', '6-20', '21-50', '50+'][design.state.size] }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Onboarding belum dapat diselesaikan.');
        onNavigate('/app');
      } catch (failure) {
        setError(failure.message); setSubmitting(false);
      }
    },
  });
  return <OnboardingDesign decorate={decorate} />;
}

export function DashboardPage({ onNavigate, section = 'overview' }) {
  const [profile, setProfile] = useState(null);
  const [sessionState, setSessionState] = useState({ loading: true, error: null });
  const [overview, setOverview] = useState(null);
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
    fetch('/api/dashboard/overview', { credentials: 'same-origin', signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then(setOverview).catch(() => {});
    return () => controller.abort();
  }, [profile?.activeWorkspace?.id, section]);
  const logout = useCallback(async (event) => {
    event.preventDefault();
    const response = await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (response.ok) onNavigate('/');
  }, [onNavigate]);
  const decorate = (values, design) => {
    // Prototype role controls affect preview state only; real permissions always come from the session.
    const paths = { overview: '/app', office: '/app/office', jobs: '/app/board' };
    const navGroups = values.navGroups.map((group) => ({ ...group, items: group.items.map((item) => {
      const active = item.id === 'jobs' && section !== 'overview';
      return { ...item, ...(active ? { current: 'page', bg: 'var(--accentSoft)', ink: 'var(--accentText)', weight: 800, shadow: 'inset 3px 0 0 var(--accent)' } : {}),
        ...(section !== 'overview' && item.id === 'overview' ? { current: undefined, bg: 'transparent', ink: 'var(--soft)', weight: 600, shadow: 'none' } : {}),
        badge: item.id === 'jobs' && (profile || section !== 'overview') ? undefined : item.badge,
        go: paths[item.id] ? () => { if (item.id === 'overview') design.setState({ view: 'overview' }); onNavigate(paths[item.id]); }
          : section !== 'overview' ? () => { design.setState({ view: item.id }); onNavigate('/app'); } : item.go,
      };
    }) }));
    const result = { ...values, navGroups, goOffice: () => onNavigate('/app/office'), logout };
    result.goJobs = () => onNavigate(values.v.agents ? '/app/jobs' : '/app/board');
    result.goAgents = () => onNavigate('/app/jobs');
    if (section !== 'overview') {
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
    result.greeting = `Selamat siang, ${result.userName.split(/\s+/)[0]}`;
    result.roleLabel = workspace?.role || 'Tanpa workspace';
    result.asAdmin = result.asOwner = () => {};
    // Customer sessions do not gain platform admin capabilities via the design preview switch.
    result.navGroups = navGroups.filter((group) => group.title !== 'Admin platform');
    result.isAdmin = false; result.isOwner = workspace?.role === 'owner';
    result.kpis = overview ? [
      { label: 'Total perintah', value: String(overview.metrics.totalJobs), note: 'Workspace', bg: 'var(--accentSoft)', ink: 'var(--accentText)' },
      { label: 'Sedang berjalan', value: String(overview.metrics.activeJobs), note: 'Aktif', bg: 'var(--warnSoft)', ink: 'var(--warn)' },
      { label: 'Disetujui', value: String(overview.metrics.approvedItems), note: 'Item', bg: 'var(--okSoft)', ink: 'var(--ok)' },
      { label: 'Client', value: String(overview.metrics.totalClients), note: 'Workspace', bg: 'var(--accentSoft)', ink: 'var(--accentText)' },
    ] : values.kpis.map((kpi) => ({ ...kpi, value: '—', note: 'Belum tersedia' }));
    result.recent = (overview?.recentJobs || []).map((job) => ({
      title: job.clientName ? `${job.jobType} · ${job.clientName}` : job.jobType,
      agent: job.agentId || 'Agent', when: job.createdAt, ini: (job.agentId || 'AI').slice(0, 2).toUpperCase(),
      tint: 'var(--accentSoft)', status: job.status, sbg: 'var(--accentSoft)', sink: 'var(--accentText)',
    }));
    result.goJobs = () => onNavigate(values.v.agents ? '/app/jobs' : '/app/board');
    result.goAgents = () => onNavigate('/app/jobs');
    return result;
  };
  return <DashboardDesign decorate={decorate} />;
}
