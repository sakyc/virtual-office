import React, { useId, useRef, useState } from 'react';
import { passwordRequirements } from '../../shared/auth-validation.js';
import { passwordChangeErrors, changePassword } from './password-change.js';

export function PasswordSettings() {
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmation: '' });
  const [visible, setVisible] = useState({});
  const [state, setState] = useState({ busy: false, error: '', fields: {} });
  const id = useId();
  const pending = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const fields = passwordChangeErrors(values);
    if (Object.keys(fields).length) {
      setState({ busy: false, error: 'Periksa isian yang ditandai.', fields }); return;
    }
    pending.current = true; setState({ busy: true, error: '' });
    try {
      await changePassword(values);
      setValues({ currentPassword: '', newPassword: '', confirmation: '' }); setVisible({});
      // Full navigation discards cached customer state after all sessions are revoked.
      window.location.assign('/login');
    } catch (error) {
      // Keep every field in component memory on validation/network/server failure.
      // Never persist passwords in browser storage or logs.
      setState({ busy: false, error: error.message, fields: error.fields || {} });
    } finally { pending.current = false; }
  }
  return <form className="live-card password-settings" onSubmit={submit} noValidate>
    <h2>Ganti kata sandi</h2><p>Khusus akun email dan kata sandi. Setelah berhasil, semua perangkat harus masuk kembali.</p>
    {state.error && <p role="alert">{state.error}</p>}
    {Object.entries({ currentPassword: 'Kata sandi lama', newPassword: 'Kata sandi baru', confirmation: 'Konfirmasi kata sandi baru' }).map(([key, label]) => <div key={key}>
      <label htmlFor={`${id}-${key}`}>{label}</label><div className="password-input-wrap"><input id={`${id}-${key}`} name={key} required type={visible[key] ? 'text' : 'password'} autoComplete={key === 'currentPassword' ? 'current-password' : 'new-password'} maxLength={256} value={values[key]} onChange={(event) => {
        setValues(previous => ({ ...previous, [key]: event.target.value }));
        setState(previous => ({ ...previous, error: '', fields: {} }));
      }} aria-invalid={Boolean(state.fields?.[key])} aria-describedby={[state.fields?.[key] && `${id}-${key}-error`, key === 'newPassword' && `${id}-rules`].filter(Boolean).join(' ') || undefined} disabled={state.busy}/>
      <button className="password-eye" type="button" aria-label={`${visible[key] ? 'Sembunyikan' : 'Tampilkan'} ${label.toLowerCase()}`} aria-controls={`${id}-${key}`} aria-pressed={Boolean(visible[key])} onClick={() => setVisible(previous => ({ ...previous, [key]: !previous[key] }))} disabled={state.busy}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible[key] && <path d="m3 3 18 18"/>}</svg></button></div>
      {state.fields?.[key] && <p className="password-field-error" id={`${id}-${key}-error`}>{state.fields[key]}</p>}
    </div>)}
    <ul id={`${id}-rules`} className="password-rules" aria-label="Persyaratan kata sandi">{passwordRequirements(values.newPassword).map((rule) => <li key={rule.id} data-passed={rule.passed}>{rule.passed ? '✓ Terpenuhi: ' : '○ Belum terpenuhi: '}{rule.label}</li>)}</ul>
    <button className="live-primary" disabled={state.busy}>{state.busy ? 'Mengubah…' : 'Ubah kata sandi & keluar'}</button>
  </form>;
}
