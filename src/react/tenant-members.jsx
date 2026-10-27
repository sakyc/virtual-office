import React, { useEffect, useRef, useState } from 'react';
import { isManager } from '../../shared/tenant-members.js';
import { WorkNotice } from './tenant-work.jsx';
import './tenant-members.css';

export async function memberRequest(path = '', { method = 'GET', body, signal } = {}) {
  const response = await fetch(`/api/workspace/${path}`, { method, credentials: 'same-origin', cache: 'no-store', signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error([400,401,402,403,404,409,410].includes(response.status) ? result.error || 'Permintaan tidak diizinkan.' : 'Pengelolaan anggota belum tersedia. Coba lagi.'), { status: response.status });
  return result;
}
const roleNames = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' };
const empty = { email: '', role: 'member', divisionIds: [], agentIds: [] };
export function MemberEditor({ value, team, actorRole, saving, error, onCancel, onSave }) {
  const [form, setForm] = useState(value || empty);
  const toggle = (field, id) => setForm(f => ({ ...f, [field]: f[field].includes(id) ? f[field].filter(v => v !== id) : [...f[field], id] }));
  return <form className="work-panel member-editor" onSubmit={e => { e.preventDefault(); onSave(form); }} aria-label={value ? 'Edit akses anggota' : 'Undang anggota'}>
    <div><span className="member-eyebrow">ANGGOTA & AKSES</span><h2>{value ? `Akses ${value.displayName || value.email}` : 'Undang anggota baru'}</h2><p className="work-hint">Satu akun manusia, akses ke tenant yang sama. Agen AI bukan anggota manusia.</p></div>
    <fieldset disabled={saving}>
      {!value && <label>Email penerima<input autoFocus required type="email" maxLength={254} placeholder="nama@perusahaan.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}/></label>}
      <label>Role<select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value, divisionIds: [], agentIds: [] }))}>
        {['member', 'viewer', ...(actorRole === 'owner' ? ['admin'] : [])].map(role => <option key={role} value={role}>{roleNames[role]}</option>)}
      </select></label>
      <p className="work-hint">{form.role === 'admin' ? 'Mengelola seluruh workspace dan anggota. Hanya owner dapat memberikan role admin.' : form.role === 'viewer' ? 'Melihat data workspace. Tidak dapat chat, membuat tugas, atau memberi persetujuan.' : 'Dapat chat dan membuat tugas memakai divisi/agen yang ditugaskan. Persetujuan hanya jika ditunjuk sebagai PIC divisi.'}</p>
      {form.role === 'member' && <div className="member-assignment-grid">
        <section><h3>Seluruh agen dalam divisi</h3><p className="work-hint">Termasuk agen baru yang nanti ditambahkan ke divisi ini.</p>{team.divisions.length ? team.divisions.map(d => <label className="member-check" key={d.id}><input type="checkbox" checked={form.divisionIds.includes(d.id)} onChange={() => toggle('divisionIds', d.id)}/><span>{d.name}</span></label>) : <p className="work-hint">Belum ada divisi. Penugasan bisa diatur kemudian.</p>}</section>
        <section><h3>Agen tertentu saja</h3><p className="work-hint">Tidak perlu dipilih lagi jika seluruh divisinya sudah ditugaskan.</p>{team.agents.map(a => <label className="member-check" key={a.id}><input type="checkbox" checked={form.agentIds.includes(a.id) || form.divisionIds.includes(a.divisionId)} disabled={form.divisionIds.includes(a.divisionId)} onChange={() => toggle('agentIds', a.id)}/><span>{a.name}<small>{team.divisions.find(d => d.id === a.divisionId)?.name}</small></span></label>)}</section>
      </div>}
      {error && <p className="work-error" role="alert">{error}</p>}
      <div className="work-actions"><button type="button" className="work-button btns" onClick={onCancel}>Batal</button><button className="work-button btnp">{saving ? 'Menyimpan…' : value ? 'Simpan akses' : 'Buat tautan undangan'}</button></div>
    </fieldset>
  </form>;
}

