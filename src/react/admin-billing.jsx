import { BrandMark } from './brand.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { adminCatalogRequest } from './catalog-data.js';
import { formatIdr } from './billing-data.js';
import './reference/dashboard.css';
import './billing.css';
import './admin-dashboard.css';
import { AdminDirectory, AdminActivity } from './admin-management.jsx';
import { BillingOperations } from './admin-billing-operations.jsx';
import { AdminModels } from './admin-models.jsx';
import {AdminDemo} from './admin-demo.jsx';

export function PlanEditor({ plan, onSaved, onDenied }) {
  const custom = Boolean(plan.quoteRequired);
  const [form, setForm] = useState({ expectedVersion: plan.version, name: plan.name, monthlyPriceIdr: plan.monthlyPriceIdr,
    includedCreditIdr: plan.includedCreditIdr, maxDivisions: plan.maxDivisions, maxMembers: plan.maxMembers,
    whatsapp: Boolean(plan.whatsapp), isPublic: Boolean(plan.isPublic), reason: '' });
  const [status, setStatus] = useState({});
  const busy = useRef(false), request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  const change = (field, value) => { setStatus({}); setForm((f) => ({ ...f, [field]: value })); };
  async function save(event) {
    event.preventDefault(); if (busy.current) return;
    busy.current = true; setStatus({ saving: true }); request.current = new AbortController();
    try {
      await adminCatalogRequest({ code: plan.code, body: form, signal: request.current.signal });
      if (!request.current.signal.aborted) onSaved();
    } catch (error) {
      if (!request.current.signal.aborted) {
        if ([401,403].includes(error.status)) onDenied(error.message);
        else setStatus({ error: error.message });
      }
    } finally { busy.current = false; }
  }
  return <form className="catalog-editor" onSubmit={save}>
    <header><h2>{plan.name} <small>v{plan.version}</small></h2><p>{custom ? 'Harga dan kapasitas Custom ditentukan melalui penawaran terpisah, bukan tanpa batas.' : `${formatIdr(plan.monthlyPriceIdr)} / bulan · ${plan.maxDivisions} divisi`}</p></header>
    <fieldset disabled={status.saving}>
      <label>Nama paket<input required maxLength={60} value={form.name} onChange={(e) => change('name', e.target.value)}/></label>
      {!custom && <>
        <label>Harga bulanan (Rp)<input required inputMode="numeric" pattern="[0-9]+" value={form.monthlyPriceIdr} onChange={(e) => change('monthlyPriceIdr', e.target.value)}/></label>
        <label>Saldo AI bulanan (Rp)<input required inputMode="numeric" pattern="[0-9]+" value={form.includedCreditIdr} onChange={(e) => change('includedCreditIdr', e.target.value)}/></label>
        <label>Divisi (maksimal 8)<input type="number" min="1" max="8" step="1" required value={form.maxDivisions} onChange={(e) => change('maxDivisions', Number(e.target.value))}/></label>
        <label>Anggota manusia<input type="number" min="1" max="65535" step="1" required value={form.maxMembers} onChange={(e) => change('maxMembers', Number(e.target.value))}/></label>
        <label className="catalog-check"><input type="checkbox" checked={form.whatsapp} onChange={(e) => change('whatsapp', e.target.checked)}/>Benefit WhatsApp (pengiriman belum aktif)</label>
      </>}
      <p>4 agen AI per divisi tetap berlaku.</p>
      <label className="catalog-check"><input type="checkbox" checked={form.isPublic} onChange={(e) => change('isPublic', e.target.checked)}/>Tampilkan paket di landing page dan dashboard</label>
      <label>Alasan perubahan<textarea required minLength={5} maxLength={500} value={form.reason} onChange={(e) => change('reason', e.target.value)}/></label>
      <button type="submit">{status.saving ? 'Menyimpan…' : 'Simpan versi baru'}</button>
    </fieldset>
    {status.error && <p role="alert">{status.error}</p>}
  </form>;
}
function auditSummary(snapshot) {
  try {
    const p = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
    return `${p.name} · ${p.quoteRequired ? 'Penawaran khusus' : `${formatIdr(p.monthlyPriceIdr)}/bulan, saldo ${formatIdr(p.includedCreditIdr)}, ${p.maxDivisions} divisi, ${p.maxMembers} anggota`} · WhatsApp ${p.whatsapp ? 'ya' : 'tidak'} · ${p.isPublic ? 'publik' : 'tersembunyi'}`;
  } catch { return 'Snapshot tidak tersedia'; }
}
export function AdminIcon({ name, ...props }) {
  const paths = {
    overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    billing: 'M4 5h16v14H4z M4 10h16 M8 15h3',
    audit: 'M8 4H5v17h14V4h-3 M9 3h6v4H9z M9 12h6 M9 16h4',
    people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-4',
    shield: 'M12 3 3 7v5c0 5 9 10 9 10s9-5 9-10V7z M8 12l3 3 5-6',
    arrow: 'M5 12h14 M13 6l6 6-6 6',
    refresh: 'M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-1l2 6 M4 12l2 6a7 7 0 0 0 12-1',
    models: 'M9 3h6v4H9z M5 9h14v12H5z M9 13v2 M15 13v2 M9 18h6 M3 12v6 M21 12v6',
  };
  const icon = name === 'users' || name === 'organizations' ? 'people' : name === 'subscriptions' ? 'billing' : name;
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[icon] || paths.overview}/></svg>;
}

