import React, { useEffect, useRef, useState } from 'react';
import { teamTemplates } from '../../shared/workspace-team.js';
import './workspace-team.css';

export const emptyAgent = () => ({ name: '', role: '', instructions: '', modelTier: 'team' });
export function AgentFields({ value, onChange, models = [] }) {
  const field = (key) => (event) => onChange({ ...value, [key]: event.target.value });
  return <>
    <label>Nama karyawan AI<input required maxLength={100} value={value.name} onChange={field('name')}/></label>
    <label>Peran<input required maxLength={150} placeholder="Mis. Penulis konten properti" value={value.role} onChange={field('role')}/></label>
    <label>Tugas dan instruksi<textarea required maxLength={4000} rows={4} placeholder="Jelaskan hasil yang diharapkan dan cara agen membantu." value={value.instructions} onChange={field('instructions')}/></label>
    <label>Model default<select value={value.modelTier} onChange={field('modelTier')}>
      {['team', 'leader'].map((id) => <option key={id} value={id}>{models.find((m) => m.id === id)?.name || (id === 'team' ? 'Model anggota dari konfigurasi server' : 'Model leader dari konfigurasi server')}</option>)}
    </select></label><small>Ini model default untuk tugas agen. Untuk percakapan, pilihan model lain tersedia di area input chat kantor. Penggunaan AI memerlukan langganan dan saldo rupiah organisasi; API key disediakan platform.</small>
  </>;
}
export function TeamSetupFields({ value, onChange }) {
  return <fieldset className="wt-form"><legend>Isi awal kantor</legend>
    <label>Cara menyiapkan tim<select value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value })}>
      <option value="empty">Mulai dari kantor kosong</option><option value="template">Pakai template divisi</option><option value="custom">Buat divisi dan agen sendiri</option>
    </select></label>
    {value.mode === 'template' && <label>Template divisi<select value={value.templateId} onChange={(e) => onChange({ ...value, templateId: e.target.value })}>{teamTemplates.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.agents.length} agen</option>)}</select></label>}
    {value.mode === 'custom' && <><label>Nama divisi<input required maxLength={100} value={value.division} onChange={(e) => onChange({ ...value, division: e.target.value })}/></label><AgentFields value={value.agent} onChange={(agent) => onChange({ ...value, agent })}/></>}
    <small>Pendaftaran membuat kantor kosong. Setelah paket aktif, pilih kembali template atau buat divisi di Kelola Tim. Pilihan ini tidak membeli langganan.</small>
  </fieldset>;
}
export function teamSetupPayload(value) {
  return value.mode === 'empty' ? { mode: 'empty' } : value.mode === 'template' ? { mode: 'template', templateId: value.templateId }
    : { mode: 'custom', division: value.division, agent: value.agent };
}

