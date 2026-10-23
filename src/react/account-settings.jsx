import React, { useEffect, useRef, useState } from 'react';
import { saveAccount } from './account-api.js';
import { PasswordSettings } from './password-settings.jsx';
import './dashboard-overview.css';
import './account-settings.css';

export function AccountSettings({ profile, onSaved, onlyProfile = false }) {
  const [displayName, setDisplayName] = useState(profile.user.displayName || '');
  const [workspaceName, setWorkspaceName] = useState(profile.activeWorkspace?.name || '');
  const [organizationName, setOrganizationName] = useState(profile.activeWorkspace?.organization?.name || '');
  const [state, setState] = useState({ busy: false, error: '', success: '' });
  const pending = useRef(false);
  useEffect(() => { setDisplayName(profile.user.displayName || ''); }, [profile.user.displayName]);
  useEffect(() => { setWorkspaceName(profile.activeWorkspace?.name || ''); }, [profile.activeWorkspace?.name]);
  useEffect(() => { setOrganizationName(profile.activeWorkspace?.organization?.name || ''); }, [profile.activeWorkspace?.organization?.name]);
  const owner = profile.activeWorkspace?.role === 'owner';
  const canManageWorkspace = owner || profile.activeWorkspace?.role === 'admin';
  const submit = async (event, action) => {
    event.preventDefault(); if (pending.current) return;
    pending.current = true; setState({ busy: true, error: '', success: '' });
    try {
      const updated = await saveAccount(action, action === 'profile' ? { displayName } : { workspaceName, ...(owner ? { organizationName } : {}) });
      onSaved(updated); setState({ busy: false, error: '', success: 'Perubahan berhasil disimpan.' });
    } catch (error) { setState({ busy: false, error: error.message, success: '' }); }
    finally { pending.current = false; }
  };
  return <div className="live-overview account-settings">
    {!onlyProfile && <h1>Pengaturan</h1>}
    {state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}
    <form className="live-card" onSubmit={(event) => submit(event, 'profile')}><h2>Profil akun</h2>
      <label>Nama lengkap<input required maxLength={150} value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" disabled={state.busy}/></label>
      <label>Email<input readOnly type="email" value={profile.user.email} /></label><p>Perubahan email belum tersedia di halaman ini.</p>
      <button className="live-primary" disabled={state.busy}>{state.busy ? 'Menyimpan…' : 'Simpan profil'}</button>
    </form>
    {!onlyProfile && profile.activeWorkspace && <form className="live-card" onSubmit={(event) => submit(event, 'workspace')}><h2>Organisasi &amp; workspace</h2>
      <label>Nama workspace<input required maxLength={150} value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} disabled={!canManageWorkspace || state.busy}/></label>
      <label>Nama organisasi<input required maxLength={150} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} disabled={!owner || state.busy}/></label>
      <p>Owner dapat mengubah nama organisasi dan workspace. Admin workspace hanya dapat mengubah nama workspace. Peran ditentukan oleh server.</p>
      {canManageWorkspace && <button className="live-primary" disabled={state.busy}>{state.busy ? 'Menyimpan…' : 'Simpan workspace'}</button>}
    </form>}
    <PasswordSettings />
  </div>;
}
