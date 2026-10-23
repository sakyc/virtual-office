import React, { useEffect, useState } from 'react';
import { loadUsage } from './usage-data.js';
import './usage-page.css';

const num = (value) => Number(value || 0).toLocaleString('id-ID');
const periods = { today: 'Hari ini (UTC)', '7d': '7 hari terakhir', '14d': '14 hari terakhir' };
const activities = { chat: 'Chat', job: 'Pekerjaan', revision: 'Revisi' };
const date = (value) => !value || Number.isNaN(new Date(value).getTime()) ? '—' : new Date(value).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });

function QuotaCard({ title, subtitle, observed }) {
  return <article className="uq-card"><header><span className="uq-clock" aria-hidden="true">◷</span><span className="uq-badge">Belum diaktifkan</span></header>
    <h2>{title}</h2><p>{subtitle}</p><div className="uq-allowance"><strong>—</strong><span>/ kuota belum ditetapkan</span></div>
    <div className="uq-meter" aria-label={`${title}: batas belum ditetapkan`}/>
    <div className="uq-meta"><span>Waktu reset</span><span>Belum tersedia</span></div>
    <footer><strong>{num(observed?.tokens)} token tercatat</strong><span>{num(observed?.requests)} panggilan dalam periode ini</span></footer>
  </article>;
}

