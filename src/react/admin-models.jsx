import React, { useEffect, useRef, useState } from 'react';
import { billingOperationRequest } from './billing-operations-data.js';
import { TariffEditor } from './admin-billing-operations.jsx';
import { modelStatus, modelStatusUpdate, modelTariffRecord } from './admin-models-data.js';

export function ModelStatusDialog({ model, onClose, onSaved, onDenied }) {
  const dialog = useRef(null), busy = useRef(false), controller = useRef(null);
  const [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID()), [status, setStatus] = useState({});
  const action = model.enabled ? 'Nonaktifkan' : 'Aktifkan';
  useEffect(() => { dialog.current.showModal(); return () => controller.current?.abort(); }, []);
  async function submit(event) {
    event.preventDefault(); if (busy.current) return;
    busy.current = true; setStatus({ saving: true }); controller.current = new AbortController();
    try {
      const body = modelStatusUpdate(model, { reason, requestId, confirmed });
      await billingOperationRequest(`/api/admin/billing/tariffs/${model.model}`, { method: 'PUT', body, signal: controller.current.signal });
      if (!controller.current.signal.aborted) onSaved();
    } catch (error) {
      if (!controller.current.signal.aborted) {
        if ([401, 403].includes(error.status)) onDenied(error.message);
        else setStatus({ error: error.message });
      }
    } finally { busy.current = false; }
  }
  return <dialog className="admin-action-dialog" ref={dialog} aria-label={`${action} model AI`} onCancel={event => { if (busy.current) event.preventDefault(); else onClose(); }}>
    <form onSubmit={submit}><span className="admin-kicker">PENGATURAN MODEL AI</span><h2>{action} {model.label}?</h2>
      <p>{model.enabled ? 'Permintaan baru akan ditolak untuk model ini, termasuk jika menjadi default agen. Model tidak diganti diam-diam. Chat lama tetap bisa dibaca.' : 'Model hanya dapat digunakan jika tarif, konfigurasi, langganan, dan saldo organisasi memenuhi syarat.'}</p>
      <p>Harga tidak berubah: input ${model.tariff.inputUsdPerMillion}, output ${model.tariff.outputUsdPerMillion}, cache read ${model.tariff.cacheReadUsdPerMillion} per 1 juta token. Permintaan yang sudah memiliki snapshot tetap memakai tarif semula.</p>
      <fieldset disabled={status.saving}><label>Alasan perubahan<textarea required minLength={5} maxLength={500} value={reason} onChange={event => { setReason(event.target.value); setConfirmed(false); setRequestId(crypto.randomUUID()); setStatus({}); }}/></label>
        <label className="catalog-check"><input required type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>Saya menyetujui status baru dan penggunaan tarif yang ditampilkan. Tidak ada harga yang diubah melalui tindakan ini.</label>
        {status.error && <p role="alert">{status.error}</p>}<div className="admin-dialog-actions"><button type="button" onClick={onClose}>Batal</button><button type="submit" className="admin-primary">{status.saving ? 'Menyimpan…' : `${action} model`}</button></div>
      </fieldset>
    </form>
  </dialog>;
}

