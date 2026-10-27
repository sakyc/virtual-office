import React, { useEffect, useState } from 'react';
import { loadUsage } from './usage-data.js';
import './usage-page.css';

const num = (value) => Number(value || 0).toLocaleString('id-ID');
const periods = { today: 'Hari ini (UTC)', '7d': '7 hari terakhir', '14d': '14 hari terakhir' };
const activities = { chat: 'Chat', job: 'Pekerjaan', revision: 'Revisi' };
const date = (value) => !value || Number.isNaN(new Date(value).getTime()) ? '—' : new Date(value).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });

const rupiah = (value) => typeof value === 'string' && /^\d+$/.test(value) ? `Rp${BigInt(value).toLocaleString('id-ID')}` : 'Belum tersedia';
const costReasons = { pricing_expired: 'Tarif perlu diverifikasi ulang.', exchange_rate_unavailable: 'Kurs belum tersedia.', exchange_rate_stale: 'Kurs sudah kedaluwarsa.', exchange_rate_invalid: 'Kurs tidak valid.', usage_unresolved: 'Ada pemakaian belum terkonfirmasi.', model_price_unverified: 'Ada model yang tarifnya belum terverifikasi.', usage_incomplete: 'Rincian token belum lengkap.', cache_write_duration_unknown: 'Durasi cache tulis belum tercatat.' };

