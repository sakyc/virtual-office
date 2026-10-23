import React, { useEffect, useState } from 'react';
import { loadUsage } from './usage-data.js';
import './dashboard-overview.css';
import './usage-page.css';

export function UsagePage() {
  const [state, setState] = useState({ data: null, error: '' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, error: '' });
    loadUsage(controller.signal).then((data) => {
      if (!controller.signal.aborted) setState({ data, error: '' });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ data: null, error: 'Pemakaian belum tersedia. Periksa sesi dan kesiapan migrasi 004 dengan operator.' });
    });
    return () => controller.abort();
  }, [retry]);
  const data = state.data;
  return <section className="live-overview usage-page"><h1>Pemakaian AI</h1>
    <p>30 hari terakhir · {data?.scope === 'workspace' ? 'Workspace aktif' : 'Pemakaian pribadi'}</p>
    <button className="live-primary" onClick={() => setRetry((value) => value + 1)}>Muat ulang</button>
    {state.error && <p role="alert">{state.error}</p>}
    {!data && !state.error && <p role="status">Memuat pemakaian…</p>}
    {data && <><div className="live-card"><dl>
      <dt>Panggilan AI</dt><dd>{data.totals.requests}</dd>
      <dt>Token input (di luar cache)</dt><dd>{data.totals.inputTokens}</dd>
      <dt>Token output</dt><dd>{data.totals.outputTokens}</dd>
      <dt>Token baca cache</dt><dd>{data.totals.cacheReadTokens}</dd>
      <dt>Token penulisan cache</dt><dd>{data.totals.cacheCreationTokens}</dd>
      <dt>Panggilan belum terkonfirmasi</dt><dd>{data.totals.unresolved || 0}</dd>
    </dl><p>Angka token hanya mencakup pemakaian yang dilaporkan provider. Panggilan terputus atau masih berjalan bukan berarti gratis. Belum termasuk biaya, saldo kredit, atau kuota langganan.</p></div>
    <div className="live-card"><h2>50 panggilan terbaru</h2>{!data.recent.length ? <p>Belum ada pemakaian tercatat. Riwayat sebelum pencatatan diaktifkan tidak dimasukkan.</p> : <ul>{data.recent.map((row) => <li key={row.id}>
      <strong>{row.agentId}</strong> · {row.operation} · {row.model} · {row.status === 'completed' ? 'Tercatat' : 'Belum terkonfirmasi'}
      <p>Input: {row.inputTokens ?? 'Belum diketahui'} · Output: {row.outputTokens ?? 'Belum diketahui'}</p>
    </li>)}</ul>}</div></>}
  </section>;
}