export function WorkspaceTeam({ onNavigate }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [version, refresh] = useState(0);
  const [busy, setBusy] = useState(false), inFlight = useRef(false);
  const [division, setDivision] = useState({ name: '', templateId: '' });
  const [editor, setEditor] = useState(null), [archive, setArchive] = useState(null);
  useEffect(() => {
    const controller = new AbortController(); setData(null);
    fetch('/api/team', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal }).then(async (res) => {
      if (!res.ok) throw new Error(); return res.json();
    }).then((body) => { if (!controller.signal.aborted) setData(body); }).catch(() => { if (!controller.signal.aborted) setError('Tim belum dapat dimuat. Periksa sesi dan kesiapan migration 005 dengan operator.'); });
    return () => controller.abort();
  }, [version]);
  async function mutate(path, method, body) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const res = await fetch(`/api/team/${path}`, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error([400, 402, 403, 404, 409].includes(res.status) ? result.error : 'Tim belum dapat disimpan. Periksa migration 005 dengan operator.');
      setEditor(null); setArchive(null); setDivision({ name: '', templateId: '' }); refresh((v) => v + 1);
    } catch (failure) { setError(failure instanceof TypeError ? 'Layanan tidak dapat dihubungi.' : failure.message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="wt-page"><header><div><h1>Divisi & agen</h1><p>Susun tim AI workspace Anda dari template atau buat karyawan sendiri.</p></div><button onClick={() => onNavigate('/dashboard/office')}>Lihat kantor 3D</button></header>
    {error && <p role="alert">{error} <button disabled={busy} onClick={() => { setError(''); refresh((v) => v + 1); }}>Muat ulang</button></p>}
    {!data && !error && <p role="status">Memuat tim…</p>}
    {data && <>
      {data.managedDemo && <p className="wt-card">Mode presentasi: kelola maksimal 6 divisi aktif dan 4 agen per divisi, meskipun AI dinonaktifkan. Perubahan berlaku untuk semua pengguna akun demo. Menghapus dari kantor tidak menghapus riwayat pekerjaan.</p>}
      {!data.divisions.length && <p className="wt-card">Kantor masih kosong. Belum ada divisi atau karyawan AI. Tidak ada agen bawaan yang diaktifkan otomatis.</p>}
      {data.canManage && <form className="wt-card wt-form" onSubmit={(e) => { e.preventDefault(); void mutate('divisions', 'POST', { name: division.name || undefined, ...(division.templateId ? { templateId: division.templateId } : {}) }); }}>
        <h2>Tambah divisi</h2><label>Mulai dari<select value={division.templateId} onChange={(e) => setDivision({ ...division, templateId: e.target.value })}><option value="">Divisi custom kosong</option>{data.templates.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.agents.length} agen</option>)}</select></label>
        <label>Nama divisi<input required={!division.templateId} maxLength={100} value={division.name} placeholder={data.templates.find((d) => d.id === division.templateId)?.name || 'Mis. Konten Properti'} onChange={(e) => setDivision({ ...division, name: e.target.value })}/></label>
        <button disabled={busy}>{busy ? 'Menyimpan…' : 'Buat divisi'}</button><small>Layout kantor: 8 ruangan divisi, maksimal 4 agen per divisi. Server membatasi jumlah divisi sesuai paket, dihitung di seluruh workspace organisasi.</small>
      </form>}
      {data.divisions.map((d) => <article className="wt-card" key={d.id}><header><h2>{d.name}</h2>{data.canManage && <div><button disabled={busy} onClick={() => setEditor({ divisionId: d.id, ...emptyAgent() })}>+ Agen</button><button disabled={busy} onClick={() => setArchive({ kind: 'divisions', id: d.id, name: d.name })}>{data.managedDemo?'Hapus divisi':'Arsipkan divisi'}</button></div>}</header>
        <div className="wt-grid">{data.agents.filter((a) => a.divisionId === d.id).map((a) => <section className="wt-agent" key={a.id}><h3>{a.name}</h3><p>{a.role}</p><small>{data.models.find((m) => m.id === a.modelTier)?.name}</small>{data.canManage && <div><button disabled={busy} onClick={() => setEditor(a)}>Edit</button><button disabled={busy} onClick={() => setArchive({ kind: 'agents', id: a.id, name: a.name })}>{data.managedDemo?'Hapus agen':'Arsipkan'}</button></div>}</section>)}</div>
        {!data.agents.some((a) => a.divisionId === d.id) && <p>Belum ada agen. Tambahkan karyawan AI untuk mengisi ruangan.</p>}
      </article>)}
      {editor && <form className="wt-card wt-form" onSubmit={(e) => { e.preventDefault(); const { name, role, instructions, modelTier } = editor; void mutate(editor.id ? `agents/${editor.id}` : `divisions/${editor.divisionId}/agents`, editor.id ? 'PATCH' : 'POST', { name, role, instructions, modelTier }); }}><h2>{editor.id ? 'Edit agen' : 'Tambah karyawan AI'}</h2><AgentFields value={editor} onChange={(fields) => setEditor({ ...editor, ...fields })} models={data.models}/><div><button disabled={busy}>Simpan agen</button><button type="button" disabled={busy} onClick={() => setEditor(null)}>Batal</button></div></form>}
      {archive && <section className="wt-card" role="alert"><h2>{data.managedDemo?'Hapus dari kantor:':'Arsipkan'} {archive.name}?</h2><p>Agen tidak akan tampil atau menerima chat baru. Riwayat pemakaian dan pekerjaan tidak dihapus. {data.managedDemo?'Menghapus divisi dari kantor juga mengeluarkan seluruh agennya. Data disimpan sebagai arsip untuk menjaga riwayat.':'Mengarsipkan divisi juga mengarsipkan agennya.'}</p><button disabled={busy} onClick={() => void mutate(`${archive.kind}/${archive.id}/archive`, 'POST', {})}>{data.managedDemo?'Ya, hapus dari kantor':'Ya, arsipkan'}</button><button disabled={busy} onClick={() => setArchive(null)}>Batal</button></section>}
    </>}
  </section>;
}