export function CostSummary({ costs }) {
  const [expanded, setExpanded] = useState(false);
  const partial = !costs?.available && typeof costs?.knownSubtotalIdr === 'string' && /^\d+$/.test(costs.knownSubtotalIdr);
  return <div className="uq-card"><header><h2>Estimasi biaya rupiah</h2><span className="uq-badge">{partial ? 'Estimasi sebagian · bukan tagihan' : 'Bukan tagihan'}</span></header>
    <div className="uq-allowance"><strong>{costs?.available ? rupiah(costs.amountIdr) : partial ? rupiah(costs.knownSubtotalIdr) : 'Belum dapat dihitung'}</strong>{partial && <span>subtotal terhitung, bukan total lengkap</span>}</div>
    <p>Biaya token provider × kurs USD/IDR × 2. Dihitung ulang memakai tarif dan kurs saat ini, bukan biaya historis yang sudah dikunci.</p>
    {costs?.includedRequests != null && <p className="uq-cost-coverage">Terhitung: <strong>{num(costs.includedRequests)} panggilan AI</strong>{!costs.available && <> · <strong>{num(costs.excludedRequests)} panggilan belum dapat dihitung</strong></>}. Satu prompt atau tugas dapat melibatkan lebih dari satu panggilan AI.</p>}
    {!costs?.available && <p>{costs?.reasons?.map((reason) => costReasons[reason] || 'Perhitungan belum tersedia.').join(' ') || 'Menunggu tarif dan kurs terverifikasi.'}</p>}
    {!costs?.available && costs?.excludedUsage?.length > 0 && <div className="uq-cost-details"><button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Sembunyikan rincian' : 'Lihat pemakaian yang belum dapat dihitung'}</button>{expanded && <div><ul>{costs.excludedUsage.map((row, index) => <li key={index}><strong>{row.model}</strong><span>{num(row.requests)} panggilan · {costReasons[row.reason] || 'Data belum lengkap.'}</span></li>)}</ul><p>Pemakaian belum terkonfirmasi tidak dianggap gratis. Tarif model yang belum tersedia perlu diperiksa admin platform; angka historis tidak diisi dengan perkiraan token.</p></div>}</div>}
    {costs?.fx?.available && <p>Kurs referensi: Rp{Number(costs.fx.idrPerUsd).toLocaleString('id-ID')} / US$1 · tanggal {costs.fx.date}</p>}
    {costs && <p>{costs.pricingLabel || <>Tarif diverifikasi: {costs.pricingVerifiedAt} · <a href={costs.pricingSource} target="_blank" rel="noreferrer">Sumber tarif</a></>} · <a href={costs.exchangeSource} target="_blank" rel="noreferrer">Sumber kurs</a></p>}
    <footer>Pembulatan ke atas ke rupiah penuh. Estimasi ini bukan debit historis; pemakaian AI dibebankan melalui Saldo AI memakai snapshot tarif saat permintaan.</footer>
  </div>;
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
    <header className="uq-heading"><div><span className="uq-eyebrow">WORKSPACE ANALYTICS</span><h1>Penggunaan AI</h1><p>Pantau estimasi biaya rupiah, pemakaian token, dan aktivitas model.</p></div>
      <div className="uq-controls"><button className="uq-refresh" aria-label="Muat ulang pemakaian" onClick={() => setRetry((v) => v + 1)}>↻</button><div className="uq-periods" role="group" aria-label="Periode pemakaian">{[['today', 'Hari ini'], ['7d', '7 hari'], ['14d', '14 hari']].map(([id, label]) => <button key={id} aria-pressed={range === id} onClick={() => setRange(id)}>{label}</button>)}</div></div>
    </header>
    <div className="uq-section-nav"><span>Usage analytics</span><a href="#usage-request-logs">Riwayat permintaan</a><span className="uq-scope">{data ? data.scope === 'workspace' ? 'Workspace aktif' : 'Hanya pemakaian saya' : 'Memuat…'}</span></div>
    {state.error && <div className="uq-notice" role="alert">{state.error}</div>}{!data && !state.error && <p role="status">Memuat pemakaian…</p>}
    {data && <>
      <CostSummary costs={data.costs}/>
      <div className="uq-notice"><p><strong>Estimasi berbeda dari debit saldo.</strong> Angka di atas memakai tarif dan kurs saat ini. Periksa saldo dan riwayat debit aktual di <a href="/dashboard/billing">Langganan &amp; Saldo</a> sesuai hak akses organisasi. Tidak ada kuota 5 jam atau mingguan.</p></div>
      <div className="uq-title"><h2>Ringkasan aktivitas</h2><span>{periods[range]}</span></div>
      <div className="uq-summary">{[['Panggilan AI', totals.requests, 'Termasuk percobaan ulang'], ['Total token tercatat', sum, 'Input, output, dan cache'], ['Belum terkonfirmasi', totals.unresolved, 'Masih berjalan / pemakaian tidak diketahui']].map(([label, value, note]) => <article key={label}><span>{label}</span><strong>{num(value)}</strong><small>{note}</small></article>)}</div>
      <div className="uq-analytics"><div className="uq-tabs" role="tablist" aria-label="Analisis pemakaian">{[['tokens', 'Token & cache'], ['credits', 'Biaya & kredit'], ['models', 'Model']].map(([id, label]) => <button key={id} id={`usage-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls="usage-analysis-panel" onClick={() => setTab(id)}>{label}</button>)}</div>
        <div className="uq-analysis-body" id="usage-analysis-panel" role="tabpanel" aria-labelledby={`usage-tab-${tab}`}>
          {tab === 'tokens' && <><div className="uq-title"><h2>Token &amp; cache</h2><span>{periods[range]}</span></div><div className="uq-token-stats">{[['Total token', num(sum)], ['Cache read / seluruh input', input + read + write ? `${Math.round(read / (input + read + write) * 100)}%` : '—'], ['Input baru', num(input)], ['Output', num(output)]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
          <div className="uq-token-bar" aria-hidden="true">{tokens.map(([label, value, color]) => <i key={label} className={`uq-${color}`} style={{ width: `${sum ? value / sum * 100 : 0}%` }}/>)}</div><dl className="uq-breakdown">{tokens.map(([label, value, color]) => <React.Fragment key={label}><dt><i className={`uq-dot uq-${color}`}/>{label}</dt><dd>{num(value)}<span>{sum ? `${Math.round(value / sum * 100)}%` : '—'}</span></dd></React.Fragment>)}</dl></>}
          {tab === 'credits' && <><CostSummary costs={data.costs}/><h2>Estimasi per permintaan · 50 terbaru</h2><div className="uq-table-wrap"><table><thead><tr><th>Model / waktu</th><th>Estimasi rupiah</th><th>Keterangan</th></tr></thead><tbody>{data.recent.map((row) => <tr key={row.id}><td>{row.model}<small>{date(row.startedAt)}</small></td><td>{row.costEstimate?.available ? rupiah(row.costEstimate.amountIdr) : 'Belum tersedia'}</td><td>{row.costEstimate?.available ? 'Tarif saat ini · bukan tagihan' : costReasons[row.costEstimate?.reason] || 'Belum dapat dihitung'}</td></tr>)}</tbody></table></div></>}
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
