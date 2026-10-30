import React, { useEffect, useRef, useState } from 'react';
import { draftFromBuiltin, templateInput, templateMatchesDivision } from '../../shared/task-templates.js';
import './task-templates.css';
import './task-template-actions.css';
import './task-template-readability.css';

export const emptyTemplate = () => ({ name: '', description: '', instructions: '', outputFormat: 'Dokumen', fields: [], divisionIds: [] });
export const templateTaskPath = (template,builtin=false) => `/dashboard/jobs?template=${encodeURIComponent(builtin?`builtin:${template.id}`:template.id)}`;
export async function templateRequest(path = '', method = 'GET', body, signal) {
  const response = await fetch(`/api/task-templates${path}`, { method, credentials: 'same-origin', cache: 'no-store', signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 401 ? 'Sesi berakhir. Silakan login kembali.' : [400, 403, 404, 409].includes(response.status) ? result.error : 'Template belum dapat dimuat atau disimpan. Coba lagi.');
  return result;
}

export function TemplateEditor({ value, onChange, onSubmit, onCancel, busy, copied, divisions = [] }) {
  const change = key => event => onChange({ ...value, [key]: event.target.value });
  const fieldChange = (index, patch) => onChange({ ...value, fields: value.fields.map((field, i) => i === index ? { ...field, ...patch } : field) });
  return <form className="tt-editor" onSubmit={onSubmit} aria-label="Editor template tugas">
    <header><div><span className="tt-eyebrow">TEMPLATE WORKSPACE</span><h2>{value.id ? 'Edit template' : 'Buat template'}</h2></div><button type="button" disabled={busy} onClick={onCancel}>Tutup</button></header>
    {copied && <p className="tt-notice">Salinan mengambil nama dan kolom publik saja. Isi instruksi sendiri; prompt internal dan aturan eksekusi template bawaan tidak disalin. Kolom pilihan/tanggal/referensi diubah menjadi teks.</p>}
    <fieldset disabled={busy}><label>Nama template<input required maxLength={150} value={value.name} onChange={change('name')} placeholder="Mis. Carousel edukasi produk"/></label>
      <label>Deskripsi singkat<textarea rows={2} maxLength={500} value={value.description} onChange={change('description')}/></label>
      <div className="tt-division-settings"><h3>Tersedia untuk divisi</h3>
        <p className="tt-muted">Pilih beberapa divisi, atau gunakan Umum agar template bisa dipakai semua agen.</p>
        <button type="button" className="tt-scope-all" aria-pressed={!value.divisionIds?.length} onClick={()=>onChange({...value,divisionIds:[]})}><span aria-hidden="true">{!value.divisionIds?.length ? '✓' : '○'}</span><span>Umum · semua divisi<small>Tidak dibatasi divisi tertentu</small></span></button>
        <div className="tt-division-options">{divisions.map(d => <label className={`tt-checkbox tt-division-option${value.divisionIds?.includes(d.id) ? ' is-selected' : ''}`} key={d.id}><input type="checkbox" checked={value.divisionIds?.includes(d.id) || false} onChange={e => onChange({...value,divisionIds:e.target.checked?[...(value.divisionIds || []),d.id]:(value.divisionIds || []).filter(id=>id!==d.id)})}/><span>{d.name}</span></label>)}</div>
        <p className="tt-scope-summary" role="status">{value.divisionIds?.length ? `${value.divisionIds.length} divisi dipilih. Template hanya muncul untuk agen di divisi tersebut.` : 'Umum dipilih. Template tersedia untuk semua divisi.'}</p>
        {(value.divisionIds || []).some(id=>!divisions.some(d=>d.id===id)) && <p className="tt-muted">Ada divisi yang sudah tidak aktif. Pilih ulang divisi atau jadikan template umum sebelum menyimpan.</p>}
      </div>
      <label>Instruksi tugas<textarea required rows={5} maxLength={8000} value={value.instructions} onChange={change('instructions')} placeholder="Jelaskan tujuan, langkah kerja, gaya bahasa, dan hasil yang diharapkan."/></label>
      <p className="tt-field-help">Arahan tetap untuk AI setiap kali template dipakai. Contoh: buat carousel edukasi 7 slide dengan bahasa santai, berdasarkan topik yang diisi pengguna.</p>
      <label>Format hasil<input required maxLength={100} value={value.outputFormat} onChange={change('outputFormat')} placeholder="Mis. Carousel 7 slide"/></label>
      <p className="tt-field-help">Bentuk draft yang diinginkan, misalnya Dokumen, Caption, atau Carousel 7 slide. Ini bukan pilihan unduh PDF/PPT.</p>
      <div className="tt-fields-heading"><h3>Kolom input <small>{value.fields.length}/12</small></h3><button type="button" disabled={value.fields.length >= 12} onClick={() => {
        let n = 1; while (value.fields.some(f => f.name === `input_${n}`)) n++;
        onChange({ ...value, fields: [...value.fields, { name: `input_${n}`, label: '', type: 'text', required: true }] });
      }}>+ Tambah kolom</button></div>
      <p className="tt-muted">Form yang diisi pengguna saat menjalankan template, maksimal 12 kolom. Contoh: Topik konten, Target audiens, dan Jumlah slide.</p>
      {!value.fields.length && <p className="tt-fields-empty">Belum ada kolom input. Tambahkan kolom jika AI membutuhkan informasi berbeda untuk setiap tugas.</p>}
      {value.fields.map((field, index) => <section className="tt-field-card" key={index} aria-label={`Pengaturan kolom ${index + 1}`}>
        <div className="tt-field-card-heading"><h4>Kolom {index + 1}</h4><button type="button" aria-label={`Hapus kolom ${index + 1}`} onClick={() => onChange({ ...value, fields: value.fields.filter((_, i) => i !== index) })}>Hapus</button></div>
        <div className="tt-field-row">
          <label>Label<input required maxLength={100} value={field.label} placeholder="Mis. Topik konten" onChange={e => fieldChange(index, { label: e.target.value })}/><small>Nama kolom yang terlihat oleh pengguna.</small></label>
          <label>Kunci (ID kolom)<input required maxLength={40} pattern="[a-z][a-z0-9_]{0,39}" title="Gunakan huruf kecil, angka, atau garis bawah; awali dengan huruf. Kunci harus unik." value={field.name} placeholder="Mis. topik_konten" onChange={e => fieldChange(index, { name: e.target.value })}/><small>ID unik: huruf kecil, angka, atau garis bawah; tanpa spasi.</small></label>
          <label>Jenis<select value={field.type} onChange={e => fieldChange(index, { type: e.target.value })}><option value="text">Teks</option><option value="textarea">Teks panjang</option><option value="number">Angka</option></select><small>Teks singkat, uraian panjang, atau angka.</small></label>
        </div>
        <label className="tt-checkbox tt-required-option"><input type="checkbox" checked={field.required} onChange={e => fieldChange(index, { required: e.target.checked })}/><span>Wajib diisi<small>Tugas tidak dapat dikirim jika kolom ini kosong.</small></span></label>
      </section>)}
    </fieldset><footer><button type="button" disabled={busy} onClick={onCancel}>Batal</button><button className="tt-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan template'}</button></footer>
  </form>;
}

export function TemplateLibrary({ data, tab, search, onTab, onSearch, onCreate, onEdit, onCopy, onArchive, onInspect, busy, divisionFilter = '', onDivisionFilter = () => {} }) {
  const divisions = data.divisions || [];
  const rows = (tab === 'custom' ? data.templates : data.builtins).filter(t => `${t.name} ${t.description}`.toLocaleLowerCase('id').includes(search.toLocaleLowerCase('id')) && (!divisionFilter || (divisionFilter==='general' ? !t.divisionIds?.length && !t.divisionTemplateIds?.length : templateMatchesDivision(t,divisions.find(d=>d.id===divisionFilter)))));
  return <><header className="tt-heading"><div><span className="tt-eyebrow">KELOLA WORKSPACE</span><h1>Template Tugas</h1><p>Simpan arahan kerja yang bisa digunakan kembali oleh tim Anda.</p></div>{data.canManage && <button className="tt-primary" disabled={busy} onClick={onCreate}>+ Buat template</button>}</header>
    <p className="tt-notice">Klik Gunakan template untuk membuat tugas langsung, atau buka <a href="/dashboard/jobs">Tugas → Buat tugas</a>. Di kantor, pilih agen lalu Buat tugas. Pilih model aktif; hasil masuk sebagai draft ke Board.</p>
    <div className="tt-toolbar"><div role="tablist" aria-label="Jenis template">{[['custom', 'Template saya', data.templates.length], ['builtin', 'Bawaan', data.builtins.length]].map(([id, label, count]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => onTab(id)}>{label} <span>{count}</span></button>)}</div><input aria-label="Cari template" placeholder="Cari template…" value={search} onChange={e => onSearch(e.target.value)}/></div>
    <label className="tt-division-filter">Filter divisi<select value={divisionFilter} onChange={e=>onDivisionFilter(e.target.value)}><option value="">Semua divisi</option><option value="general">Umum saja</option>{divisions.map(d=><option key={d.id} value={d.id}>{d.name} + umum</option>)}</select></label>
    {!data.canManage && <p className="tt-muted">Anda dapat melihat template. Pengelolaan tersedia untuk owner dan admin workspace.</p>}
    {!rows.length && <div className="tt-empty"><h2>{search ? 'Template tidak ditemukan' : 'Belum ada template custom'}</h2><p>{search ? 'Coba kata kunci lain.' : 'Mulai dari template kosong atau salin struktur template bawaan.'}</p></div>}
    <div className="tt-grid">{rows.map(template => <article className="tt-card" key={template.id}><span className="tt-tag">{tab === 'builtin' ? 'Bawaan · hanya baca' : `Custom · v${template.version}`}</span><h2>{template.name}</h2><p>{template.description || 'Belum ada deskripsi.'}</p><div className="tt-meta">{template.outputFormat} · {template.fields.length} kolom input</div><footer><a className="tt-use-template" href={templateTaskPath(template,tab==='builtin')}>Gunakan template</a><button onClick={() => onInspect(template)}>Lihat detail</button>{data.canManage && (tab === 'builtin' ? <button disabled={busy} onClick={() => onCopy(template)}>Salin struktur</button> : <><button disabled={busy} onClick={() => onEdit(template)}>Edit</button><button disabled={busy} onClick={() => onArchive(template)}>Arsipkan</button></>)}</footer></article>)}</div>
  </>;
}

export function TaskTemplates() {
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [tab, setTab] = useState('custom'), [search, setSearch] = useState(''), [retry, setRetry] = useState(0);
  const [divisionFilter,setDivisionFilter]=useState('');
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
    {data && <TemplateLibrary data={data} tab={tab} search={search} divisionFilter={divisionFilter} onDivisionFilter={setDivisionFilter} onTab={setTab} onSearch={setSearch} busy={busy} onCreate={() => edit(emptyTemplate())} onEdit={edit} onCopy={t => { edit({...draftFromBuiltin(t),divisionIds:(data.divisions || []).filter(d=>templateMatchesDivision(t,d)).map(d=>d.id)}); setCopied(true); }} onInspect={setInspect} onArchive={setArchive}/>}
    {inspect && <article className="tt-editor"><header><h2>{inspect.name}</h2><button onClick={() => setInspect(null)}>Tutup detail</button></header><p>{inspect.description}</p>{inspect.instructions && <p className="tt-instructions">{inspect.instructions}</p>}<h3>Kolom input</h3><ul>{inspect.fields.map(f => <li key={f.name}>{f.label} · {f.type}{f.required ? ' · wajib' : ''}</li>)}</ul><p>Format: {inspect.outputFormat}</p></article>}
    {editor && <div ref={editorAnchor}><TemplateEditor value={editor} divisions={data?.divisions || []} onChange={setEditor} busy={busy} copied={copied} onCancel={() => setEditor(null)} onSubmit={e => {
      e.preventDefault();
      try { const body = { name: editor.name, description: editor.description, instructions: editor.instructions, outputFormat: editor.outputFormat, fields: editor.fields, divisionIds:editor.divisionIds || [], ...(editor.id ? { version: editor.version } : {}) }; templateInput(body, !!editor.id); void mutate(editor.id ? `/${editor.id}` : '', editor.id ? 'PATCH' : 'POST', body); } catch (failure) { setError(failure.message); }
    }}/></div>}
    {archive && <div className="tt-editor" role="alertdialog" aria-label="Konfirmasi arsip template"><h2>Arsipkan “{archive.name}”?</h2><p>Template tidak muncul di daftar aktif. Data tetap tersimpan di database; tugas dan riwayat lama tidak dihapus.</p><footer><button disabled={busy} onClick={() => setArchive(null)}>Batal</button><button disabled={busy} onClick={() => void mutate(`/${archive.id}/archive`, 'POST', { version: archive.version })}>Ya, arsipkan</button></footer></div>}
  </section>;
}
