import React, { useEffect, useState } from 'react';
import { workApi } from './work-api.js';
import { WorkNotice } from './tenant-work.jsx';

export function WorkspaceDirectory({ kind, profile }) {
  const [state, setState] = useState({ loading: true, rows: [], error: null });
  const [retry, setRetry] = useState(0), [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const members = kind === 'members';
  const canCreate = !members && ['owner', 'admin', 'member'].includes(profile?.activeWorkspace?.role);
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, rows: [], error: null });
    fetch(`/api/dashboard/${kind}`, { credentials: 'same-origin', signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(response.status === 403 ? 'Anda tidak memiliki izin melihat direktori ini.' : 'Direktori belum dapat dimuat.');
        if (!Array.isArray(body[kind])) throw new Error('Respons direktori tidak valid.');
        return body[kind];
      })
      .then(rows => { if (!controller.signal.aborted) setState({ rows, loading: false, error: null }); })
      .catch(error => { if (!controller.signal.aborted) setState({ rows: [], loading: false, error }); });
    return () => controller.abort();
  }, [kind, profile?.activeWorkspace?.id, retry]);
  async function submit(event) {
    event.preventDefault(); if (saving || !canCreate) return;
    setSaving(true); setError('');
    try { await workApi.createClient(form); setForm(null); setRetry(n => n + 1); }
    catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  }
  return <section className="tenant-work">
    <div className="work-heading"><div><h1>{members ? 'Anggota workspace' : 'Klien'}</h1><p>{members ? 'Akun manusia yang memiliki akses ke workspace aktif. Berbeda dari agen AI.' : 'Konteks brand atau pelanggan untuk tugas. Klien bersifat opsional.'}</p></div>{canCreate && <button className="work-button btnp" onClick={() => { setForm({ name: '', brief: '' }); setError(''); }}>Tambah klien</button>}</div>
    {form && <form className="work-panel" onSubmit={submit}><fieldset disabled={saving}><label>Nama klien<input required maxLength={150} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label><label>Brief (opsional)<textarea rows={3} maxLength={4000} value={form.brief} onChange={e => setForm({ ...form, brief: e.target.value })}/></label>{error && <p role="alert">{error}</p>}<div className="work-actions"><button className="work-button btns" type="button" onClick={() => setForm(null)}>Batal</button><button className="work-button btnp">{saving ? 'Menyimpan…' : 'Simpan klien'}</button></div></fieldset></form>}
    {state.loading || state.error ? <WorkNotice {...state} onRetry={() => setRetry(n => n + 1)}/> : <div className="work-panel">{!state.rows.length ? <p>Belum ada {members ? 'anggota' : 'klien'} pada workspace ini.</p> : <div className="work-table-wrap"><table className="work-table"><thead><tr><th>Nama</th><th>{members ? 'Email' : 'Brief'}</th>{members && <th>Role</th>}</tr></thead><tbody>{state.rows.map(row => <tr key={row.id}><td>{members ? row.displayName || row.email : row.name}</td><td>{members ? row.email : row.brief || '—'}</td>{members && <td>{row.role}</td>}</tr>)}</tbody></table></div>}</div>}
    {members && <p className="work-hint">Undangan dan perubahan role mandiri belum tersedia. Pengelolaan membership melalui admin platform; batas anggota paket tetap diperiksa server.</p>}
  </section>;
}