export function ModelTable({ models, onEdit, onToggle }) {
  const cost = { economy: 'Hemat', balanced: 'Seimbang', premium: 'Premium', unspecified: 'Belum ditentukan' };
  return <div className="admin-directory-table"><table><thead><tr><th>Model / provider</th><th>Kategori</th><th>USD / 1 juta token</th><th>Status</th><th>Pengaturan</th></tr></thead><tbody>
    {models.map(model => <tr key={model.model}><td><strong>{model.label}</strong><small>{model.model}</small><small>Anthropic · {model.discovered ? 'Terdeteksi provider' : 'Ketersediaan provider belum dikonfirmasi'}</small></td>
      <td>{cost[model.costClass] || cost.unspecified}</td>
      <td>{model.tariff ? <>Input ${model.tariff.inputUsdPerMillion} · Output ${model.tariff.outputUsdPerMillion}<small>Cache read ${model.tariff.cacheReadUsdPerMillion}</small></> : 'Harga belum tersedia'}<small>{model.source === 'admin' ? `Tarif admin · v${model.version}` : model.tariff ? 'Tarif awal tersimpan' : 'Belum dikonfigurasi'}</small></td>
      <td><span className={`admin-badge${model.selectable ? '' : ' muted'}`}>{modelStatus(model)}</span>{model.retired && <small>Provider sudah menghentikan model ini.</small>}</td>
      <td><div className="admin-row-actions"><button onClick={() => onEdit(model)}>{model.tariff ? 'Edit harga' : 'Konfigurasi tarif'}</button><button disabled={!model.tariff || (!model.enabled && model.retired)} onClick={() => onToggle(model)}>{model.enabled ? 'Nonaktifkan' : 'Aktifkan'}</button></div></td>
    </tr>)}
    {!models.length && <tr><td className="admin-empty" colSpan={5}>Tidak ada model yang cocok.</td></tr>}
  </tbody></table></div>;
}

export function AdminModels({ onDenied }) {
  const [state, setState] = useState({ loading: true }), [retry, setRetry] = useState(0), [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'), [editor, setEditor] = useState(null), [toggle, setToggle] = useState(null), [saved, setSaved] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setState({ loading: true });
    billingOperationRequest('/api/admin/models', { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setState({ models: data.models }); })
      .catch(error => { if (!controller.signal.aborted) { setState({ error: error.message }); if ([401, 403].includes(error.status)) onDenied(error.message); } });
    return () => controller.abort();
  }, [retry]);
  function reload() { setEditor(null); setToggle(null); setState({ loading: true }); setRetry(n => n + 1); }
  function complete() { setSaved(true); reload(); }
  if (state.loading) return <section className="admin-panel" role="status">Memuat katalog model AI…</section>;
  if (state.error) return <section className="admin-panel" role="alert"><p>{state.error}</p><button onClick={reload}>Muat ulang model</button></section>;
  const models = state.models.filter(model => `${model.label} ${model.model}`.toLowerCase().includes(search.trim().toLowerCase())
    && (filter === 'all' || (filter === 'active' ? model.selectable : !model.selectable)));
  return <section className="admin-panel admin-directory">
    <div className="admin-section-heading"><div><h2>Katalog model AI</h2><p>Model dan tarif awal tersimpan di database. Seeder tidak menimpa perubahan admin; model baru tanpa tarif tetap tidak aktif.</p></div><button onClick={reload}>Muat ulang model</button></div>
    <div className="admin-policy"><p>Harga dasar dalam USD per 1 juta token. Biaya pelanggan = penggunaan × tarif × kurs rupiah × 2. Perubahan hanya berlaku untuk permintaan baru; chat dan catatan biaya lama tidak dihapus.</p></div>
    {saved && <p className="admin-success" role="status">Pengaturan model tersimpan dan dicatat dalam log perubahan.</p>}
    <div className="admin-model-filters"><label>Cari model<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nama atau ID model"/></label>
      <label>Status<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Semua model</option><option value="active">Aktif</option><option value="inactive">Tidak dapat digunakan</option></select></label><small>{models.length} dari {state.models.length} model</small></div>
    <ModelTable models={models} onEdit={setEditor} onToggle={setToggle}/>
    {editor && <section className="admin-model-editor"><div className="admin-section-heading"><h2>Tarif khusus · {editor.label}</h2><button onClick={() => setEditor(null)}>Tutup editor</button></div><TariffEditor key={`${editor.model}:${editor.version}`} record={modelTariffRecord(editor)} onSaved={complete} onDenied={onDenied}/></section>}
    {toggle && <ModelStatusDialog model={toggle} onClose={() => setToggle(null)} onSaved={complete} onDenied={onDenied}/>}
    <p className="admin-directory-note">Belum ada penghapusan model atau pengaturan default agen dari halaman ini. Model yang pernah dipakai tetap dipertahankan untuk riwayat; gunakan Nonaktifkan.</p>
  </section>;
}