export function TenantMembers({ profile }) {
  const [state, setState] = useState({ loading: true }), [retry, setRetry] = useState(0);
  const [editor, setEditor] = useState(null), [error, setError] = useState(''), [message, setMessage] = useState(''), [invite, setInvite] = useState(null), [saving, setSaving] = useState(false);
  const action = useRef(null), busy = useRef(false);
  useEffect(() => () => action.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController(); setState({ loading: true });
    memberRequest('members', { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setState({ data }); })
      .catch(error => { if (!controller.signal.aborted) setState({ error }); });
    return () => controller.abort();
  }, [retry]);
  async function mutate(path, body, method = 'POST') {
    if (busy.current) return; busy.current = true; setSaving(true); setError(''); setMessage('');
    action.current = new AbortController();
    try {
      const result = await memberRequest(path, { method, body, signal: action.current.signal });
      if (action.current.signal.aborted) return;
      setEditor(null); setInvite(result.inviteUrl || null); setMessage(result.inviteUrl ? 'Undangan dibuat. Salin dan kirim tautan secara pribadi ke email penerima.' : 'Perubahan tersimpan.'); setRetry(n => n + 1);
    } catch (failure) { if (failure.name !== 'AbortError') setError(failure.message); }
    finally { busy.current = false; setSaving(false); }
  }
  const data = state.data;
  return <section className="tenant-work tenant-members">
    <div className="work-heading"><div><h1>Anggota & akses</h1><p>Atur orang, tanggung jawab agen AI, dan PIC persetujuan dalam workspace ini.</p></div>{data?.canManage && <button className="work-button btnp" disabled={saving} onClick={() => { setEditor({ create: true }); setError(''); setInvite(null); }}>Undang anggota</button>}</div>
    {state.loading || state.error ? <WorkNotice {...state} onRetry={() => setRetry(n => n + 1)}/> : <>
      <div className="member-summary"><article><span>Anggota aktif</span><strong>{data.members.length}</strong></article><article><span>Divisi workspace</span><strong>{data.divisions.length}</strong></article><article><span>Undangan tertunda</span><strong>{data.canManage ? data.invitations.length : '—'}</strong></article></div>
      <p className="work-hint">Board dan data workspace dibaca bersama sesuai role. Penugasan membatasi pemakaian agen AI; persetujuan dibatasi ke PIC atau owner/admin. Batas anggota mengikuti paket organisasi, bukan jumlah agen AI.</p>
      {message && <p className="work-notice" role="status">{message}</p>}
      {invite && <div className="work-panel member-invite-link"><h2>Tautan hanya ditampilkan kali ini</h2><p className="work-hint">Berlaku 72 jam, sekali pakai, hanya untuk akun dengan email penerima. Belum dikirim otomatis. Undangan tidak menjamin kursi; kapasitas paket dicek lagi saat diterima.</p><label>Tautan undangan<input readOnly value={invite} onFocus={e => e.target.select()}/></label><div className="work-actions"><button className="work-button btns" onClick={async () => { try { await navigator.clipboard.writeText(invite); setMessage('Tautan disalin.'); } catch { setMessage('Pilih tautan di atas lalu salin manual.'); } }}>Salin tautan</button><button className="work-button btns" onClick={() => setInvite(null)}>Sembunyikan</button></div></div>}
      {editor && <MemberEditor key={editor.id || 'create'} value={editor.create ? null : editor} team={data} actorRole={data.actorRole} saving={saving} error={error} onCancel={() => setEditor(null)} onSave={form => mutate(editor.create ? 'members/invitations' : `members/${editor.id}`, { role: form.role, divisionIds: form.divisionIds, agentIds: form.agentIds, ...(editor.create ? { email: form.email } : { version: editor.version }) }, editor.create ? 'POST' : 'PATCH')}/>}
      {!editor && error && <p className="work-error" role="alert">{error}</p>}
      <div className="work-panel"><div className="work-table-wrap"><table className="work-table"><thead><tr><th>Anggota</th><th>Role</th><th>Penugasan AI</th>{data.canManage && <th>Tindakan</th>}</tr></thead><tbody>{data.members.map(m => <tr key={m.id}><td><strong>{m.displayName || m.email}</strong><small>{m.email}{m.id === profile.user.id ? ' · Anda' : ''}</small></td><td><span className="work-badge">{roleNames[m.role]}</span></td><td>{isManager(m.role) ? 'Seluruh workspace' : m.role === 'viewer' ? 'Hanya baca' : [...m.divisionIds.map(id => data.divisions.find(d => d.id === id)?.name).filter(Boolean), ...m.agentIds.map(id => data.agents.find(a => a.id === id)?.name).filter(Boolean)].join(', ') || 'Belum ditugaskan'}</td>{data.canManage && <td>{m.id !== profile.user.id && m.role !== 'owner' && (data.actorRole === 'owner' || m.role !== 'admin') ? <div className="work-actions"><button className="work-button btns" disabled={saving} onClick={() => { setEditor(m); setError(''); }}>Edit akses</button><button className="work-button btns work-error" disabled={saving} onClick={() => { if (window.confirm(`Cabut akses ${m.email} ke workspace ini? Riwayat tugas dan akun tetap disimpan.`)) mutate(`members/${m.id}/revoke`, { version: m.version }); }}>Cabut akses</button></div> : <span className="work-hint">{m.role === 'owner' ? 'Owner dilindungi' : m.id === profile.user.id ? 'Akun sendiri' : 'Dikelola owner'}</span>}</td>}</tr>)}</tbody></table></div></div>
      <section className="work-panel"><h2>PIC persetujuan per divisi</h2><p className="work-hint">PIC member harus ditugaskan ke seluruh divisi. Jika belum ada PIC, hanya owner/admin yang meninjau. Perubahan berlaku untuk hasil tugas yang masih menunggu.</p><div className="member-reviewers">{data.divisions.map(d => <label key={d.id}>{d.name}<select disabled={!data.canManage || saving} value={data.reviewers.find(r => r.divisionId === d.id)?.userId || ''} onChange={e => mutate(`members/reviewers/${d.id}`, { userId: e.target.value ? Number(e.target.value) : null }, 'PUT')}><option value="">Owner / admin tenant</option>{data.members.filter(m => isManager(m.role) || (m.role === 'member' && m.divisionIds.includes(d.id))).map(m => <option key={m.id} value={m.id}>{m.displayName || m.email} · {roleNames[m.role]}</option>)}</select></label>)}</div>{!data.divisions.length && <p className="work-hint">Buat divisi di menu Divisi & agen terlebih dahulu.</p>}</section>
      {data.canManage && <section className="work-panel"><h2>Undangan tertunda</h2>{!data.invitations.length ? <p className="work-hint">Tidak ada undangan aktif.</p> : data.invitations.map(i => <div className="member-invitation" key={i.id}><div><strong>{i.email}</strong><small>{roleNames[i.role]} · berakhir {new Date(i.expiresAt).toLocaleString('id-ID')}</small></div><button disabled={saving} className="work-button btns" onClick={() => mutate(`members/invitations/${i.id}/revoke`, {})}>Cabut undangan</button></div>)}</section>}
    </>}
  </section>;
}