export function CatalogAudit({ audit }) {
  return <section className="billing-history"><h2>Riwayat perubahan katalog</h2><p>50 perubahan terakhir. Setiap simpan menyertakan akun admin, versi, alasan, dan snapshot sebelum/sesudah.</p>
    {audit.length ? audit.map((a) => <article className="catalog-audit" key={a.id}><strong>{a.planCode} · v{a.planVersion}</strong><p>{new Date(a.createdAt).toLocaleString('id-ID')} · Admin #{a.actorUserId} · {a.reason}</p><p>Sebelum: {auditSummary(a.beforeSnapshot)}</p><p>Sesudah: {auditSummary(a.afterSnapshot)}</p></article>) : <p>Belum ada perubahan katalog.</p>}
  </section>;
}

const adminSections = {
  demo: {path:'/admin/demo',name:'Demo bersama',title:'Demo bersama',description:'Verifikasi pemohon, durasi, saldo, kode akses otomatis, dan pemakaian bergantian.'},
  overview: { path: '/admin', name: 'Ringkasan', title: 'Pusat kendali platform', description: 'Satu tempat untuk mengelola arah dan operasional Karyora.' },
  users: { path: '/admin/users', name: 'Pengguna', title: 'Kelola pengguna', description: 'Cari akun, kelola status, dan cabut sesi dengan jejak audit.' },
  organizations: { path: '/admin/organizations', name: 'Organisasi & anggota', title: 'Organisasi & anggota', description: 'Lihat organisasi, workspace, dan role anggota tanpa mengakses konten pelanggan.' },
  subscriptions: { path: '/admin/subscriptions', name: 'Langganan', title: 'Langganan organisasi', description: 'Pantau paket, kapasitas, dan periode langganan yang tercatat.' },
  billing: { path: '/admin/billing', name: 'Paket & harga', title: 'Paket & harga', description: 'Kelola harga, kapasitas, dan benefit yang tampil ke pelanggan.' },
  models: { path: '/admin/models', name: 'Model AI', title: 'Kelola model AI', description: 'Atur model yang tersedia, status penggunaan, dan tarif per token.' },
  audit: { path: '/admin/audit', name: 'Log perubahan', title: 'Log perubahan', description: 'Telusuri perubahan katalog beserta versi, alasan, dan akun admin.' },
};

const adminNavigationGroups = [
  { title: 'Utama', sections: ['overview'] },
  { title: 'Pelanggan', sections: ['users', 'organizations', 'subscriptions','demo'] },
  { title: 'Produk & AI', sections: ['billing', 'models'] },
  { title: 'Audit', sections: ['audit'] },
];

export function AdminSidebar({ section, onNavigate }) {
  function navigate(event, path) {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault(); onNavigate(path);
    }
  }
  return <aside className="admin-sidebar">
    <a className="admin-brand" href="/admin" onClick={e => navigate(e, '/admin')}><span className="admin-brand-mark"><BrandMark /></span><span>Karyora<small>PLATFORM ADMIN</small></span></a>
    <div className="admin-space-label"><AdminIcon name="shield"/><div>Administration<small>Platform workspace</small></div><span className="admin-status-dot"/></div>
    <label className="admin-mobile-navigation">Halaman admin<select value={section} onChange={e => onNavigate(adminSections[e.target.value].path)}>
      {adminNavigationGroups.map(group => <optgroup key={group.title} label={group.title}>{group.sections.map(key => <option key={key} value={key}>{adminSections[key].name}</option>)}</optgroup>)}
    </select></label>
    <nav aria-label="Navigasi admin">{adminNavigationGroups.map(group => <div className="admin-nav-group" role="group" aria-label={group.title} key={group.title}>
      <h2 className="admin-nav-label">{group.title}</h2>
      <div className="admin-nav-links">{group.sections.map(key => {
        const item = adminSections[key];
        return <a key={key} href={item.path} aria-current={section === key ? 'page' : undefined} onClick={e => navigate(e, item.path)}><AdminIcon name={key}/>{item.name}{section === key && <span className="admin-nav-dot"/>}</a>;
      })}</div>
    </div>)}</nav>
    <div className="admin-sidebar-bottom"><p>Khusus pengelolaan platform.<br/>Bukan workspace pelanggan.</p><button onClick={() => onNavigate('/dashboard')}>Dashboard pengguna <AdminIcon name="arrow"/></button></div>
  </aside>;
}

export function AdminOverview({ data, onNavigate }) {
  const publicPlans = data.plans.filter((p) => p.isPublic);
  return <>
    <section className="admin-hero"><div><span className="admin-kicker">KARYORA CONTROL CENTER</span><h2>Kelola dengan lebih terarah.</h2><p>Atur penawaran platform dan pantau setiap perubahan dari ruang kerja khusus admin.</p><button className="admin-primary" onClick={() => onNavigate('/admin/billing')}>Kelola paket <AdminIcon name="arrow"/></button></div><div className="admin-hero-art" aria-hidden="true"><span/><span/><span/><AdminIcon name="overview" width="56" height="56"/></div></section>
    <section className="admin-metrics" aria-label="Ringkasan katalog">
      {[['billing', 'Paket di katalog', data.plans.length, 'Termasuk paket penawaran khusus'], ['overview', 'Paket ditampilkan', publicPlans.length, 'Terlihat di landing page & dashboard'], ['audit', 'Perubahan dimuat', data.audit.length, 'Maksimal 50 perubahan katalog terakhir']].map(([icon, label, value, note]) => <article key={label}><span className="admin-metric-icon"><AdminIcon name={icon}/></span><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}
    </section>
    <div className="admin-overview-grid"><section className="admin-panel"><div className="admin-section-heading"><div><h2>Katalog langganan</h2><p>Penawaran yang tersedia saat ini.</p></div><button onClick={() => onNavigate('/admin/billing')}>Kelola <AdminIcon name="arrow"/></button></div>
      <div className="admin-plan-list">{data.plans.length ? data.plans.map((plan) => <article key={plan.code}><span className="admin-plan-initial">{plan.name.slice(0, 1)}</span><div><strong>{plan.name}</strong><small>{plan.quoteRequired ? 'Penawaran khusus' : `${plan.maxDivisions} divisi · ${plan.maxMembers} anggota`}</small></div><div className="admin-plan-price"><strong>{plan.quoteRequired ? 'Custom' : formatIdr(plan.monthlyPriceIdr)}</strong><small>{plan.quoteRequired ? 'Sesuai kesepakatan' : 'per bulan'}</small></div><span className={`admin-badge ${plan.isPublic ? '' : 'muted'}`}>{plan.isPublic ? 'Publik' : 'Tersembunyi'}</span></article>) : <p>Belum ada paket di katalog.</p>}</div>
    </section><section className="admin-panel admin-access"><span className="admin-access-icon"><AdminIcon name="shield" width="26" height="26"/></span><h2>Akses yang terkontrol</h2><p>Ruang admin terpisah dari workspace pelanggan. Hak Admin Platform tidak otomatis membuka chat atau konten pelanggan.</p><div><span className="admin-status-dot"/>Akses diverifikasi oleh server</div><button onClick={() => onNavigate('/admin/audit')}>Lihat log perubahan <AdminIcon name="arrow"/></button></section></div>
    <section className="admin-panel"><div className="admin-section-heading"><div><h2>Ruang pengelolaan</h2><p>Akses cepat untuk operasional platform.</p></div></div><div className="admin-upcoming">{[['users', 'Pengguna', 'Status akun dan sesi login.'], ['organizations', 'Organisasi & anggota', 'Workspace dan role anggota.'], ['subscriptions', 'Langganan', 'Snapshot paket dan periode aktif.']].map(([key, title, text]) => <article key={key}><AdminIcon name={key === 'users' || key === 'organizations' ? 'people' : 'billing'}/><h3>{title}</h3><p>{text}</p><button onClick={() => onNavigate(`/admin/${key}`)}>Buka pengelolaan</button></article>)}</div></section>
  </>;
}

export function AdminPlanCatalog({ plans, onDenied, onSaved }) {
  const [selected, setSelected] = useState('starter');
  const plan = plans.find(p => p.code === selected) || plans[0];
  if (!plan) return <p>Belum ada paket di katalog.</p>;
  return <section className="admin-plan-workbench"><div className="admin-plan-selector" role="tablist" aria-label="Pilih paket untuk diedit">{plans.map(p => <button key={p.code} role="tab" aria-selected={p.code === plan.code} onClick={() => setSelected(p.code)}><strong>{p.name}</strong><span>{p.quoteRequired ? 'Penawaran khusus' : `${formatIdr(p.monthlyPriceIdr)} / bulan`}</span><small>{p.isPublic ? 'Tampil ke pelanggan' : 'Tersembunyi'}</small></button>)}</div><div className="admin-plan-editor-layout"><PlanEditor key={`${plan.code}:${plan.version}`} plan={plan} onDenied={onDenied} onSaved={onSaved}/><aside className="admin-panel admin-editor-help"><AdminIcon name="shield"/><h2>Ubah satu paket dengan jelas</h2><p>Harga langganan berbeda dari Saldo AI. Saldo AI adalah jatah rupiah yang dipakai untuk chat, tugas, dan revisi.</p><ul><li>4 agen AI per divisi.</li><li>Batas anggota menghitung akun manusia dalam organisasi, bukan agen AI.</li><li>Perubahan berlaku untuk aktivasi berikutnya. Paket aktif memakai snapshot sebelumnya.</li><li>Benefit WhatsApp belum berarti bot pengiriman sudah aktif.</li></ul></aside></div></section>;
}

export function AdminBilling({ onNavigate, section = 'billing' }) {
  const [state, setState] = useState({ loading: true }), [retry, setRetry] = useState(0), [saved, setSaved] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setState({ loading: true });
    adminCatalogRequest({ signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setState({ data, section }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ error: error.message }); });
    return () => controller.abort();
  }, [retry, section]);
  const current = adminSections[section] || adminSections.overview;
  if(section==='demo')return <div className="reference-dashboard admin-workspace"><AdminSidebar section={section} onNavigate={onNavigate}/><div className="admin-main"><header className="admin-topbar"><strong>Platform / Demo bersama</strong><span className="admin-role">Admin Platform</span></header><main className="admin-content billing-page"><header className="admin-page-heading"><div><span className="admin-kicker">DEMO CONTROL CENTER</span><h1>Demo bersama</h1><p>{current.description}</p></div><button onClick={()=>setRetry(n=>n+1)}>Muat ulang</button></header>{state.error?<p role="alert">{state.error}</p>:<AdminDemo key={retry} onDenied={error=>setState({error})}/>}</main></div></div>;
  return <div className="reference-dashboard admin-workspace">
    <AdminSidebar section={section} onNavigate={onNavigate}/>
    <div className="admin-main"><header className="admin-topbar"><div><span>Platform</span><span>/</span><strong>{current.name}</strong></div><span className="admin-role"><AdminIcon name="shield"/>Admin Platform</span></header>
      <main className="admin-content billing-page"><header className="admin-page-heading"><div><span className="admin-kicker">ADMIN WORKSPACE</span><h1>{current.title}</h1><p>{current.description}</p></div><button className="admin-refresh" onClick={() => setRetry((n) => n + 1)} disabled={state.loading}><AdminIcon name="refresh"/>Muat ulang</button></header>
      {saved && <p className="admin-success" role="status">Versi baru tersimpan. Katalog akan dibaca ulang saat landing page atau halaman langganan dibuka.</p>}
      {state.loading || (!state.error && state.section !== section) ? <div className="admin-state" role="status"><AdminIcon name="shield"/><h2>Memeriksa akses Admin Platform…</h2><p>Menunggu verifikasi sesi dan izin dari server.</p></div> : state.error ? <div role="alert" className="admin-state"><AdminIcon name="shield"/><h2>Akses admin belum tersedia</h2><p>{state.error}</p><div><button onClick={() => setRetry((n) => n + 1)}>Coba lagi</button><a href="/login">Ke halaman login</a></div></div> : section === 'overview' ? <AdminOverview data={state.data} onNavigate={onNavigate}/> : section === 'models' ? <AdminModels key={retry} onDenied={(error) => setState({ error })}/> : ['users','organizations','subscriptions'].includes(section) ? <AdminDirectory key={section} section={section} onDenied={(error) => setState({ error })}/> : section === 'audit' ? <><CatalogAudit audit={state.data.audit}/><AdminActivity onDenied={(error) => setState({ error })}/></> : <>
        <div className="admin-policy"><AdminIcon name="shield"/><p>Perubahan harga dan benefit berlaku untuk aktivasi baru. Snapshot langganan yang sudah berjalan tetap dipertahankan.</p></div>
        <AdminPlanCatalog plans={state.data.plans} onDenied={(error) => setState({ error })} onSaved={() => { setSaved(true); setRetry((n) => n + 1); }}/>
        <section className="admin-panel"><h2>Pengaturan model AI</h2><p>Harga token dan status model dikelola di halaman khusus, terpisah dari paket langganan.</p><button onClick={() => onNavigate('/admin/models')}>Kelola model AI <AdminIcon name="arrow"/></button></section>
      </>}
      {!state.loading && state.data && section==='audit' && <BillingOperations auditOnly onDenied={(error)=>setState({error})}/>}
      <footer className="admin-footer">Karyora · Platform administration<span>Kelola platform, hormati privasi pelanggan.</span></footer>
      </main>
    </div>
  </div>;
}
