import React, { useEffect, useRef, useState } from 'react';
import { JOBS, TYPE_LABEL } from '../../shared/jobs.js';
import { DashboardBoard } from './reference/dashboard.jsx';
import { workApi, workPermissions } from './work-api.js';
import './tenant-work.css';

const dateLabel = (value) => value && !Number.isNaN(new Date(value).getTime())
  ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const definitions = Object.fromEntries(JOBS.map((job) => [job.id, job]));
const statusNames = { generating: 'Sedang berjalan', done: 'Selesai', failed: 'Gagal', draft: 'Draft', revising: 'Sedang direvisi', approved: 'Disetujui', rejected: 'Ditolak' };
const statusStyle = (status) => ({ sbg: `var(--${status === 'approved' || status === 'done' ? 'ok' : status === 'failed' || status === 'rejected' ? 'err' : 'warn'}Soft)`, sink: `var(--${status === 'approved' || status === 'done' ? 'ok' : status === 'failed' || status === 'rejected' ? 'err' : 'warn'})` });

function useWorkData(kind, id = null, refreshKey = 0) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    setState({ loading: true, data: null, error: null });
    const load = async () => {
      try {
        let data;
        if (kind === 'detail') {
          const [detail, history] = await Promise.all([workApi.detail(id, controller.signal), workApi.revisions(id, controller.signal)]);
          if (!detail.item || !Array.isArray(history.revisions)) throw new Error('Respons item tidak valid.');
          data = { ...detail.item, revisions: history.revisions };
        } else if (kind === 'choices') {
          const [clients, items] = await Promise.all([workApi.clients(controller.signal), workApi.items(controller.signal)]);
          if (!Array.isArray(clients.clients) || !Array.isArray(items.items)) throw new Error('Respons pilihan tidak valid.');
          data = { clients: clients.clients, items: items.items };
        } else {
          const result = await workApi[kind](controller.signal);
          if (!Array.isArray(result[kind])) throw new Error('Respons daftar tidak valid.');
          data = result[kind];
        }
        if (controller.signal.aborted) return;
        setState({ loading: false, data, error: null });
        // Poll only mounted lists; stop on any error, never replay a mutation.
        if (kind === 'jobs' || kind === 'items' || (kind === 'detail' && data.status === 'revising')) timer = setTimeout(load, 8000);
      } catch (error) {
        if (!controller.signal.aborted) setState({ loading: false, data: null, error });
      }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [kind, id, retry, refreshKey]);
  return { ...state, reload: () => setRetry((value) => value + 1) };
}

export function WorkNotice({ error, loading, onRetry }) {
  return <section className="work-notice" role={error ? 'alert' : 'status'}>
    <p>{loading ? 'Memuat data workspace…' : error?.message || 'Workspace aktif diperlukan untuk melanjutkan.'}</p>
{error?.status === 401 ? <a className="work-button btnp" href="/login">Login kembali</a>
      : onRetry && <button className="work-button btns" onClick={onRetry}>Coba lagi</button>}
  </section>;
}

export function TenantWork({ section, profile, sessionState, onNavigate }) {
  if (sessionState.loading || sessionState.error) return <WorkNotice {...sessionState} onRetry={() => window.location.reload()} />;
  if (!profile?.activeWorkspace) return <WorkNotice error={{ message: 'Pilih workspace melalui akun Anda, atau selesaikan onboarding terlebih dahulu.' }} />;
  return section === 'board' ? <TenantBoard role={profile.activeWorkspace.role} onNavigate={onNavigate} />
    : <TenantJobs role={profile.activeWorkspace.role} onNavigate={onNavigate} />;
}

function PageHeading({ title, description, children }) {
  return <div className="work-heading"><div><h1>{title}</h1><p>{description}</p></div><div className="work-actions">{children}</div></div>;
}

