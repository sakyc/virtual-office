import React, { useEffect, useRef, useState } from 'react';
import { adminManagementRequest } from './admin-management-data.js';
import { formatIdr } from './billing-data.js';
import { ActivationLoader } from './admin-billing-operations.jsx';

export const adminStatusLabels = { active: 'Aktif', suspended: 'Ditangguhkan', deleted: 'Dihapus', archived: 'Diarsipkan',
  none: 'Belum berlangganan', past_due: 'Lewat jatuh tempo', cancelled: 'Dibatalkan', scheduled: 'Belum mulai', expired: 'Berakhir', organization_inactive: 'Organisasi tidak aktif' };
const date = (value) => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const labels = { suspend: 'Suspend akun', activate: 'Aktifkan akun', revoke_sessions: 'Cabut semua sesi' };

export function UserActionDialog({ user, action, onClose, onSaved, onDenied }) {
  const dialog = useRef(null), controller = useRef(null), busy = useRef(false);
  const [reason, setReason] = useState(''), [state, setState] = useState({});
  useEffect(() => {
    dialog.current.showModal();
    return () => controller.current?.abort();
  }, []);
  async function submit(e) {
    e.preventDefault(); if (busy.current) return;
    busy.current = true; setState({ saving: true }); controller.current = new AbortController();
    try {
      const result = await adminManagementRequest(`/api/admin/users/${user.id}/actions`, { body: { action, expectedStatus: user.status, reason }, signal: controller.current.signal });
      if (!controller.current.signal.aborted) onSaved(result);
    } catch (error) {
      if (!controller.current.signal.aborted) {
        if (error.status === 401 || (error.status === 403 && error.code === 'PLATFORM_ADMIN_REQUIRED')) onDenied(error.message);
        else setState({ error: error.message });
      }
    } finally { busy.current = false; }
  }
  return <dialog className="admin-action-dialog" ref={dialog} aria-labelledby="admin-action-title" onCancel={(e) => { if (busy.current) e.preventDefault(); else onClose(); }}>
    <form onSubmit={submit}><span className="admin-kicker">KONFIRMASI TINDAKAN ADMIN</span><h2 id="admin-action-title">{labels[action]}</h2><p>Akun: <strong>{user.email}</strong></p>
      <p>{action === 'suspend' ? 'Akun tidak dapat login dan semua sesinya dicabut. Data dan keanggotaan tetap disimpan.' : action === 'activate' ? 'Akun dapat login kembali. Sesi lama yang dicabut tidak dipulihkan.' : 'Semua sesi akun ini akan dicabut. Pengguna harus login kembali.'}</p>
      <label>Alasan tindakan<textarea autoFocus required minLength={5} maxLength={500} value={reason} disabled={state.saving} onChange={(e) => setReason(e.target.value)}/></label>
      <p>Tindakan dan alasan dicatat dalam log admin.</p>{state.error && <p role="alert">{state.error}</p>}
      <div className="admin-dialog-actions"><button type="button" onClick={onClose} disabled={state.saving}>Batal</button><button type="submit" className="admin-primary" disabled={state.saving}>{state.saving ? 'Menyimpan…' : labels[action]}</button></div>
    </form>
  </dialog>;
}

