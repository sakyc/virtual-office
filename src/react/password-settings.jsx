import React, { useRef, useState } from 'react';
import { passwordRequirements, validPassword } from '../../shared/auth-validation.js';

export function PasswordSettings() {
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmation: '' });
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState({ busy: false, error: '' });
  const pending = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const { currentPassword, newPassword, confirmation } = values;
    if (!validPassword(newPassword) || new TextEncoder().encode(newPassword).length > 256 || newPassword !== confirmation || newPassword === currentPassword) {
      setState({ busy: false, error: 'Penuhi persyaratan sandi baru, gunakan sandi berbeda, dan samakan konfirmasinya.' }); return;
    }
    pending.current = true; setState({ busy: true, error: '' });
    try {
      const response = await fetch('/api/account/password', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) });
      if (!response.ok) {
        const messages = { 400: 'Sandi lama tidak sesuai, akun bukan akun lokal, atau sandi baru tidak valid.', 401: 'Sesi berakhir. Silakan masuk kembali.', 403: 'Permintaan ditolak. Muat ulang halaman lalu coba lagi.', 429: 'Terlalu banyak percobaan. Tunggu 15 menit.' };
        throw new Error(messages[response.status] || 'Kata sandi belum dapat diubah. Coba lagi sebentar.');
      }
      setValues({ currentPassword: '', newPassword: '', confirmation: '' }); setVisible(false);
      // Full navigation discards cached customer state after all sessions are revoked.
      window.location.assign('/login');
    } catch (error) {
      setValues((previous) => ({ ...previous, currentPassword: '' }));
      setState({ busy: false, error: error instanceof TypeError ? 'Koneksi terputus. Periksa sesi sebelum mencoba lagi.' : error.message });
    } finally { pending.current = false; }
  }
  return <form className="live-card" onSubmit={submit}>
    <h2>Ganti kata sandi</h2><p>Khusus akun email dan kata sandi. Setelah berhasil, semua perangkat harus masuk kembali.</p>
    {state.error && <p role="alert">{state.error}</p>}
    {Object.entries({ currentPassword: 'Kata sandi lama', newPassword: 'Kata sandi baru', confirmation: 'Konfirmasi kata sandi baru' }).map(([key, label]) => <label key={key}>{label}<input required type={visible ? 'text' : 'password'} autoComplete={key === 'currentPassword' ? 'current-password' : 'new-password'} maxLength={256} value={values[key]} onChange={(event) => setValues({ ...values, [key]: event.target.value })} disabled={state.busy}/></label>)}
    <ul aria-label="Persyaratan kata sandi">{passwordRequirements(values.newPassword).map((rule) => <li key={rule.id}>{rule.passed ? '✓ Terpenuhi: ' : '○ Belum terpenuhi: '}{rule.label}</li>)}</ul>
    <button type="button" aria-pressed={visible} onClick={() => setVisible(!visible)} disabled={state.busy}>{visible ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}</button>{' '}
    <button className="live-primary" disabled={state.busy}>{state.busy ? 'Mengubah…' : 'Ubah kata sandi & keluar'}</button>
  </form>;
}