export function UsageAnalytics() {
  const [state, setState] = useState({ data: null, error: '' });
  const [retry, setRetry] = useState(0);
  const [range, setRange] = useState('7d');
  const [tab, setTab] = useState('tokens');
  useEffect(() => {
    const controller = new AbortController(); setState({ data: null, error: '' });
    loadUsage(controller.signal, range).then((data) => { if (!controller.signal.aborted) setState({ data, error: '' }); })
      .catch(() => { if (!controller.signal.aborted) setState({ data: null, error: 'Pemakaian belum tersedia. Periksa sesi dan layanan pencatatan dengan operator.' }); });
    return () => controller.abort();
  }, [retry, range]);
  const data = state.data, totals = data?.totals || {};
  const input = Number(totals.inputTokens || 0), output = Number(totals.outputTokens || 0);
  const read = Number(totals.cacheReadTokens || 0), write = Number(totals.cacheCreationTokens || 0), sum = input + output + read + write;
  const tokens = [['Input baru', input, 'input'], ['Cache read', read, 'read'], ['Cache write', write, 'write'], ['Output', output, 'output']];
  return <section className="uq-page">
    <header className="uq-heading"><div><span className="uq-eyebrow">WORKSPACE ANALYTICS</span><h1>Penggunaan AI</h1><p>Pantau kuota, pemakaian token, dan aktivitas model di satu tempat.</p></div>
      <div className="uq-controls"><button className="uq-refresh" aria-label="Muat ulang pemakaian" onClick={() => setRetry((v) => v + 1)}>↻</button><div className="uq-periods" role="group" aria-label="Periode pemakaian">{[['today', 'Hari ini'], ['7d', '7 hari'], ['14d', '14 hari']].map(([id, label]) => <button key={id} aria-pressed={range === id} onClick={() => setRange(id)}>{label}</button>)}</div></div>
    </header>
    <div className="uq-section-nav"><span>Usage analytics</span><a href="#usage-request-logs">Riwayat permintaan</a><span className="uq-scope">{data ? data.scope === 'workspace' ? 'Workspace aktif' : 'Hanya pemakaian saya' : 'Memuat…'}</span></div>
    {state.error && <div className="uq-notice" role="alert">{state.error}</div>}{!data && !state.error && <p role="status">Memuat pemakaian…</p>}
    {data && <>
      <div className="uq-title"><h2>Kuota penggunaan</h2><span>5 jam &amp; mingguan</span></div>
      <div className="uq-quota-grid"><QuotaCard title="Kuota 5 jam" subtitle="Allowance penggunaan jangka pendek" observed={data.quota?.windows?.find((w) => w.id === 'fiveHour')?.observed}/><QuotaCard title="Kuota mingguan" subtitle="Allowance penggunaan setiap 7 hari" observed={data.quota?.windows?.find((w) => w.id === 'weekly')?.observed}/></div>
      <div className="uq-notice"><p><strong>Paket dan batas kuota belum ditetapkan.</strong> Angka token di atas adalah pengamatan 5 jam/7 hari terakhir, bukan saldo atau kuota aktif. Pemblokiran berdasarkan dua kuota ini belum diaktifkan. Kredit top up dan biaya juga belum tersedia.</p></div>
      <div className="uq-title"><h2>Ringkasan aktivitas</h2><span>{periods[range]}</span></div>
      <div className="uq-summary">{[['Panggilan AI', totals.requests, 'Termasuk percobaan ulang'], ['Total token tercatat', sum, 'Input, output, dan cache'], ['Belum terkonfirmasi', totals.unresolved, 'Masih berjalan / pemakaian tidak diketahui']].map(([label, value, note]) => <article key={label}><span>{label}</span><strong>{num(value)}</strong><small>{note}</small></article>)}</div>
      <div className="uq-analytics"><div className="uq-tabs" role="tablist" aria-label="Analisis pemakaian">{[['tokens', 'Token & cache'], ['credits', 'Biaya & kredit'], ['models', 'Model']].map(([id, label]) => <button key={id} id={`usage-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls="usage-analysis-panel" onClick={() => setTab(id)}>{label}</button>)}</div>
        <div className="uq-analysis-body" id="usage-analysis-panel" role="tabpanel" aria-labelledby={`usage-tab-${tab}`}>
          {tab === 'tokens' && <><div className="uq-title"><h2>Token &amp; cache</h2><span>{periods[range]}</span></div><div className="uq-token-stats">{[['Total token', num(sum)], ['Cache read / seluruh input', input + read + write ? `${Math.round(read / (input + read + write) * 100)}%` : '—'], ['Input baru', num(input)], ['Output', num(output)]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
          <div className="uq-token-bar" aria-hidden="true">{tokens.map(([label, value, color]) => <i key={label} className={`uq-${color}`} style={{ width: `${sum ? value / sum * 100 : 0}%` }}/>)}</div><dl className="uq-breakdown">{tokens.map(([label, value, color]) => <React.Fragment key={label}><dt><i className={`uq-dot uq-${color}`}/>{label}</dt><dd>{num(value)}<span>{sum ? `${Math.round(value / sum * 100)}%` : '—'}</span></dd></React.Fragment>)}</dl></>}
          {tab === 'credits' && <div className="uq-empty"><h2>Biaya &amp; kredit belum diaktifkan</h2><p>Harga model, allowance paket, dan saldo top up belum ditetapkan. Token belum dikonversi menjadi biaya. Tidak ada saldo atau tagihan perkiraan yang ditampilkan.</p></div>}
          {tab === 'models' && <><h2>Aktivitas model</h2>{!data.models?.length ? <p className="uq-empty-text">Belum ada model yang digunakan dalam periode ini.</p> : <div className="uq-table-wrap"><table><thead><tr><th>Model</th><th>Panggilan</th><th>Input</th><th>Output</th><th>Cache</th></tr></thead><tbody>{data.models.map((row) => <tr key={row.model}><td>{row.model}</td><td>{num(row.requests)}</td><td>{num(row.inputTokens)}</td><td>{num(row.outputTokens)}</td><td>{num(Number(row.cacheReadTokens || 0) + Number(row.cacheCreationTokens || 0))}</td></tr>)}</tbody></table></div>}</>}
        </div>
      </div>
      <section className="uq-logs" id="usage-request-logs"><div className="uq-title"><h2>Riwayat permintaan</h2><span>50 terbaru · {periods[range]}</span></div>
        {!data.recent.length ? <p className="uq-empty-text">Belum ada pemakaian tercatat dalam periode ini.</p> : <div className="uq-table-wrap"><table><thead><tr><th>Agen / aktivitas</th><th>Model</th><th>Token masuk / keluar</th><th>Status</th><th>Waktu</th></tr></thead><tbody>{data.recent.map((row) => <tr key={row.id}><td><strong>{row.agentId}</strong><small>{activities[row.operation] || row.operation}</small></td><td>{row.model}</td><td>{row.inputTokens == null ? '—' : num(row.inputTokens)} / {row.outputTokens == null ? '—' : num(row.outputTokens)}</td><td><span className={`uq-status ${row.status === 'completed' ? 'uq-success' : 'uq-pending'}`}>{row.status === 'completed' ? 'Tercatat' : 'Belum terkonfirmasi'}</span></td><td>{date(row.startedAt)}</td></tr>)}</tbody></table></div>}
        <p className="uq-footnote">Hanya token yang dilaporkan provider yang dihitung. Panggilan belum terkonfirmasi bukan berarti gratis. Riwayat sebelum pencatatan diaktifkan tidak dimasukkan.</p>
      </section>
    </>}
  </section>;
}
