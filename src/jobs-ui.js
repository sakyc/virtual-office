import { agentById } from '../shared/roster.js';
import { TYPE_LABEL, jobById, jobsOf, monthOptions } from '../shared/jobs.js';
import { api } from './api.js';
import { h, toast, ago } from './dom.js';

const KEY_CLIENT = 'kantorai.client';
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* abaikan */ } },
};

export function createJobsUI({ root, onStatus, onOpenItem, onDone }) {
  let agentId = null;
  let formJob = null;
  let formOpts = {};
  let clients = [];
  let clientId = Number(ls.get(KEY_CLIENT)) || 0;
  let history = [];
  let dbError = null;
  const pending = new Map(); // jobId -> { agent, type }
  let timer = null;

  // ---------- bar klien (tetap tampil di atas) ----------
  const clientSel = h('select', {
    id: 'client-sel',
    onchange: () => {
      clientId = Number(clientSel.value) || 0;
      ls.set(KEY_CLIENT, String(clientId));
    },
  });
  const nameIn = h('input', { type: 'text', placeholder: 'Nama klien', maxLength: 150 });
  const briefIn = h('textarea', { rows: 3, placeholder: 'Brief singkat: bisnis, target, brand voice, hal yang dihindari' });
  const clientErr = h('p', { class: 'form-err', hidden: true });
  const bar = h('div', { class: 'client-bar' },
    h('label', { for: 'client-sel' }, 'Klien (brief-nya dipakai agent)'),
    clientSel,
    h('details', { class: 'client-new' },
      h('summary', {}, '+ Klien baru'),
      nameIn,
      briefIn,
      clientErr,
      h('button', {
        type: 'button',
        class: 'btn primary',
        onclick: async () => {
          const name = nameIn.value.trim();
          if (!name) { clientErr.textContent = 'Nama klien wajib diisi.'; clientErr.hidden = false; return; }
          try {
            const c = await api('/clients', { method: 'POST', body: { name, brief: briefIn.value.trim() } });
            clientId = c.id;
            ls.set(KEY_CLIENT, String(clientId));
            nameIn.value = '';
            briefIn.value = '';
            clientErr.hidden = true;
            bar.querySelector('details').open = false;
            await loadClients();
            toast(`Klien "${c.name}" disimpan.`);
          } catch (e) { clientErr.textContent = e.message; clientErr.hidden = false; }
        },
      }, 'Simpan klien'),
    ),
  );
  const content = h('div', { class: 'jobs-content' });
  root.append(bar, content);

  function fillClients() {
    clientSel.replaceChildren(h('option', { value: 0 }, 'Tanpa klien'), ...clients.map((c) => h('option', { value: c.id }, c.name)));
    clientSel.value = String(clientId);
  }

  async function loadClients() {
    try { clients = await api('/clients'); dbError = null; } catch (e) { clients = []; dbError = e.message; }
    if (clientId && !clients.some((c) => c.id === clientId)) clientId = 0;
    fillClients();
  }

  async function loadHistory() {
    if (!agentId) return;
    try {
      history = await api(`/jobs?agent=${agentId}&limit=8`);
      for (const j of history) if (j.status === 'generating' && !pending.has(j.id)) pending.set(j.id, { agent: j.agentId, type: j.jobType });
      track();
    } catch { history = []; }
  }

  // ---------- polling job ----------
  function track() {
    if (timer || !pending.size) return;
    timer = setInterval(poll, 2500);
  }

  async function poll() {
    for (const [id, p] of [...pending]) {
      try {
        const j = await api(`/jobs/${id}`);
        if (j.status === 'generating') continue;
        pending.delete(id);
        const first = agentById(p.agent).name.split(' ')[0];
        const label = jobById(p.type)?.label || 'perintah';
        if (j.status === 'done') {
          onStatus(p.agent, 'done');
          toast(`${first} selesai: ${label}`, { action: 'Buka board', onAction: () => onOpenItem({ jobId: id }) });
          onDone();
        } else {
          onStatus(p.agent, 'idle');
          toast(`${first} gagal: ${j.error || 'coba lagi'}`);
        }
      } catch { /* coba lagi di putaran berikut */ }
    }
    if (!pending.size) { clearInterval(timer); timer = null; }
    if (agentId && !formJob) { await loadHistory(); if (!formJob) renderList(); }
  }

  // ---------- daftar perintah ----------
  function histRow(j) {
    const def = jobById(j.jobType);
    const state = j.status === 'generating' ? 'Diproses…' : j.status === 'failed' ? `Gagal: ${j.error || ''}` : `${j.itemCount} item`;
    return h('li', { class: `hist-row ${j.status}` },
      h('div', {}, h('b', {}, def?.label || j.jobType), h('small', {}, `${state} · ${ago(j.createdAt)}`)),
      j.status === 'done' && j.itemCount ? h('button', { type: 'button', class: 'btn ghost sm', onclick: () => onOpenItem({ jobId: j.id }) }, 'Lihat di board') : null,
    );
  }

  function renderList() {
    content.replaceChildren(...[
      dbError && h('div', { class: 'note warn' }, dbError),
      h('div', { class: 'job-list' },
        jobsOf(agentId).map((j) => h('button', { type: 'button', class: 'job-card', onclick: () => openForm(j.id) },
          h('b', {}, j.label),
          h('span', {}, j.desc),
          h('i', {}, TYPE_LABEL[j.type] || j.type),
        )),
      ),
      h('h4', { class: 'sec' }, 'Riwayat perintah'),
      history.length ? h('ul', { class: 'hist' }, history.map(histRow)) : h('p', { class: 'muted' }, 'Belum ada perintah. Pilih salah satu di atas.'),
    ].filter(Boolean));
  }

  // ---------- form ----------
  function buildField(f, get) {
    const id = `jf-${f.name}`;
    let input;
    if (f.type === 'textarea') {
      input = h('textarea', { id, rows: 4, placeholder: f.placeholder || '', maxLength: f.limit || 8000 });
      get[f.name] = () => input.value.trim();
    } else if (f.type === 'number') {
      input = h('input', { id, type: 'number', min: f.min, max: f.max, value: f.default });
      get[f.name] = () => Number(input.value);
    } else if (f.type === 'select') {
      input = h('select', { id }, f.options.map((o) => h('option', { value: o }, o)));
      input.value = f.default ?? f.options[0];
      get[f.name] = () => input.value;
    } else if (f.type === 'month') {
      const opts = monthOptions(6);
      input = h('select', { id }, opts.map((o) => h('option', { value: o.value }, o.label)));
      input.value = (opts[1] || opts[0]).value; // default: bulan depan
      get[f.name] = () => input.value;
    } else if (f.type === 'multi') {
      input = h('div', { class: 'chk-group', id },
        f.options.map((o) => h('label', {}, h('input', { type: 'checkbox', value: o, checked: (f.default || []).includes(o) }), o)));
      get[f.name] = () => [...input.querySelectorAll('input:checked')].map((i) => i.value);
    } else if (f.type === 'item') {
      input = h('select', { id }, h('option', { value: '' }, 'Memuat…'));
      get[f.name] = () => Number(input.value) || null;
      loadItemOptions(f, input);
    } else {
      input = h('input', { id, type: 'text', placeholder: f.placeholder || '', maxLength: 300 });
      get[f.name] = () => input.value.trim();
    }
    return h('div', { class: 'fld' }, h('label', { for: id }, f.label + (f.required ? ' *' : '')), input);
  }

  async function loadItemOptions(f, sel) {
    try {
      const list = await api(`/items?status=active&type=${f.itemType}&limit=100`);
      const pid = formOpts.parentId;
      if (pid && !list.some((i) => i.id === pid)) {
        try { list.unshift(await api(`/items/${pid}`)); } catch { /* abaikan */ }
      }
      const label = (i) => `${i.title}${i.status === 'approved' ? ' (disetujui)' : ''}`;
      sel.replaceChildren(
        h('option', { value: '' }, list.length ? 'Tanpa item board' : 'Belum ada item di board'),
        ...list.map((i) => h('option', { value: i.id }, label(i))),
      );
      if (pid) sel.value = String(pid);
    } catch {
      sel.replaceChildren(h('option', { value: '' }, 'Gagal memuat item'));
    }
  }

  function renderForm() {
    const job = formJob;
    const get = {};
    const err = h('p', { class: 'form-err', hidden: true });
    const submit = h('button', { type: 'submit', class: 'btn primary' }, 'Kirim ke agent');
    const showErr = (m) => { err.textContent = m; err.hidden = false; };

    const form = h('form', {
      class: 'job-form',
      onsubmit: async (e) => {
        e.preventDefault();
        const params = {};
        for (const f of job.fields) params[f.name] = get[f.name]();
        const empty = (v) => v === '' || v == null || Number.isNaN(v) || (Array.isArray(v) && !v.length);
        const missing = job.fields.find((f) => f.required && empty(params[f.name]));
        if (missing) return showErr(`${missing.label} wajib diisi.`);
        if (job.anyOf && !job.anyOf.some((n) => !empty(params[n]))) {
          return showErr(`Isi salah satu: ${job.anyOf.map((n) => job.fields.find((f) => f.name === n).label).join(' / ')}.`);
        }
        err.hidden = true;
        submit.disabled = true;
        try {
          const r = await api('/jobs', { method: 'POST', body: { jobType: job.id, params, clientId: clientId || null } });
          pending.set(r.jobId, { agent: job.agent, type: job.id });
          onStatus(job.agent, 'working');
          toast(`${agentById(job.agent).name.split(' ')[0]} mulai mengerjakan: ${job.label}`);
          formJob = null;
          await loadHistory();
          renderList();
          track();
        } catch (ex) {
          showErr(ex.message);
          submit.disabled = false;
        }
      },
    },
      h('button', { type: 'button', class: 'back', onclick: () => { formJob = null; renderList(); } }, '← Semua perintah'),
      h('h3', {}, job.label),
      h('p', { class: 'muted' }, job.desc),
      ...job.fields.map((f) => buildField(f, get)),
      err,
      submit,
    );
    content.replaceChildren(form);
    if (matchMedia('(hover: hover)').matches) form.querySelector('input:not([type=checkbox]), textarea')?.focus({ preventScroll: true });
  }

  function openForm(jobId, opts = {}) {
    const job = jobById(jobId);
    if (!job) return;
    formJob = job;
    formOpts = opts;
    renderForm();
  }

  async function setAgent(id) {
    agentId = id;
    formJob = null;
    renderList();
    await Promise.all([loadClients(), loadHistory()]);
    if (agentId === id && !formJob) renderList();
  }

  return { setAgent, openForm };
}
