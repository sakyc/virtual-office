import { DIVISIONS, AGENTS, agentById, agentsOf, divisionById } from '../shared/roster.js';
import { TYPE_LABEL, jobsForParent } from '../shared/jobs.js';
import { api } from './api.js';
import { h, toast, ago, copyText, debounce } from './dom.js';
import { studioSection } from './studio.js';

const STATUS_LABEL = { draft: 'Draft', revising: 'Direvisi…', approved: 'Disetujui', rejected: 'Ditolak' };
const TABS = [['draft', 'Draft'], ['approved', 'Disetujui'], ['rejected', 'Ditolak'], ['all', 'Semua'], ['trash', 'Sampah']];
const LIMITS = [[/headline/i, 30], [/deskripsi/i, 90]]; // batas karakter Google RSA

function toText(d) {
  const body = d.content.fields
    .map((f) => `${f.label}\n${Array.isArray(f.value) ? f.value.map((v) => `- ${v}`).join('\n') : f.value}`)
    .join('\n\n');
  return `${d.title}\n\n${body}`;
}

export function createBoard({ onContinue, onChange }) {
  const st = { open: false, status: 'draft', division: '', agent: '', type: '', q: '', jobId: null, items: [], detail: null, mode: null };

  // ---------- kerangka ----------
  const divSel = h('select', { 'aria-label': 'Divisi', onchange: () => { st.division = divSel.value; st.agent = ''; st.jobId = null; fillAgents(); load(); } },
    h('option', { value: '' }, 'Semua divisi'), DIVISIONS.map((d) => h('option', { value: d.id }, d.name)));
  const agentSel = h('select', { 'aria-label': 'Agent', onchange: () => { st.agent = agentSel.value; st.jobId = null; load(); } });
  const typeSel = h('select', { 'aria-label': 'Jenis', onchange: () => { st.type = typeSel.value; st.jobId = null; load(); } },
    h('option', { value: '' }, 'Semua jenis'), Object.entries(TYPE_LABEL).map(([k, v]) => h('option', { value: k }, v)));
  const search = h('input', { type: 'search', placeholder: 'Cari judul atau isi…', 'aria-label': 'Cari', oninput: debounce(() => { st.q = search.value.trim(); st.jobId = null; load(); }, 300) });
  const jobChip = h('button', { type: 'button', class: 'chip-x', hidden: true, onclick: () => { st.jobId = null; load(); } });
  const tabsEl = h('div', { class: 'board-tabs', role: 'tablist' });
  const grid = h('div', { class: 'board-grid' });
  const drawer = h('aside', { class: 'drawer', hidden: true, 'aria-label': 'Detail item' });
  const root = h('div', { class: 'board', hidden: true, role: 'dialog', 'aria-label': 'Board kerja' },
    h('div', { class: 'board-wrap' },
      h('div', { class: 'board-head' },
        h('h2', {}, 'Board kerja'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tutup board', onclick: () => close() }, '✕'),
      ),
      h('div', { class: 'board-filters' }, divSel, agentSel, typeSel, search, jobChip),
      tabsEl,
      grid,
    ),
    drawer,
  );
  document.body.append(root);
  // cegah browser memulihkan isian dropdown lama saat halaman dimuat ulang
  for (const el of [divSel, agentSel, typeSel, search]) el.setAttribute('autocomplete', 'off');

  function fillAgents() {
    const list = st.division ? agentsOf(st.division) : AGENTS;
    agentSel.replaceChildren(h('option', { value: '' }, 'Semua agent'), ...list.map((a) => h('option', { value: a.id }, a.name.split(' ')[0])));
    agentSel.value = st.agent;
  }

  function renderTabs() {
    tabsEl.replaceChildren(...TABS.map(([id, label]) =>
      h('button', { type: 'button', role: 'tab', 'aria-pressed': String(st.status === id), onclick: () => { st.status = id; renderTabs(); load(); } }, label)));
  }

  // ---------- daftar ----------
  async function load(quiet = false) {
    const qs = new URLSearchParams({ status: st.status, limit: '200' });
    const agents = st.agent ? [st.agent] : st.division ? agentsOf(st.division).map((a) => a.id) : [];
    if (agents.length) qs.set('agent', agents.join(','));
    if (st.type) qs.set('type', st.type);
    if (st.q) qs.set('q', st.q);
    if (st.jobId) qs.set('job', st.jobId);
    jobChip.hidden = !st.jobId;
    jobChip.textContent = `Perintah #${st.jobId} ✕`;
    try {
      st.items = await api(`/items?${qs}`);
      renderGrid();
    } catch (e) {
      if (!quiet) grid.replaceChildren(h('p', { class: 'muted empty-note' }, e.message));
    }
  }

  function preview(it) {
    const f = it.content.fields.find((x) => x.kind === 'text') || it.content.fields[0];
    const v = Array.isArray(f?.value) ? f.value.join(' · ') : f?.value || '';
    return v.length > 150 ? `${v.slice(0, 150)}…` : v;
  }

  function renderGrid() {
    if (!st.items.length) {
      grid.replaceChildren(h('p', { class: 'muted empty-note' },
        st.status === 'trash' ? 'Sampah kosong.' : 'Belum ada item di sini. Klik karakter di kantor, buka tab Perintah, lalu kirim tugas.'));
      return;
    }
    grid.replaceChildren(...st.items.map((it) => {
      const agent = agentById(it.agentId);
      const div = divisionById(agent.division);
      return h('article', {
        class: `bcard ${st.detail?.id === it.id ? 'on' : ''}`,
        tabindex: 0,
        style: `--c:${div.color}`,
        onclick: () => openDetail(it.id),
        onkeydown: (e) => { if (e.key === 'Enter') openDetail(it.id); },
      },
        h('div', { class: 'bc-top' },
          h('span', { class: 'pill' }, TYPE_LABEL[it.type] || it.type),
          h('span', { class: `pill st ${it.status}` }, STATUS_LABEL[it.status]),
        ),
        h('h3', {}, it.title),
        h('p', { class: 'bc-prev' }, preview(it)),
        h('div', { class: 'bc-foot' },
          h('span', { class: 'dot' }),
          h('span', {}, `${agent.name.split(' ')[0]}${it.tag ? ` · ${it.tag}` : ''}`),
          h('small', {}, ago(it.createdAt)),
        ),
      );
    }));
  }

  // ---------- detail ----------
  // Panel Studio (gambar/video) di-cache per item+versi supaya tidak digambar ulang tiap detail dirender.
  let studio = { key: '', el: null };
  function studioFor(d) {
    if (d.deleted) return null;
    const key = `${d.id}:${d.version}`;
    if (studio.key !== key) studio = { key, el: studioSection(d) };
    return studio.el;
  }

  async function openDetail(id) {
    try {
      st.detail = await api(`/items/${id}`);
      st.mode = null;
      drawer.hidden = false;
      renderDetail();
      renderGrid();
    } catch (e) { toast(e.message); }
  }

  async function refreshDetail() {
    if (!st.detail) return;
    try { st.detail = await api(`/items/${st.detail.id}`); renderDetail(); } catch { /* item mungkin sudah dihapus permanen */ }
  }

  function closeDrawer() {
    st.detail = null;
    st.mode = null;
    drawer.hidden = true;
    renderGrid();
  }

  function fieldEl(d, f, fi) {
    const sec = h('section', { class: 'f' }, h('h4', {}, f.label));
    if (f.kind === 'list') {
      const lim = (LIMITS.find(([re]) => re.test(f.label)) || [])[1];
      sec.append(h('ul', {}, f.value.map((v) => h('li', {}, v, lim && h('small', { class: v.length > lim ? 'over' : 'ok' }, ` ${v.length}/${lim}`)))));
    } else if (f.kind === 'checklist') {
      sec.append(h('ul', { class: 'chk' }, f.value.map((v, i) => h('li', {}, h('label', {},
        h('input', {
          type: 'checkbox',
          checked: Boolean(f.checked?.[i]),
          onchange: (e) => api(`/items/${d.id}/check`, { method: 'POST', body: { f: fi, i, on: e.target.checked } })
            .catch((err) => { e.target.checked = !e.target.checked; toast(err.message); }),
        }), v)))));
    } else if (f.kind === 'code') {
      const btn = h('button', { type: 'button', class: 'copy', onclick: () => copyText(f.value, btn) }, 'Salin');
      sec.append(h('pre', {}, btn, h('code', {}, f.value)));
    } else {
      sec.append(h('div', { class: 'f-text' }, f.value));
    }
    return sec;
  }

  async function act(path, opts, msg, { closeAfter = false } = {}) {
    try {
      await api(path, opts);
      if (msg) toast(msg);
      st.mode = null;
      if (closeAfter) closeDrawer(); else await refreshDetail();
      await load(true);
      onChange();
    } catch (e) { toast(e.message); }
  }

  function reasonPanel({ label, placeholder, required, cta, danger, onSubmit }) {
    const ta = h('textarea', { rows: 3, placeholder, maxLength: 1500 });
    const err = h('p', { class: 'form-err', hidden: true });
    return h('div', { class: 'reason' },
      h('label', {}, label), ta, err,
      h('div', { class: 'row' },
        h('button', {
          type: 'button',
          class: `btn ${danger ? 'danger' : 'primary'}`,
          onclick: () => {
            const v = ta.value.trim();
            if (required && v.length < 3) { err.textContent = 'Tulis alasannya dulu.'; err.hidden = false; return; }
            onSubmit(v);
          },
        }, cta),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => { st.mode = null; renderDetail(); } }, 'Batal'),
      ),
    );
  }

  function actionsEl(d) {
    const id = d.id;
    const set = (m) => () => { st.mode = m; renderDetail(); };
    if (d.deleted) {
      return h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => act(`/items/${id}/restore`, { method: 'POST' }, 'Item dipulihkan') }, 'Pulihkan'),
        h('button', { type: 'button', class: 'btn danger', onclick: set('purge') }, 'Hapus permanen'),
      );
    }
    if (st.mode === 'revise') {
      return reasonPanel({
        label: 'Apa yang perlu diubah?', placeholder: 'mis. hook terlalu umum, ganti sudut pandang jadi cerita klien', required: true, cta: 'Kirim revisi',
        onSubmit: (reason) => act(`/items/${id}/revise`, { method: 'POST', body: { reason } }, 'Revisi dikirim ke agent'),
      });
    }
    if (st.mode === 'reject') {
      return reasonPanel({
        label: 'Alasan menolak (opsional)', placeholder: 'Dicatat di kartu supaya tim tahu kenapa', required: false, cta: 'Tolak', danger: true,
        onSubmit: (reason) => act(`/items/${id}/reject`, { method: 'POST', body: { reason } }, 'Item ditolak'),
      });
    }
    if (st.mode === 'delete' || st.mode === 'purge') {
      const purge = st.mode === 'purge';
      return h('div', { class: 'reason' },
        h('p', {}, purge ? 'Hapus permanen? Item dan riwayat revisinya tidak bisa dikembalikan.' : 'Pindahkan item ke Sampah? Masih bisa dipulihkan.'),
        h('div', { class: 'row' },
          h('button', {
            type: 'button',
            class: 'btn danger',
            onclick: () => act(`/items/${id}${purge ? '?permanent=1' : ''}`, { method: 'DELETE' }, purge ? 'Dihapus permanen' : 'Dipindah ke Sampah', { closeAfter: true }),
          }, purge ? 'Hapus permanen' : 'Hapus'),
          h('button', { type: 'button', class: 'btn ghost', onclick: set(null) }, 'Batal'),
        ),
      );
    }
    if (d.status === 'revising') return h('p', { class: 'muted' }, 'Agent sedang merevisi item ini…');
    return h('div', { class: 'row' },
      d.status !== 'approved' && h('button', { type: 'button', class: 'btn primary', onclick: () => act(`/items/${id}/approve`, { method: 'POST' }, 'Item disetujui') }, 'Setujui'),
      h('button', { type: 'button', class: 'btn', onclick: set('revise') }, 'Revisi'),
      d.status !== 'rejected' && h('button', { type: 'button', class: 'btn', onclick: set('reject') }, 'Tolak'),
      h('button', { type: 'button', class: 'btn danger-ghost', onclick: set('delete') }, 'Hapus'),
    );
  }

  function renderDetail() {
    const d = st.detail;
    if (!d) return;
    const agent = agentById(d.agentId);
    const div = divisionById(agent.division);
    drawer.style.setProperty('--c', div.color);

    const follow = d.deleted || d.status === 'rejected' ? [] : jobsForParent(d.type);
    drawer.replaceChildren(
      h('div', { class: 'd-head' },
        h('div', {},
          h('div', { class: 'bc-top' },
            h('span', { class: 'pill' }, TYPE_LABEL[d.type] || d.type),
            h('span', { class: `pill st ${d.deleted ? 'rejected' : d.status}` }, d.deleted ? 'Di sampah' : STATUS_LABEL[d.status]),
            d.version > 1 && h('span', { class: 'pill' }, `v${d.version}`),
          ),
          h('h2', {}, d.title),
          h('p', { class: 'muted' }, `${agent.name} · ${agent.role}${d.clientName ? ` · ${d.clientName}` : ''}${d.tag ? ` · ${d.tag}` : ''} · ${ago(d.createdAt)}`),
        ),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tutup detail', onclick: closeDrawer }, '✕'),
      ),
      h('div', { class: 'd-body' },
        d.status === 'rejected' && d.rejectReason && h('div', { class: 'note warn' }, `Ditolak: ${d.rejectReason}`),
        d.lastError && h('div', { class: 'note warn' }, `Revisi gagal: ${d.lastError}`),
        d.parent && h('p', { class: 'muted' }, 'Berasal dari: ', h('button', { type: 'button', class: 'link', onclick: () => openDetail(d.parent.id) }, d.parent.title)),
        studioFor(d),
        d.content.fields.map((f, i) => fieldEl(d, f, i)),
        h('button', { type: 'button', class: 'btn ghost sm', onclick: (e) => copyText(toText(d), e.currentTarget) }, 'Salin semua'),
        d.children.length > 0 && h('section', { class: 'f' }, h('h4', {}, 'Turunan'),
          h('ul', {}, d.children.map((c) => h('li', {}, h('button', { type: 'button', class: 'link', onclick: () => openDetail(c.id) }, `${TYPE_LABEL[c.type] || c.type}: ${c.title}`), ` (${STATUS_LABEL[c.status]})`)))),
        d.revisions.length > 0 && h('details', { class: 'f' }, h('summary', {}, `Riwayat revisi (${d.revisions.length})`),
          h('ul', {}, d.revisions.map((r) => h('li', {}, h('b', {}, `v${r.version} diganti: `), r.reason, h('small', {}, ` · ${ago(r.createdAt)}`))))),
      ),
      h('div', { class: 'd-foot' },
        follow.length > 0 && st.mode == null && h('div', { class: 'row follow' },
          follow.map((j) => h('button', { type: 'button', class: 'btn sm', onclick: () => onContinue(j.id, d.id) }, `→ ${j.label}`))),
        actionsEl(d),
      ),
    );
    drawer.querySelector('.reason textarea')?.focus({ preventScroll: true });
  }

  // ---------- buka / tutup ----------
  const tick = () => {
    if (!st.open || document.hidden) return;
    load(true);
    if (st.detail && st.detail.status === 'revising') refreshDetail().then(() => { if (st.detail?.status !== 'revising') onChange(); });
  };
  let timer = null;

  function open(target = {}) {
    st.open = true;
    st.jobId = target.jobId || null;
    st.status = target.jobId || target.itemId ? 'all' : target.status || 'draft';
    root.hidden = false;
    document.body.classList.add('board-open');
    renderTabs();
    divSel.value = st.division;
    typeSel.value = st.type;
    search.value = st.q;
    fillAgents();
    load().then(() => { if (target.itemId) openDetail(target.itemId); });
    timer ||= setInterval(tick, 5000);
  }

  function close() {
    st.open = false;
    root.hidden = true;
    closeDrawer();
    document.body.classList.remove('board-open');
    clearInterval(timer);
    timer = null;
    onChange();
  }

  // Escape menutup drawer dulu, lalu board; jangan ikut menutup panel chat di belakangnya.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !st.open) return;
    e.stopPropagation();
    if (!drawer.hidden) closeDrawer(); else close();
  }, true);

  return { open, close, isOpen: () => st.open };
}
