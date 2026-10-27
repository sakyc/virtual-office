import { h } from './dom.js';
import { createWorkApi } from './react/work-api.js';

// Embedded office only: no legacy /api routes, access codes or browser tenant claims.
export function createTenantJobsUI({ root, api = createWorkApi(), mountComposer }) {
  let agentId = null, version = 0, controller = null, stopped = false, saving = false;
  let clients = [], history = [], clientId = '', error = '', loading = false;
  let unmountComposer = null;
  const composerHost = h('div');
  const clientSel = h('select', { id: 'tenant-client-sel', onchange: () => { clientId = clientSel.value; } });
  const name = h('input', { type: 'text', placeholder: 'Nama klien', maxLength: 150, required: true });
  const brief = h('textarea', { rows: 3, maxLength: 4000, placeholder: 'Brief bisnis dan konteks klien' });
  const clientError = h('p', { class: 'form-err', hidden: true });
  const status = h('p', { role: 'status', class: 'muted' });
  const save = h('button', { type: 'submit', class: 'btn primary' }, 'Simpan klien');
  const details = h('details', { class: 'client-new' }, h('summary', {}, '+ Klien baru'), h('form', { onsubmit: createClient }, name, brief, clientError, save));
  const content = h('div', { class: 'jobs-content' });
  root.append(h('div', { class: 'client-bar' }, h('label', { for: 'tenant-client-sel' }, 'Klien workspace (konteks bisnis)'), clientSel, details, status), content, composerHost);

  function closeComposer() { unmountComposer?.(); unmountComposer = null; composerHost.replaceChildren(); }
  function openComposer() {
    if (loading || error || stopped || !agentId) return;
    if (!mountComposer) return;
    closeComposer();
    unmountComposer = mountComposer(composerHost, { embedded: true, agentId, clientId, api, onCancel: closeComposer,
      onCreated: id => { closeComposer(); status.textContent = `Tugas #${id} diterima. Hasil akan muncul di Board.`; void loadAfterCreated(id); } });
    composerHost.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }
  async function loadAfterCreated(id) { await setAgent(agentId); if (!stopped) status.textContent = `Tugas #${id} diterima. Pantau hasil di Board.`; }

  function render() {
    clientSel.replaceChildren(h('option', { value: '' }, 'Tanpa klien'), ...clients.map(c => h('option', { value: String(c.id) }, c.name)));
    if (!clients.some(c => String(c.id) === clientId)) clientId = '';
    clientSel.value = clientId; clientSel.disabled = loading || !!error;
    save.disabled = loading || saving || !!error || stopped;
    content.replaceChildren(...[
      error && h('div', { class: 'note warn', role: 'alert' }, error, h('button', { type: 'button', class: 'btn ghost sm', onclick: () => setAgent(agentId) }, 'Coba lagi')),
      loading && h('p', { role: 'status', class: 'muted' }, 'Memuat data workspace…'),
      h('button', { type: 'button', class: 'btn primary', disabled: loading || !!error, onclick: openComposer }, '+ Buat tugas untuk agen ini'),
      h('p', { class: 'muted' }, 'Tulis tugas bebas atau pilih template. Hasilnya masuk sebagai draft di Board untuk Anda tinjau.'),
      h('div', { class: 'job-list' },
        h('a', { class: 'job-card', href: '/dashboard/templates', target: '_top' }, h('b', {}, 'Kelola → Template Tugas'), h('span', {}, 'Buat dan simpan instruksi tugas custom.')),
        h('a', { class: 'job-card', href: '/dashboard/board', target: '_top' }, h('b', {}, 'Perintah & Board'), h('span', {}, 'Lihat hasil dan pekerjaan workspace.'))),
      h('h4', { class: 'sec' }, 'Riwayat perintah agen ini'),
      !loading && !error && (history.length ? h('ul', { class: 'hist' }, history.map(job => h('li', { class: 'hist-row' }, h('div', {}, h('b', {}, job.title || job.jobType), h('small', {}, job.status === 'generating' ? 'Diproses' : job.status === 'failed' ? 'Gagal' : 'Selesai'), job.status === 'failed' && h('p', { class: 'note warn' }, job.failure?.message || 'Penyebab rinci belum tercatat. Hubungi admin sebelum mencoba lagi.'))))) : h('p', { class: 'muted' }, 'Belum ada tugas yang terhubung ke agen ini.')),
    ].filter(Boolean));
  }
  async function createClient(event) {
    event.preventDefault();
    if (saving || stopped || loading || error) return;
    if (!name.value.trim()) { clientError.textContent = 'Nama klien wajib diisi.'; clientError.hidden = false; return; }
    saving = true; save.disabled = true; clientError.hidden = true; status.textContent = '';
    const requestVersion = version;
    try {
      const client = await api.createClient({ name: name.value.trim(), brief: brief.value.trim() }, controller?.signal);
      if (stopped || requestVersion !== version) return;
      clients = [...clients, client].sort((a, b) => a.name.localeCompare(b.name)); clientId = String(client.id);
      name.value = ''; brief.value = ''; details.open = false;
      status.textContent = `Klien “${client.name}” disimpan di workspace aktif.`;
    } catch (failure) {
      if (!stopped && requestVersion === version && failure.name !== 'AbortError') {
        clientError.textContent = failure.message; clientError.hidden = false;
        if ([401, 403].includes(failure.status)) { clients = []; history = []; clientId = ''; error = failure.message; }
      }
    } finally { saving = false; if (!stopped) render(); }
  }
  async function setAgent(id) {
    if (stopped) return;
    closeComposer();
    agentId = id; const requestVersion = ++version;
    controller?.abort(); controller = new AbortController();
    clients = []; history = []; clientId = ''; error = ''; loading = true; clientError.hidden = true; status.textContent = ''; render();
    try {
      const [clientData, jobData] = await Promise.all([api.clients(controller.signal), api.jobs(controller.signal)]);
      if (stopped || requestVersion !== version) return;
      clients = clientData.clients; history = jobData.jobs.filter(job => job.agentId === id).slice(0, 8);
    } catch (failure) {
      if (stopped || requestVersion !== version || failure.name === 'AbortError') return;
      clients = []; history = []; error = failure.message;
    } finally { if (!stopped && requestVersion === version) { loading = false; render(); } }
  }
  function dispose() { stopped = true; version++; controller?.abort(); closeComposer(); clients = []; history = []; }
  return { setAgent, dispose, openForm: openComposer };
}
