import React, { useEffect, useRef, useState } from 'react';
import { workApi } from './work-api.js';
import './tenant-work.css';
import { agentTemplateDivision, templateMatchesDivision } from '../../shared/task-templates.js';

export function templatesForAgent(data, agentId) {
  const division = agentTemplateDivision(data, agentId);
  const filter = t => templateMatchesDivision(t, division);
  return { templates: data.templates.filter(filter), builtins: data.builtins.filter(filter) };
}

export function taskTemplateSelection(data,id){
  const template=id.startsWith('builtin:')?data.builtins.find(t=>`builtin:${t.id}`===id):data.templates.find(t=>t.id===id);
  return template?{template:id,values:Object.fromEntries(template.fields.filter(f=>f.default!==undefined).map(f=>[f.name,f.default]))}:null;
}

export function WorkspaceTaskFields({ data, form, setForm, lockedAgent }) {
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const available = templatesForAgent(data, form.agentId);
  const division = agentTemplateDivision(data, form.agentId);
  const template = form.template.startsWith('builtin:') ? data.builtins.find(t => `builtin:${t.id}` === form.template) : data.templates.find(t => t.id === form.template);
  const model = data.models.find(m => m.id === form.modelId);
  return <>
    <div className="task-mode-note">Pilih agen Anda, tulis tugas, lalu tinjau draft di Board. Agen tidak melakukan pengiriman atau aksi di luar aplikasi.</div>
    <label>Agen pelaksana<select required disabled={!!lockedAgent} value={form.agentId} onChange={e => { const agentId = e.target.value; setForm(current => ({ ...current, agentId, ...(!template || templateMatchesDivision(template, agentTemplateDivision(data, agentId)) ? {} : { template: '', values: {} }) })); }}><option value="">Pilih agen</option>{data.agents.map(a => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}</select></label>
    {!data.agents.length && <p className="work-notice">Belum ada agen yang dapat Anda gunakan. Minta admin tenant menugaskan divisi/agen. Owner/admin dapat mengaturnya melalui <a href="/dashboard/team" target="_top">Kelola Tim</a>.</p>}
    <label>Mulai dari<select disabled={!form.agentId} value={form.template} onChange={e => { setForm(current => ({ ...current, template: e.target.value, values: Object.fromEntries((e.target.value.startsWith('builtin:') ? available.builtins.find(t => `builtin:${t.id}` === e.target.value) : available.templates.find(t => t.id === e.target.value))?.fields.filter(f => f.default !== undefined).map(f => [f.name, f.default]) || []) })); }}><option value="">Tugas bebas</option><optgroup label="Template workspace · divisi & umum">{available.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup><optgroup label="Template bawaan · divisi">{available.builtins.map(t => <option key={t.id} value={`builtin:${t.id}`}>{t.name}</option>)}</optgroup></select></label>
    <p className="work-hint">{!form.agentId ? 'Pilih agen terlebih dahulu untuk melihat template divisinya.' : `Menampilkan template ${division?.name || 'divisi agen'} dan template umum. Tugas bebas tetap tersedia.`}</p>
    <label>Judul tugas<input required maxLength={150} placeholder="Mis. Carousel promosi aplikasi barista" value={form.title} onChange={e => set('title', e.target.value)}/></label>
    <label>{template ? 'Arahan tambahan (opsional)' : 'Instruksi tugas'}<textarea required={!template} maxLength={8000} rows={4} placeholder="Jelaskan hasil yang Anda inginkan, target audiens dan detail penting." value={form.instructions} onChange={e => set('instructions', e.target.value)}/></label>
    {template && <div className="task-inputs"><p className="work-hint">{template.description || template.name}</p><p className="work-hint">Hasil berupa satu draft di Board, termasuk jika berisi beberapa ide. Periksa hasil sebelum digunakan.</p>{template.fields.map(f => <label key={f.name}>{f.label}{f.required ? ' *' : ''}{f.type === 'multi' ? <select multiple aria-label={f.label} value={form.values[f.name] || f.default || []} onChange={e => set('values', { ...form.values, [f.name]: [...e.target.selectedOptions].map(o => o.value) })}>{f.options.map(o => <option key={o} value={o}>{o}</option>)}</select> : f.type === 'select' ? <select required={f.required} value={form.values[f.name] || ''} onChange={e => set('values', { ...form.values, [f.name]: e.target.value })}><option value="">Pilih</option>{f.options.map(o => <option key={o} value={o}>{o}</option>)}</select> : f.type === 'textarea' ? <textarea rows={3} required={f.required} maxLength={8000} value={form.values[f.name] || ''} onChange={e => set('values', { ...form.values, [f.name]: e.target.value })}/> : <input required={f.required} type={f.type === 'number' ? 'number' : f.type === 'month' ? 'month' : 'text'} disabled={f.type === 'item'} placeholder={f.type === 'item' ? 'Isi topik tugas secara langsung' : f.placeholder} min={f.min} max={f.max} maxLength={8000} value={form.values[f.name] || ''} onChange={e => set('values', { ...form.values, [f.name]: e.target.value })}/>}</label>)}</div>}
    <label>Klien (opsional)<select value={form.clientId} onChange={e => set('clientId', e.target.value)}><option value="">Tanpa klien</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Model AI<select required value={form.modelId} onChange={e => set('modelId', e.target.value)}><option value="">Pilih model aktif</option>{data.models.map(m => <option key={m.id} value={m.id}>{m.label} · {m.costLabel}</option>)}</select></label>
    <p className="work-hint">{model?.description || 'Model nonaktif tidak ditampilkan.'} Saldo AI organisasi digunakan sesuai token dan tarif aktif. Sebagian saldo ditahan sementara sebelum permintaan dikirim.</p>
  </>;
}
export function WorkspaceTaskComposer({ onCancel, onCreated, agentId = '', clientId = '', initialTemplate = '', embedded = false, api = workApi }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const [form, setForm] = useState({ agentId, clientId, template: '', title: '', instructions: '', values: {}, modelId: '' });
  const inaccessibleAgent = Boolean(data && agentId && !data.agents.some(agent => agent.id === agentId));
  const requestKey = useRef(null), submitFlight = useRef(false), pending = useRef(null), root = useRef(null);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError('');
    api.taskOptions(controller.signal).then(body => { if (!controller.signal.aborted) {
      setData(body);
      if(initialTemplate){const selected=taskTemplateSelection(body,initialTemplate);if(selected){
        const template=initialTemplate.startsWith('builtin:')?body.builtins.find(t=>`builtin:${t.id}`===initialTemplate):body.templates.find(t=>t.id===initialTemplate);
        const candidate=agentId || body.agents.find(a=>templateMatchesDivision(template,agentTemplateDivision(body,a.id)))?.id;
        if(candidate && templateMatchesDivision(template,agentTemplateDivision(body,candidate)))setForm(current=>({...current,...selected,agentId:candidate}));
        else setError('Tidak ada agen dari divisi yang sesuai dengan template ini. Pilih agen dan template lain atau gunakan tugas bebas.');
      }else setError('Template tidak tersedia atau sudah diarsipkan. Pilih template lain atau gunakan tugas bebas.');}
    } }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [api, retry, initialTemplate, agentId]);
  useEffect(() => {
    const previous = document.activeElement; root.current?.focus();
    return () => { pending.current?.abort(); previous?.focus?.(); };
  }, []);
  const set = update => { if (!submitFlight.current) { requestKey.current = null; setForm(update); } };
  async function submit(e) {
    e.preventDefault(); if (submitFlight.current || !data?.canCreate || inaccessibleAgent) return;
    submitFlight.current = true; setBusy(true); setError(''); pending.current = new AbortController();
    requestKey.current ||= crypto.randomUUID();
    try {
      const result = await api.createWorkspaceJob({ agentId: form.agentId, title: form.title, instructions: form.instructions, values: form.values,
        templateId: form.template && !form.template.startsWith('builtin:') ? form.template : null, builtinId: form.template.startsWith('builtin:') ? form.template.slice(8) : null,
        clientId: Number(form.clientId) || null, modelId: form.modelId, requestKey: requestKey.current }, pending.current.signal);
      if (!pending.current.signal.aborted) onCreated(result.jobId);
    } catch (failure) { if (!pending.current.signal.aborted) setError(failure.message); }
    finally { submitFlight.current = false; if (!pending.current.signal.aborted) setBusy(false); }
  }
  const close = () => { if (!submitFlight.current) onCancel(); };
  const keyboard = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key !== 'Tab' || embedded) return;
    const nodes = [...root.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')];
    if (e.shiftKey && (document.activeElement === nodes[0] || document.activeElement === root.current)) { e.preventDefault(); nodes.at(-1)?.focus(); }
    else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus(); }
  };
  const content = <form ref={root} tabIndex={-1} className={embedded ? 'work-task-inline' : 'work-dialog work-panel'} role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : 'true'} aria-label="Buat tugas agen" onSubmit={submit} onKeyDown={keyboard}>
    <h2>Buat tugas</h2>
    {!data && !error && <p role="status">Memuat agen dan template…</p>}
    {error && <p className="work-notice" role="alert">{error}{!data && <button type="button" onClick={() => setRetry(n => n + 1)}>Coba lagi</button>}</p>}
    {data && <fieldset disabled={busy || !data.canCreate || inaccessibleAgent}><WorkspaceTaskFields data={data} form={form} setForm={set} lockedAgent={agentId}/></fieldset>}
    {inaccessibleAgent && <p role="alert">Agen ini tidak tersedia untuk akses Anda. Pilih agen lain atau hubungi admin tenant.</p>}
    {data && !data.canCreate && <p role="alert">Anda tidak memiliki izin membuat tugas. Hubungi admin tenant.</p>}
    {data && !data.models.length && <p role="alert">Belum ada model AI aktif yang dapat dipakai. Minta admin mengaktifkan model sebelum mengirim tugas.</p>}
    <footer className="work-actions"><button type="button" className="work-button btns" disabled={busy} onClick={close}>Batal</button><button className="work-button btnp" disabled={busy || inaccessibleAgent || !data?.canCreate || !data?.agents.length || !data?.models.length}>{busy ? 'Mengirim…' : 'Kirim tugas'}</button></footer>
  </form>;
  return embedded ? content : <div className="work-overlay" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>{content}</div>;
}
