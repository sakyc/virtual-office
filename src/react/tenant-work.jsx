import React, { useEffect, useRef, useState } from 'react';
import { JOBS, TYPE_LABEL } from '../../shared/jobs.js';
import { DashboardBoard } from './reference/dashboard.jsx';
import { workApi, workPermissions } from './work-api.js';
import './tenant-work.css';
import { WorkspaceTaskComposer } from './workspace-task-composer.jsx';

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
      <button className="work-button btns" onClick={() => onNavigate('/dashboard/board')}>Lihat board</button>
      {permissions.create && <button className="work-button btnp" onClick={() => setComposer(true)}>Perintah baru</button>}
    </PageHeading>
    {!permissions.create && <p className="work-hint">Viewer hanya dapat melihat status pekerjaan. Member dapat membuat tugas melalui agen yang ditugaskan oleh admin tenant.</p>}
    {createdId && <div className="work-notice" role="status">Perintah #{createdId} diterima. Hasil akan tersedia di Board setelah proses selesai.</div>}
    <section className="work-panel" aria-label="Daftar perintah">
      <div className="work-tabs" role="tablist" aria-label="Status perintah">{[['all', 'Semua'], ['generating', 'Berjalan'], ['done', 'Selesai'], ['failed', 'Gagal']].map(([id, label]) => <button role="tab" aria-selected={filter === id} key={id} onClick={() => setFilter(id)}>{label}<span>{jobs.data.filter((job) => id === 'all' || job.status === id).length}</span></button>)}</div>
      {visible.length ? visible.map((job) => <article className="work-job" key={job.id}>
        <span className="work-avatar">{(job.agentName || 'AI').slice(0, 2).toUpperCase()}</span>
        <div className="work-job-title"><h2>{job.title || definitions[job.jobType]?.label || job.jobType}</h2><p>#{job.id} · {job.clientName || 'Tanpa klien'} · {job.agentName || job.agentId || 'Agen'}</p>{job.model && <small className="work-hint">{job.model}</small>}{job.failed && <p className="work-error">{job.failure?.message || 'Penyebab rinci belum tercatat. Hubungi admin sebelum mencoba lagi.'} Tidak dikirim ulang otomatis.</p>}</div>
        <time>{dateLabel(job.createdAt)}</time><span className="work-badge" style={{ background: statusStyle(job.status).sbg, color: statusStyle(job.status).sink }}>{statusNames[job.status] || job.status}</span>
        {job.status === 'done' && <button className="work-button btns" onClick={() => onNavigate('/dashboard/board')}>Lihat hasil</button>}
      </article>) : <p className="work-empty">Belum ada perintah di tab ini.</p>}
    </section>
    <p className="work-hint">Menampilkan hingga 50 perintah terbaru. Status diperbarui otomatis setiap 8 detik selama halaman terbuka.</p>
    {composer && <WorkspaceTaskComposer onCancel={() => setComposer(false)} onCreated={(id) => { setCreatedId(id); setComposer(false); jobs.reload(); }} />}
  </>;
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
  const matchesTab = (item, id) => id === 'mine' ? item.canReview === true && item.status === 'draft' : id === 'all' || item.status === id || (id === 'draft' && item.status === 'revising');
  const visible = items.data.filter(item => matchesTab(item, tab));
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
    v: { jobs: true }, goAgents: () => onNavigate('/dashboard/jobs'),
    jobTabs: [['draft', 'Draft'], ['mine', 'Perlu saya tinjau'], ['approved', 'Disetujui'], ['rejected', 'Ditolak'], ['all', 'Semua']].map(([id, label]) => ({
      label, on: tab === id, count: items.data.filter(item => matchesTab(item, id)).length,
      line: tab === id ? 'var(--accent)' : 'transparent', ink: tab === id ? 'var(--accentText)' : 'var(--mute)', pick: () => { if (!mutation.busy) { setTab(id); setSelectedId(null); } },
    })),
    jobRows: visible.map((item) => ({ ...statusStyle(item.status),
      title: item.title, type: TYPE_LABEL[item.type] || item.type, ver: item.version ?? '—', agent: item.agentName || 'Agen', when: dateLabel(item.updatedAt), ini: (item.agentName || 'AI').slice(0, 2).toUpperCase(), tint: 'var(--accentSoft)',
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
  const canReview = permissions.approve && item.canReview !== false;
  const fields = Array.isArray(item.content?.fields) ? item.content.fields : [];
  const copy = async () => {
    try { await navigator.clipboard.writeText([item.title, ...fields.map((field) => `${field.label}\n${Array.isArray(field.value) ? field.value.join('\n') : String(field.value ?? '')}`)].join('\n\n')); setCopyState('Teks disalin.'); }
    catch { setCopyState('Tidak dapat menyalin. Pilih teks dan salin secara manual.'); }
  };
  return <aside className="work-panel work-detail" aria-label="Detail item">
    <div className="work-actions"><span className="work-badge">{TYPE_LABEL[item.type] || item.type}</span><span className="work-badge" style={{ background: statusStyle(item.status).sbg, color: statusStyle(item.status).sink }}>{statusNames[item.status] || item.status}</span><span className="work-hint">Versi {item.version}</span></div>
    <div><h2>{item.title}</h2><p className="work-hint">{item.agentName || 'Agen'} · {dateLabel(item.updatedAt)}{item.model ? ` · ${item.model}` : ''}</p></div>
    <div className="work-content">{fields.length ? fields.map((field, index) => <section key={index}><h3>{field.label}</h3><FieldValue field={field} /></section>) : <p>Belum ada konten terstruktur.</p>}</div>
    {item.status === 'revising' && <p className="work-notice" role="status">Agent sedang merevisi. Konten di atas adalah versi sebelumnya. Jangan kirim ulang; status diperbarui otomatis.</p>}
    {item.lastError && <p className="work-notice" role="alert">{item.lastError}</p>}
    {item.rejectReason && <section><h3>Alasan penolakan</h3><p className="work-text">{item.rejectReason}</p></section>}
    {typeof item.canReview === 'boolean' && <p className="work-hint">PIC persetujuan: {item.reviewer?.name || 'Owner / admin tenant'}{!canReview ? ' · Anda hanya dapat melihat hasil ini.' : ' · Anda dapat meninjau hasil ini.'}</p>}
    <div className="work-actions"><button className="work-button btnp" disabled={!canReview || mutation.busy || ['approved', 'revising'].includes(item.status)} onClick={() => mutate('approve', item)}>Setujui</button><button className="work-button btns" disabled={!canReview || mutation.busy || item.status === 'revising'} onClick={() => { setReviewAction('revise'); setReason(''); }}>Minta revisi</button><button className="work-button btns work-error" disabled={!canReview || mutation.busy || ['rejected', 'revising'].includes(item.status)} onClick={() => { setReviewAction('reject'); setReason(''); }}>Tolak</button></div>
    {reviewAction && canReview && item.status !== 'revising' && <form className="work-review-form" aria-label={reviewAction === 'revise' ? 'Permintaan revisi' : 'Penolakan item'} onSubmit={async (event) => { event.preventDefault(); if (await mutate(reviewAction, item, { reason })) setReviewAction(null); }}>
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