export function JoinWorkspace({ onNavigate }) {
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token'));
  const [state, setState] = useState({}), busy = useRef(false), controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function accept() {
    if (busy.current) return; busy.current = true; setState({ busy: true }); controller.current = new AbortController();
    try { await memberRequest('invitations/accept', { method: 'POST', body: { token }, signal: controller.current.signal }); if (!controller.current.signal.aborted) { history.replaceState(null, '', '/join'); onNavigate('/dashboard'); } }
    catch (error) { if (error.name !== 'AbortError') setState({ error: error.message, loginRequired: error.status === 401 }); }
    finally { busy.current = false; }
  }
  return <main className="join-workspace"><section className="work-panel"><span className="member-eyebrow">KARYORA · UNDANGAN WORKSPACE</span><h1>Bergabung dengan tim</h1><p>Masuk atau daftar menggunakan email penerima undangan, lalu kembali ke tautan ini dan terima undangannya. Anda tidak perlu membuat organisasi baru.</p><p>Tautan berlaku 72 jam dan hanya bisa dipakai sekali. Penerimaan tetap mengikuti kapasitas paket organisasi.</p>{state.error && <p role="alert">{state.error}</p>}<button className="work-button btnp" disabled={state.busy || !token} onClick={accept}>{state.busy ? 'Memeriksa undangan…' : 'Terima undangan'}</button>{!token && <p role="alert">Tautan undangan tidak lengkap. Minta tautan baru kepada admin tenant.</p>}<div className="work-actions"><a href="/login" target="_blank" rel="noopener noreferrer">Masuk</a><a href="/register" target="_blank" rel="noopener noreferrer">Daftar akun</a></div><p className="work-hint">Login/daftar dibuka di tab baru agar tautan undangan ini tidak hilang.</p></section></main>;
}