export function AdminDirectoryTable({ section, rows, onOrganization, onAction, onActivate }) {
  const badge = (status) => <span className={`admin-badge ${status === 'active' ? '' : 'muted'}`}>{adminStatusLabels[status] || status}</span>;
  const columns = section === 'users' ? ['Pengguna', 'Status', 'Sesi aktif', 'Terdaftar', 'Tindakan']
    : section === 'organizations' ? ['Organisasi', 'Status', 'Workspace aktif', 'Keanggotaan', 'Tindakan']
      : section === 'members' ? ['Anggota', 'Status akun', 'Cakupan', 'Role'] : ['Organisasi', 'Paket & status', 'Harga & saldo bulanan', 'Kapasitas', 'Periode', 'Tindakan'];
  return <div className="admin-directory-table"><table><thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>
    {!rows.length ? <tr><td colSpan={columns.length} className="admin-empty">Tidak ada data yang cocok.</td></tr> : rows.map((r) => <tr key={section === 'members' ? `${r.userId}:${r.scope}:${r.workspaceId ?? 'org'}` : r.id}>
      {section === 'users' ? <><td><strong>{r.displayName || 'Tanpa nama'}</strong><small>{r.email}</small><small>ID #{r.id}{r.platformAdmin ? ' · Admin Platform (dilindungi)' : ''}</small></td><td>{badge(r.status)}</td><td>{r.status === 'active' ? r.activeSessions : '0'}</td><td>{date(r.createdAt)}<small>Login terakhir: {date(r.lastLoginAt)}</small></td><td>{r.platformAdmin ? <span className="admin-directory-note">Akun dilindungi</span> : r.status === 'deleted' ? <span className="admin-directory-note">Tidak dapat diubah</span> : <div className="admin-row-actions"><button onClick={() => onAction(r, r.status === 'active' ? 'suspend' : 'activate')}>{r.status === 'active' ? 'Suspend' : 'Aktifkan'}</button><button onClick={() => onAction(r, 'revoke_sessions')}>Cabut sesi</button></div>}</td></>
        : section === 'organizations' ? <><td><strong>{r.name}</strong><small>{r.slug} · ID #{r.id}</small></td><td>{badge(r.status)}</td><td>{r.activeWorkspaces}</td><td>{r.owners} owner<small>{r.workspaceMembers} akun anggota workspace</small></td><td><button onClick={() => onOrganization(r)}>Lihat anggota</button></td></>
          : section === 'members' ? <><td><strong>{r.displayName || 'Tanpa nama'}</strong><small>{r.email} · #{r.userId}</small></td><td>{badge(r.userStatus)}</td><td>{r.scope === 'organization' ? 'Organisasi' : r.workspaceName}<small>{r.scope === 'workspace' ? `Workspace #${r.workspaceId} · ${adminStatusLabels[r.workspaceStatus] || r.workspaceStatus}` : 'Keanggotaan organisasi'}</small></td><td><span className="admin-badge muted">{r.role}</span></td></>
            : <><td><strong>{r.organizationName}</strong><small>ID #{r.id} · {adminStatusLabels[r.organizationStatus] || r.organizationStatus}</small></td><td><strong>{r.planCode || '—'}{r.planVersion ? ` · v${r.planVersion}` : ''}</strong>{badge(r.effectiveStatus)}</td><td>{formatIdr(r.monthlyPriceIdr)}<small>Saldo paket: {formatIdr(r.includedCreditIdr)}</small></td><td>{r.subscriptionId ? `${r.maxDivisions} divisi · ${r.maxMembers} anggota` : '—'}<small>{r.subscriptionId ? `WhatsApp: ${r.whatsapp ? 'Termasuk benefit' : 'Tidak termasuk'}` : ''}</small></td><td>{date(r.periodStart)}<small>s/d {date(r.periodEnd)}</small></td><td>{!r.subscriptionId && r.organizationStatus==='active' && onActivate?<button onClick={()=>onActivate(r)}>Aktifkan paket</button>:<small>{r.subscriptionId?'Aktivasi awal sudah tercatat':'Organisasi tidak aktif'}</small>}</td></>}
    </tr>)}
  </tbody></table></div>;
}

export function AdminDirectory({ section, onDenied }) {
  const [organization, setOrganization] = useState(null), [q, setQ] = useState(''), [draft, setDraft] = useState(''), [pages, setPages] = useState([0]);
  const [retry, setRetry] = useState(0), [state, setState] = useState({}), [action, setAction] = useState(null), [message, setMessage] = useState('');
  const [activation,setActivation]=useState(null);
  const members = Boolean(organization), currentSection = members ? 'members' : section;
  const params = new URLSearchParams({ q, limit: '25', [members ? 'offset' : 'after']: String(pages.at(-1)) });
  const path = `/api/admin/${members ? `organizations/${organization.id}/members` : section}?${params}`;
  useEffect(() => {
    const controller = new AbortController(); setState({ path, loading: true });
    adminManagementRequest(path, { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setState({ path, data }); })
      .catch((error) => { if (!controller.signal.aborted) {
        if ([401,403].includes(error.status)) onDenied(error.message);
        else setState({ path, error: error.message });
      } });
    return () => controller.abort();
  }, [path, retry]);
  function switchOrganization(value) { setOrganization(value); setQ(''); setDraft(''); setPages([0]); setMessage(''); }
  const data = state.path === path ? state.data : null;
  const next = members ? data?.nextOffset : data?.nextAfter;
  return <>
    {section === 'subscriptions' && <div className="admin-policy"><p>Aktivasi awal tersedia sebagai tindakan manual admin, dengan konfirmasi, referensi persetujuan, dan audit. Bukan pembayaran otomatis. Perpanjangan dan penggantian paket belum tersedia.</p></div>}
    {members && <div className="admin-member-heading"><button onClick={() => switchOrganization(null)}>← Organisasi</button><div><h2>{organization.name}</h2><p>Owner organisasi dan role workspace ditampilkan terpisah. Satu akun dapat muncul di beberapa cakupan.</p></div></div>}
    <section className="admin-panel admin-directory"><form className="admin-directory-search" onSubmit={(e) => { e.preventDefault(); setQ(draft.trim()); setPages([0]); }}><label htmlFor="admin-directory-query">{section === 'users' || members ? 'Cari nama atau email' : 'Cari nama atau slug organisasi'}</label><div><input id="admin-directory-query" maxLength={120} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ketik untuk mencari…"/><button type="submit">Cari</button><button type="button" onClick={() => setRetry((n) => n + 1)}>Muat ulang</button></div></form>
      {message && <p className="admin-success" role="status">{message}</p>}
      {state.path !== path || state.loading ? <p role="status">Memuat data admin…</p> : state.error ? <p role="alert">{state.error}</p> : data && <><AdminDirectoryTable section={currentSection} rows={data.rows} onOrganization={switchOrganization} onAction={(user, action) => setAction({ user, action })} onActivate={setActivation}/><div className="admin-pagination"><span>Maksimal 25 baris per halaman</span><button disabled={pages.length < 2} onClick={() => setPages((p) => p.slice(0, -1))}>Sebelumnya</button><button disabled={next === null || next === undefined} onClick={() => setPages((p) => [...p, next])}>Berikutnya</button></div></>}
    </section>
    {action && <UserActionDialog {...action} onClose={() => setAction(null)} onDenied={onDenied} onSaved={(result) => { setAction(null); setMessage(`Tindakan tersimpan. ${result.revokedSessions} sesi dicabut.`); setRetry((n) => n + 1); }}/>}
    {activation&&<ActivationLoader organization={activation} onClose={()=>setActivation(null)} onDenied={onDenied} onSaved={()=>{setActivation(null);setMessage('Aktivasi dan saldo paket tersimpan beserta audit admin.');setRetry(n=>n+1);}}/>}
  </>;
}

export function AdminActivity({ onDenied }) {
  const [state, setState] = useState({ loading: true }), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setState({ loading: true });
    adminManagementRequest('/api/admin/activity', { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setState({ data }); })
      .catch((error) => { if (!controller.signal.aborted) { if ([401,403].includes(error.status)) onDenied(error.message); else setState({ error: error.message }); } });
    return () => controller.abort();
  }, [retry]);
  return <section className="billing-history admin-activity"><div className="admin-section-heading"><div><h2>Log pengelolaan pengguna</h2><p>50 tindakan terakhir. Tidak menyimpan password atau token sesi.</p></div><button onClick={() => setRetry((n) => n + 1)}>Muat ulang</button></div>
    {state.loading ? <p role="status">Memuat log admin…</p> : state.error ? <p role="alert">{state.error}</p> : state.data.rows.length ? state.data.rows.map((r) => <article className="catalog-audit" key={r.id}><strong>{labels[r.action] || r.action} · Akun #{r.targetUserId}</strong><p>{date(r.createdAt)} · Admin #{r.actorUserId}</p><p>{r.reason}</p></article>) : <p>Belum ada tindakan pengelolaan pengguna.</p>}
  </section>;
}
