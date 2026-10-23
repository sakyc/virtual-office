import React, { useEffect, useId, useRef, useState } from 'react';
import './profile-menu.css';
import { AccountSettings } from './account-settings.jsx';

function Icon({ kind }) {
  const paths = { profile: 'M20 21v-2a7 7 0 0 0-14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', settings: 'M12 8v8M8 12h8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9' };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]}/></svg>;
}

export function ProfileMenu({ profile, loading, busy, error, onLogout, onSettings, onSaved }) {
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const root = useRef(null), trigger = useRef(null), dialog = useRef(null);
  const menuId = useId(), titleId = useId();
  const name = profile?.user?.displayName || profile?.user?.email || 'Belum login';
  const initials = profile?.user ? name.split(/\s+/).slice(0, 2).map((part) => [...part][0]).join('').toUpperCase() : '';
  useEffect(() => {
    if (!open) return;
    const outside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  useEffect(() => {
    if (!showProfile) return;
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, [showProfile]);
  const closeProfile = () => { setShowProfile(false); trigger.current?.focus(); };
  return <div className="account-menu" ref={root} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" className="account-trigger" aria-label="Menu profil" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((value) => !value)}>
      <span className="account-avatar" aria-hidden="true">{initials || <Icon kind="profile"/>}</span><span>Profil</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={open ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'}/></svg>
    </button>
    {open && <div id={menuId} className="account-dropdown" aria-label="Pilihan akun">
      <div className="account-identity"><strong>{loading ? 'Memuat profil…' : name}</strong>{profile?.user?.email && <span>{profile.user.email}</span>}</div>
      <button type="button" className="account-action" onClick={() => { setOpen(false); setShowProfile(true); }}><Icon kind="profile"/>Profil</button>
      <button type="button" className="account-action" onClick={() => { setOpen(false); onSettings(); }}><Icon kind="settings"/>Pengaturan</button>
      <div className="account-divider"/>
      {profile?.user ? <button type="button" className="account-action account-logout" disabled={busy} onClick={onLogout}><Icon kind="logout"/>{busy ? 'Keluar…' : 'Logout'}</button> : <a className="account-action" href="/login"><Icon kind="logout"/>Masuk</a>}
      {error && <p role="alert" className="account-error">{error}</p>}
    </div>}
    {showProfile && <dialog ref={dialog} className="account-dialog" aria-labelledby={titleId} onCancel={closeProfile} onClick={(event) => { if (event.target === event.currentTarget) closeProfile(); }}>
      <div className="account-dialog-heading"><h2 id={titleId}>Profil saya</h2><button type="button" className="account-close" aria-label="Tutup profil" onClick={closeProfile}>×</button></div>
      {profile?.user ? <><AccountSettings profile={profile} onSaved={onSaved} onlyProfile/><dl className="account-details"><dt>Workspace aktif</dt><dd>{profile.activeWorkspace?.name || 'Belum dipilih'}</dd><dt>Organisasi</dt><dd>{profile.activeWorkspace?.organization?.name || 'Belum tersedia'}</dd><dt>Peran workspace</dt><dd>{profile.activeWorkspace?.role || 'Belum tersedia'}</dd></dl></> : <p>Masuk untuk melihat profil akun Anda. <a href="/login">Masuk</a></p>}
    </dialog>}
  </div>;
}