function TenantJobs({ role, onNavigate }) {
  const jobs = useWorkData('jobs');
  const [filter, setFilter] = useState('all');
  const [composer, setComposer] = useState(false);
  const [createdId, setCreatedId] = useState(null);
  const permissions = workPermissions(role);
  if (jobs.loading || jobs.error) return <WorkNotice {...jobs} onRetry={jobs.reload} />;
  const visible = jobs.data.filter((job) => filter === 'all' || job.status === filter);
  return <>
    <PageHeading title="Perintah" description="Kirim pekerjaan ke agent dan ikuti statusnya di workspace aktif.">
      <button className="work-button btns" onClick={() => onNavigate('/app/board')}>Lihat board</button>
      {permissions.create && <button className="work-button btnp" onClick={() => setComposer(true)}>Perintah baru</button>}
    </PageHeading>
    {!permissions.create && <p className="work-hint">Hanya owner atau admin workspace yang dapat membuat perintah. Anda tetap dapat melihat status pekerjaan.</p>}
    {createdId && <div className="work-notice" role="status">Perintah #{createdId} diterima. Hasil akan tersedia di Board setelah proses selesai.</div>}
    <section className="work-panel" aria-label="Daftar perintah">
      <div className="work-tabs" role="tablist" aria-label="Status perintah">{[['all', 'Semua'], ['generating', 'Berjalan'], ['done', 'Selesai'], ['failed', 'Gagal']].map(([id, label]) => <button role="tab" aria-selected={filter === id} key={id} onClick={() => setFilter(id)}>{label}<span>{jobs.data.filter((job) => id === 'all' || job.status === id).length}</span></button>)}</div>
      {visible.length ? visible.map((job) => <article className="work-job" key={job.id}>
        <span className="work-avatar">{(job.agentId || 'AI').slice(0, 2).toUpperCase()}</span>
        <div className="work-job-title"><h2>{definitions[job.jobType]?.label || job.jobType}</h2><p>#{job.id} · {job.clientName || 'Tanpa client'} · {job.agentId || 'Agent'}</p>{job.failed && <p className="work-error">Pekerjaan tidak dapat diselesaikan. Tidak ada pengiriman ulang otomatis.</p>}</div>
        <time>{dateLabel(job.createdAt)}</time><span className="work-badge" style={{ background: statusStyle(job.status).sbg, color: statusStyle(job.status).sink }}>{statusNames[job.status] || job.status}</span>
        {job.status === 'done' && <button className="work-button btns" onClick={() => onNavigate('/app/board')}>Lihat hasil</button>}
      </article>) : <p className="work-empty">Belum ada perintah di tab ini.</p>}
    </section>
    <p className="work-hint">Menampilkan hingga 50 perintah terbaru. Status diperbarui otomatis setiap 8 detik selama halaman terbuka.</p>
    {composer && <JobComposer onCancel={() => setComposer(false)} onCreated={(id) => { setCreatedId(id); setComposer(false); jobs.reload(); }} />}
  </>;
}

const defaultParams = (definition) => Object.fromEntries(definition.fields.map((field) => [field.name,
  field.type === 'multi' ? [...(field.default || [])] : field.default ?? (field.type === 'select' ? field.options[0] : field.type === 'number' ? field.min || 1 : '')]));

function JobComposer({ onCancel, onCreated }) {
  const choices = useWorkData('choices');
  const [definition, setDefinition] = useState(JOBS[0]);
  const [params, setParams] = useState(() => defaultParams(JOBS[0]));
  const [clientId, setClientId] = useState('');
  const [state, setState] = useState({ busy: false, error: null });
  const pending = useRef(null);
  const formRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    formRef.current?.focus();
    return () => { pending.current?.abort(); previous?.focus(); };
  }, []);
  const setValue = (name, value) => setParams((current) => ({ ...current, [name]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (pending.current || !choices.data) return;
    if (definition.anyOf && !definition.anyOf.some((field) => params[field])) {
      setState({ busy: false, error: { message: 'Isi salah satu bahan dasar atau topik yang diperlukan.' } }); return;
    }
    const controller = new AbortController(); pending.current = controller;
    setState({ busy: true, error: null });
    try {
      const result = await workApi.createJob({ jobType: definition.id, clientId: Number(clientId) || null, params }, controller.signal);
      if (!controller.signal.aborted) onCreated(result.jobId);
    } catch (error) {
      if (!controller.signal.aborted) setState({ busy: false, error });
    } finally { if (pending.current === controller) pending.current = null; }
  };
  const close = () => { if (!pending.current) onCancel(); };
  const trapFocus = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key !== 'Tab') return;
    const nodes = [...event.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')];
    if (!nodes.length) return;
    if (event.shiftKey && (document.activeElement === nodes[0] || document.activeElement === formRef.current)) { event.preventDefault(); nodes.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
  };
  const denied = [401, 403].includes(state.error?.status);
  return <div className="work-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <form ref={formRef} tabIndex={-1} className="work-dialog work-panel" role="dialog" aria-modal="true" aria-labelledby="work-composer-title" onSubmit={submit} onKeyDown={trapFocus}>
      <h2 id="work-composer-title">Perintah baru</h2><p className="work-hint">Hasil kerja agent akan masuk sebagai draft di Board.</p>
      {choices.loading || choices.error ? <WorkNotice {...choices} onRetry={choices.reload} /> : <fieldset disabled={state.busy || denied}>
        <label>Jenis pekerjaan<select value={definition.id} onChange={(event) => { const next = definitions[event.target.value]; setDefinition(next); setParams(defaultParams(next)); setState({ busy: false, error: null }); }}>{JOBS.map((job) => <option key={job.id} value={job.id}>{job.label}</option>)}</select></label>
        <p className="work-hint">{definition.desc}</p>
        <label>Client (opsional)<select value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">Tanpa client</option>{choices.data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <div className="work-fields">{definition.fields.map((field) => <JobField key={`${definition.id}:${field.name}`} field={field} value={params[field.name]} items={choices.data.items} setValue={setValue} />)}</div>
      </fieldset>}
      {state.error && <WorkNotice error={state.error} />}
      <footer className="work-actions"><button type="button" className="work-button btns" disabled={state.busy} onClick={close}>Batal</button><button className="work-button btnp" disabled={!choices.data || state.busy || denied}>{state.busy ? 'Mengirim…' : 'Kirim perintah'}</button></footer>
    </form>
  </div>;
}

function JobField({ field, value, items, setValue }) {
  const change = (event) => setValue(field.name, event.target.value);
  const title = `${field.label}${field.required ? ' *' : ''}`;
  if (field.type === 'multi') return <fieldset className="work-multi"><legend>{title}</legend>{field.options.map((option) => <label key={option}><input type="checkbox" checked={value.includes(option)} onChange={(event) => setValue(field.name, event.target.checked ? [...value, option] : value.filter((entry) => entry !== option))} />{option}</label>)}</fieldset>;
  if (field.type === 'textarea') return <label className="work-wide">{title}<textarea required={field.required} maxLength={field.limit || 8000} placeholder={field.placeholder} rows={4} value={value} onChange={change} /></label>;
  if (field.type === 'select') return <label>{title}<select value={value} onChange={change}>{field.options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  if (field.type === 'item') return <label>{title}<select value={value} onChange={change}><option value="">Tanpa bahan dasar</option>{items.filter((item) => item.type === field.itemType).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>;
  return <label>{title}<input required={field.required} type={field.type === 'number' || field.type === 'month' ? field.type : 'text'} min={field.min} max={field.max} maxLength={300} value={value} onChange={change} placeholder={field.placeholder} /></label>;
}

function TenantBoard({ role, onNavigate }) {
  const items = useWorkData('items');
  const [tab, setTab] = useState('draft');
  const [selectedId, setSelectedId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mutation, setMutation] = useState({ busy: false, error: null, message: '' });
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  const permissions = workPermissions(role);
  if (items.loading || items.error) return <WorkNotice {...items} onRetry={items.reload} />;
  if ([401, 403].includes(mutation.error?.status)) return <WorkNotice error={mutation.error} onRetry={() => { setMutation({ busy: false, error: null, message: '' }); items.reload(); }} />;
  const visible = items.data.filter((item) => tab === 'all' || item.status === tab || (tab === 'draft' && item.status === 'revising'));
  const selected = visible.find((item) => item.id === selectedId) || visible[0];
  const mutate = async (action, item, review) => {
    if (pending.current) return false;
    if (action === 'remove' && !window.confirm(`Hapus "${item.title}" dari Board? Item akan dihapus secara soft-delete.`)) return false;
    const controller = new AbortController(); pending.current = controller;
    setMutation({ busy: true, error: null, message: '' });
    try {
      if (action === 'reject' || action === 'revise') await workApi[action](item.id, { reason: review.reason, version: item.version }, controller.signal);
      else await workApi[action](item.id, controller.signal);
      if (!controller.signal.aborted) {
        const messages = { approve: 'Item berhasil disetujui.', reject: 'Item ditolak. Alasan tersimpan.', revise: 'Permintaan revisi diterima. Konten lama tetap tersimpan selama proses berjalan.', remove: 'Item dipindahkan dari Board.' };
        setMutation({ busy: false, error: null, message: messages[action] });
        setRefreshKey((key) => key + 1); items.reload();
        return true;
      }
    } catch (error) {
      if (!controller.signal.aborted) setMutation({ busy: false, error, message: '' });
      return false;
    } finally { if (pending.current === controller) pending.current = null; }
  };
  const vals = {
    v: { jobs: true }, goAgents: () => onNavigate('/app/jobs'),
    jobTabs: [['draft', 'Draft'], ['approved', 'Disetujui'], ['rejected', 'Ditolak'], ['all', 'Semua']].map(([id, label]) => ({
      label, on: tab === id, count: items.data.filter((item) => id === 'all' || item.status === id || (id === 'draft' && item.status === 'revising')).length,
      line: tab === id ? 'var(--accent)' : 'transparent', ink: tab === id ? 'var(--accentText)' : 'var(--mute)', pick: () => { if (!mutation.busy) { setTab(id); setSelectedId(null); } },
    })),
    jobRows: visible.map((item) => ({ ...statusStyle(item.status),
      title: item.title, type: TYPE_LABEL[item.type] || item.type, ver: item.version ?? '—', agent: item.agentId || 'Agent', when: dateLabel(item.updatedAt), ini: (item.agentId || 'AI').slice(0, 2).toUpperCase(), tint: 'var(--accentSoft)',
      status: statusNames[item.status] || item.status, on: item.id === selected?.id,
      edge: item.id === selected?.id ? 'var(--accent)' : 'transparent', bg: item.id === selected?.id ? 'var(--accentSoft)' : 'transparent',
      pick: () => { if (!mutation.busy) { setSelectedId(item.id); setMutation({ busy: false, error: null, message: '' }); } },
    })),
    jobsEmpty: !visible.length,
    // Use the exported board list unchanged, with a real, independently loaded detail panel.
    detailPanel: selected ? <ItemDetail key={selected.id} id={selected.id} refreshKey={`${refreshKey}:${selected.version}:${selected.status}`} permissions={permissions} mutation={mutation} mutate={mutate} />
      : <aside className="work-panel work-detail work-empty">Pilih item untuk meninjau hasil agent.</aside>,
  };
  return <>{mutation.message && <div className="work-notice" role="status">{mutation.message}</div>}{mutation.error && <WorkNotice error={mutation.error} onRetry={mutation.error.status === 409 ? () => { setMutation({ busy: false, error: null, message: '' }); items.reload(); } : undefined} />}<DashboardBoard vals={vals} /><p className="work-hint">Menampilkan hingga 100 item terbaru di workspace aktif. Data lama tanpa ownership tidak ditampilkan. Revisi dan penolakan hanya tersedia untuk owner, admin, atau member.</p></>;
}

function FieldValue({ field }) {
  if (Array.isArray(field.value)) return <ul>{field.value.map((value, index) => <li key={index}>{typeof value === 'string' ? value : JSON.stringify(value)}</li>)}</ul>;
  return field.kind === 'code' ? <pre><code>{String(field.value ?? '')}</code></pre> : <p className="work-text">{typeof field.value === 'object' ? JSON.stringify(field.value) : String(field.value ?? '')}</p>;
}

function ItemDetail({ id, refreshKey, permissions, mutation, mutate }) {
  const detail = useWorkData('detail', id, refreshKey);
  const [copyState, setCopyState] = useState('');
  const [reviewAction, setReviewAction] = useState(null);
  const [reason, setReason] = useState('');
  if (detail.loading || detail.error) return <aside className="work-panel work-detail"><WorkNotice {...detail} onRetry={detail.reload} /></aside>;
  const item = detail.data;
  const fields = Array.isArray(item.content?.fields) ? item.content.fields : [];
  const copy = async () => {
    try { await navigator.clipboard.writeText([item.title, ...fields.map((field) => `${field.label}\n${Array.isArray(field.value) ? field.value.join('\n') : String(field.value ?? '')}`)].join('\n\n')); setCopyState('Teks disalin.'); }
    catch { setCopyState('Tidak dapat menyalin. Pilih teks dan salin secara manual.'); }
  };
  return <aside className="work-panel work-detail" aria-label="Detail item">
    <div className="work-actions"><span className="work-badge">{TYPE_LABEL[item.type] || item.type}</span><span className="work-badge" style={{ background: statusStyle(item.status).sbg, color: statusStyle(item.status).sink }}>{statusNames[item.status] || item.status}</span><span className="work-hint">Versi {item.version}</span></div>
    <div><h2>{item.title}</h2><p className="work-hint">{item.agentId} · {dateLabel(item.updatedAt)}</p></div>
    <div className="work-content">{fields.length ? fields.map((field, index) => <section key={index}><h3>{field.label}</h3><FieldValue field={field} /></section>) : <p>Belum ada konten terstruktur.</p>}</div>
    {item.status === 'revising' && <p className="work-notice" role="status">Agent sedang merevisi. Konten di atas adalah versi sebelumnya. Jangan kirim ulang; status diperbarui otomatis.</p>}
    {item.lastError && <p className="work-notice" role="alert">{item.lastError}</p>}
    {item.rejectReason && <section><h3>Alasan penolakan</h3><p className="work-text">{item.rejectReason}</p></section>}
    <div className="work-actions"><button className="work-button btnp" disabled={!permissions.approve || mutation.busy || ['approved', 'revising'].includes(item.status)} onClick={() => mutate('approve', item)}>Setujui</button><button className="work-button btns" disabled={!permissions.approve || mutation.busy || item.status === 'revising'} onClick={() => { setReviewAction('revise'); setReason(''); }}>Minta revisi</button><button className="work-button btns work-error" disabled={!permissions.approve || mutation.busy || ['rejected', 'revising'].includes(item.status)} onClick={() => { setReviewAction('reject'); setReason(''); }}>Tolak</button></div>
    {reviewAction && permissions.approve && item.status !== 'revising' && <form className="work-review-form" aria-label={reviewAction === 'revise' ? 'Permintaan revisi' : 'Penolakan item'} onSubmit={async (event) => { event.preventDefault(); if (await mutate(reviewAction, item, { reason })) setReviewAction(null); }}>
      <label>{reviewAction === 'revise' ? 'Alasan revisi' : 'Alasan penolakan'}<textarea autoFocus required minLength={3} maxLength={reviewAction === 'revise' ? 2000 : 500} value={reason} disabled={mutation.busy} onChange={(event) => setReason(event.target.value)} rows={4} /></label>
      <p className="work-hint">{reviewAction === 'revise' ? 'Hasil revisi yang berhasil akan menjadi draft baru; versi sebelumnya masuk ke riwayat.' : 'Konten tidak dihapus. Alasan penolakan disimpan pada item.'}</p>
      <div className="work-actions"><button type="button" className="work-button btns" disabled={mutation.busy} onClick={() => setReviewAction(null)}>Batal</button><button className="work-button btnp" disabled={mutation.busy || reason.trim().length < 3}>{mutation.busy ? 'Mengirim…' : reviewAction === 'revise' ? 'Kirim revisi' : 'Konfirmasi penolakan'}</button></div>
    </form>}
    <button className="work-button btns" onClick={copy}>Salin teks</button>{copyState && <p role="status" className="work-hint">{copyState}</p>}
    <section aria-label="Riwayat revisi"><h3>Riwayat revisi</h3>{item.revisions.length ? <ol className="work-history">{item.revisions.map((revision) => <li key={revision.id}><b>Versi {revision.version}</b><time>{dateLabel(revision.createdAt)}</time><p className="work-text">{revision.reason}</p></li>)}</ol> : <p className="work-hint">Belum ada riwayat revisi.</p>}</section>
    {permissions.remove && <button className="work-button btns work-error" disabled={mutation.busy || item.status === 'revising'} onClick={() => mutate('remove', item)}>Hapus item</button>}
    {mutation.busy && <p role="status" className="work-hint">Menyimpan perubahan…</p>}
  </aside>;
}
