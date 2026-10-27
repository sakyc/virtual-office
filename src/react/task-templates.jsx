import React, { useEffect, useRef, useState } from 'react';
import { draftFromBuiltin, templateInput } from '../../shared/task-templates.js';
import './task-templates.css';

export const emptyTemplate = () => ({ name: '', description: '', instructions: '', outputFormat: 'Dokumen', fields: [] });
export async function templateRequest(path = '', method = 'GET', body, signal) {
  const response = await fetch(`/api/task-templates${path}`, { method, credentials: 'same-origin', cache: 'no-store', signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 401 ? 'Sesi berakhir. Silakan login kembali.' : [400, 403, 404, 409].includes(response.status) ? result.error : 'Template belum dapat dimuat atau disimpan. Coba lagi.');
  return result;
}

export function TemplateEditor({ value, onChange, onSubmit, onCancel, busy, copied }) {
  const change = key => event => onChange({ ...value, [key]: event.target.value });
  const fieldChange = (index, patch) => onChange({ ...value, fields: value.fields.map((field, i) => i === index ? { ...field, ...patch } : field) });
  return <form className="tt-editor" onSubmit={onSubmit} aria-label="Editor template tugas">
    <header><div><span className="tt-eyebrow">TEMPLATE WORKSPACE</span><h2>{value.id ? 'Edit template' : 'Buat template'}</h2></div><button type="button" disabled={busy} onClick={onCancel}>Tutup</button></header>
    {copied && <p className="tt-notice">Salinan mengambil nama dan kolom publik saja. Isi instruksi sendiri; prompt internal dan aturan eksekusi template bawaan tidak disalin. Kolom pilihan/tanggal/referensi diubah menjadi teks.</p>}
    <fieldset disabled={busy}><label>Nama template<input required maxLength={150} value={value.name} onChange={change('name')} placeholder="Mis. Carousel edukasi produk"/></label>
      <label>Deskripsi singkat<textarea rows={2} maxLength={500} value={value.description} onChange={change('description')}/></label>
      <label>Instruksi tugas<textarea required rows={5} maxLength={8000} value={value.instructions} onChange={change('instructions')} placeholder="Jelaskan tujuan, langkah kerja, gaya bahasa, dan hasil yang diharapkan."/></label>
      <label>Format hasil<input required maxLength={100} value={value.outputFormat} onChange={change('outputFormat')} placeholder="Mis. Carousel 7 slide"/></label>
      <div className="tt-fields-heading"><h3>Kolom input <small>{value.fields.length}/12</small></h3><button type="button" disabled={value.fields.length >= 12} onClick={() => {
        let n = 1; while (value.fields.some(f => f.name === `input_${n}`)) n++;
        onChange({ ...value, fields: [...value.fields, { name: `input_${n}`, label: '', type: 'text', required: true }] });
      }}>+ Tambah kolom</button></div>
      <p className="tt-muted">Kolom yang perlu diisi saat template digunakan. Kunci harus unik, huruf kecil tanpa spasi.</p>
      {value.fields.map((field, index) => <div className="tt-field-row" key={index}>
        <label>Label<input required maxLength={100} value={field.label} onChange={e => fieldChange(index, { label: e.target.value })}/></label>
        <label>Kunci<input required pattern="[a-z][a-z0-9_]{0,39}" value={field.name} onChange={e => fieldChange(index, { name: e.target.value })}/></label>
        <label>Jenis<select value={field.type} onChange={e => fieldChange(index, { type: e.target.value })}><option value="text">Teks</option><option value="textarea">Teks panjang</option><option value="number">Angka</option></select></label>
        <label className="tt-checkbox"><input type="checkbox" checked={field.required} onChange={e => fieldChange(index, { required: e.target.checked })}/> Wajib</label>
        <button type="button" aria-label={`Hapus kolom ${index + 1}`} onClick={() => onChange({ ...value, fields: value.fields.filter((_, i) => i !== index) })}>Hapus</button>
      </div>)}
    </fieldset><footer><button type="button" disabled={busy} onClick={onCancel}>Batal</button><button className="tt-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan template'}</button></footer>
  </form>;
}

export function TemplateLibrary({ data, tab, search, onTab, onSearch, onCreate, onEdit, onCopy, onArchive, onInspect, busy }) {
  const rows = (tab === 'custom' ? data.templates : data.builtins).filter(t => `${t.name} ${t.description}`.toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id')));
  return <><header className="tt-heading"><div><span className="tt-eyebrow">KELOLA WORKSPACE</span><h1>Template Tugas</h1><p>Simpan arahan kerja yang bisa digunakan kembali oleh tim Anda.</p></div>{data.canManage && <button className="tt-primary" disabled={busy} onClick={onCreate}>+ Buat template</button>}</header>
    <p className="tt-notice">Gunakan template ini melalui <a href="/dashboard/jobs">Perintah → Perintah baru</a> atau tombol Buat tugas pada agen di kantor. Pilih agen dan model; hasil masuk sebagai draft ke Board.</p>
    <div className="tt-toolbar"><div role="tablist" aria-label="Jenis template">{[['custom', 'Template saya', data.templates.length], ['builtin', 'Bawaan', data.builtins.length]].map(([id, label, count]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => onTab(id)}>{label} <span>{count}</span></button>)}</div><input aria-label="Cari template" placeholder="Cari template…" value={search} onChange={e => onSearch(e.target.value)}/></div>
    {!data.canManage && <p className="tt-muted">Anda dapat melihat template. Pengelolaan tersedia untuk owner dan admin workspace.</p>}
    {!rows.length && <div className="tt-empty"><h2>{search ? 'Template tidak ditemukan' : 'Belum ada template custom'}</h2><p>{search ? 'Coba kata kunci lain.' : 'Mulai dari template kosong atau salin struktur template bawaan.'}</p></div>}
    <div className="tt-grid">{rows.map(template => <article className="tt-card" key={template.id}><span className="tt-tag">{tab === 'builtin' ? 'Bawaan · hanya baca' : `Custom · v${template.version}`}</span><h2>{template.name}</h2><p>{template.description || 'Belum ada deskripsi.'}</p><div className="tt-meta">{template.outputFormat} · {template.fields.length} kolom input</div><footer><button onClick={() => onInspect(template)}>Lihat detail</button>{data.canManage && (tab === 'builtin' ? <button disabled={busy} onClick={() => onCopy(template)}>Salin struktur</button> : <><button disabled={busy} onClick={() => onEdit(template)}>Edit</button><button disabled={busy} onClick={() => onArchive(template)}>Arsipkan</button></>)}</footer></article>)}</div>
  </>;
}

export function TaskTemplates() {
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [tab, setTab] = useState('custom'), [search, setSearch] = useState(''), [retry, setRetry] = useState(0);
  const [editor, setEditor] = useState(null), [copied, setCopied] = useState(false), [inspect, setInspect] = useState(null), [archive, setArchive] = useState(null);
  const [busy, setBusy] = useState(false), flight = useRef(false), mounted = useRef(true);
  const editorAnchor = useRef(null);
  useEffect(() => { if (editor) editorAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [!!editor]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError('');
    templateRequest('', 'GET', undefined, controller.signal).then(body => { if (!controller.signal.aborted) setData(body); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [retry]);
  async function mutate(path, method, body) {
    if (flight.current) return;
    flight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await templateRequest(path, method, body);
      if (!mounted.current) return;
      setEditor(null); setArchive(null); setNotice(method === 'PATCH' ? 'Perubahan disimpan.' : path ? 'Template diarsipkan, bukan dihapus permanen.' : 'Template berhasil dibuat.'); setTab('custom'); setRetry(n => n + 1);
    } catch (e) { if (mounted.current) setError(e.message); }
    finally { flight.current = false; if (mounted.current) setBusy(false); }
  }
  const edit = value => { setCopied(false); setInspect(null); setError(''); setEditor(structuredClone(value)); };
  return <section className="tt-page">
    {error && <p role="alert" className="tt-error">{error} <button disabled={busy} onClick={() => setRetry(n => n + 1)}>Muat ulang daftar</button></p>}
    {notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">Memuat template…</p>}
    {data && <TemplateLibrary data={data} tab={tab} search={search} onTab={setTab} onSearch={setSearch} busy={busy} onCreate={() => edit(emptyTemplate())} onEdit={edit} onCopy={t => { edit(draftFromBuiltin(t)); setCopied(true); }} onInspect={setInspect} onArchive={setArchive}/>}
    {inspect && <article className="tt-editor"><header><h2>{inspect.name}</h2><button onClick={() => setInspect(null)}>Tutup detail</button></header><p>{inspect.description}</p>{inspect.instructions && <p className="tt-instructions">{inspect.instructions}</p>}<h3>Kolom input</h3><ul>{inspect.fields.map(f => <li key={f.name}>{f.label} · {f.type}{f.required ? ' · wajib' : ''}</li>)}</ul><p>Format: {inspect.outputFormat}</p></article>}
    {editor && <div ref={editorAnchor}><TemplateEditor value={editor} onChange={setEditor} busy={busy} copied={copied} onCancel={() => setEditor(null)} onSubmit={e => {
      e.preventDefault();
      try { const body = { name: editor.name, description: editor.description, instructions: editor.instructions, outputFormat: editor.outputFormat, fields: editor.fields, ...(editor.id ? { version: editor.version } : {}) }; templateInput(body, !!editor.id); void mutate(editor.id ? `/${editor.id}` : '', editor.id ? 'PATCH' : 'POST', body); } catch (failure) { setError(failure.message); }
    }}/></div>}
    {archive && <div className="tt-editor" role="alertdialog" aria-label="Konfirmasi arsip template"><h2>Arsipkan “{archive.name}”?</h2><p>Template tidak muncul di daftar aktif. Data tetap tersimpan di database; tugas dan riwayat lama tidak dihapus.</p><footer><button disabled={busy} onClick={() => setArchive(null)}>Batal</button><button disabled={busy} onClick={() => void mutate(`/${archive.id}/archive`, 'POST', { version: archive.version })}>Ya, arsipkan</button></footer></div>}
  </section>;
}
