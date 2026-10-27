import React from 'react';
import { dashboardChecklist } from './dashboard-data.js';
import './dashboard-overview.css';

export function LiveDashboardOverview({ profile, overview, balanceSummary, loading, error, onRetry, onNavigate }) {
  const metrics = overview?.metrics;
  const checklist = dashboardChecklist(profile, overview);
  const completed = checklist.filter((entry) => entry.done === true).length;
  return <section className="live-overview" aria-label="Ringkasan workspace">
    <header className="live-heading"><div><h1>Halo, {profile?.user?.displayName || profile?.user?.email || 'Anda'}</h1><p>Ringkasan seluruh aktivitas workspace Anda.</p></div><button className="live-primary" onClick={() => onNavigate('/dashboard/jobs')}>+ Perintah baru</button></header>
    {loading && <p role="status">Memuat ringkasan workspace…</p>}
    {error && <div className="live-error" role="alert"><p>{error}</p><button onClick={onRetry}>Coba lagi</button></div>}
    <div className="live-metrics">{[['Total perintah', metrics?.totalJobs], ['Sedang berjalan', metrics?.activeJobs], ['Item disetujui', metrics?.approvedItems], ['Klien', metrics?.totalClients]].map(([label, value]) => <article className="live-card" key={label}><h2>{label}</h2><strong>{value ?? '—'}</strong><p>{metrics ? 'Workspace aktif' : 'Belum tersedia'}</p></article>)}</div>
    <div className="live-columns"><div className="live-stack">
      <article className="live-card"><h2>Perintah per hari</h2><p>Grafik harian belum tersedia. Tidak ada angka perkiraan yang ditampilkan.</p></article>
      <article className="live-card"><div className="live-heading"><h2>Perintah terbaru</h2><button onClick={() => onNavigate('/dashboard/board')}>Lihat board</button></div>
        {!overview ? <p>{loading ? 'Memuat perintah…' : 'Daftar perintah belum tersedia.'}</p> : overview.recentJobs.length === 0 ? <p>Belum ada perintah di workspace ini. Buat perintah pertama untuk mulai bekerja.</p> : <ul className="live-jobs">{overview.recentJobs.map((job) => <li key={job.id}><div><b>{job.jobType}{job.clientName ? ` · ${job.clientName}` : ''}</b><p>{job.agentId || 'Agent'} · {formatDate(job.createdAt)}</p></div><span>{job.status}</span></li>)}</ul>}
      </article>
    </div><div className="live-stack">
      {balanceSummary}
      <article className="live-card"><h2>Mulai cepat</h2><p>{overview ? `${completed} dari ${checklist.length} langkah selesai` : 'Menunggu data aktivitas workspace.'}</p><ul className="live-checklist">{checklist.map((entry) => <li key={entry.label}><span aria-hidden="true">{entry.done === true ? '✓' : entry.done === null ? '—' : '○'}</span><span>{entry.label}<small>{entry.done === true ? 'Selesai' : entry.done === null ? 'Belum dapat diperiksa' : 'Belum selesai'}</small></span></li>)}</ul></article>
      <article className="live-card"><h2>Kantor 3D</h2><p>Buka tampilan kantor. Status aktivitas ditampilkan berdasarkan data yang tersedia.</p><button onClick={() => onNavigate('/dashboard/office')}>Buka kantor</button></article>
    </div></div>
  </section>;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Waktu belum tersedia' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function DashboardUnavailable({ title }) {
  return <section className="live-overview"><article className="live-card"><h1>{title}</h1><p>Bagian ini belum terhubung ke layanan aplikasi. Data contoh dan aksi simulasi tidak ditampilkan sebagai data akun Anda.</p></article></section>;
}
