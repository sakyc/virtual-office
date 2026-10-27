import './style.css';
import { DIVISIONS as TEMPLATE_DIVISIONS, AGENTS as TEMPLATE_AGENTS } from '../shared/roster.js';
import { sceneRoster } from '../shared/workspace-team.js';
import { officeRoomLayout } from '../shared/office-layout.js';
import { createStage } from './stage.js';
import { createTags } from './tags.js';
import { createPanel } from './panel.js';
import { fetchConfig, getCode, setCode, tenantOffice } from './chat.js';
import './board.css';
import { jobById } from '../shared/jobs.js';
import { api, setAuthHandler } from './api.js';
import { createJobsUI } from './jobs-ui.js';
import { createTenantJobsUI } from './tenant-jobs-ui.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceTaskComposer } from './react/workspace-task-composer.jsx';
import { createBoard } from './board.js';
import { applyOfficeWorkloads } from './office-workloads.js';
import { createOfficeUpgradeDialog } from './office-upgrade.js';

const $ = (id) => document.getElementById(id);
const mobile = matchMedia('(max-width: 760px)');

const config = { demo: false, needsCode: false, offline: false };
let roster = { divisions: TEMPLATE_DIVISIONS, agents: TEMPLATE_AGENTS }, teamError = '';
if (tenantOffice) {
  roster = { divisions: [], agents: [], divisionCapacity: 0 };
  try {
    const response = await fetch('/api/team', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error();
    const body = await response.json();
    roster = sceneRoster({ ...body, divisionCapacity: body.divisionCapacity ?? 0 });
  } catch { teamError = 'Tim belum dapat dimuat. Tidak ada agen template yang diaktifkan sebagai pengganti. Periksa migration 005 dengan operator.'; }
}
const DIVISIONS = officeRoomLayout(roster.divisions, roster.divisionCapacity ?? null);
const agentById = (id) => roster.agents.find((a) => a.id === id);
const divisionById = (id) => roster.divisions.find((d) => d.id === id);

// ---------- scene ----------
const stage = createStage($('scene'), roster);
const tags = createTags(stage, $('tags'));
const { byId, rooms } = stage.office;
const upgrade = createOfficeUpgradeDialog({ capacity: roster.divisionCapacity ?? 0 });
addEventListener('pagehide', () => upgrade.dispose(), { once: true });

// ---------- state tampilan ----------
let selectedId = null;
let view = { kind: 'overview', id: null };
const doneTimers = new Map();

// ---------- chips divisi ----------
const chipsEl = $('chips');
const chipDefs = [
  { id: 'overview', label: 'Seluruh kantor', color: '#1d2433' },
  ...DIVISIONS.map((d, slot) => ({ id: d.id, label: d.roomState === 'locked' ? `🔒 Ruang ${slot + 1}` : d.name, color: d.color })),
];
for (const c of chipDefs) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.dataset.id = c.id;
  b.style.setProperty('--c', c.color);
  b.innerHTML = c.id === 'overview' ? '' : '<span class="dot"></span>';
  b.append(c.label);
  b.addEventListener('click', () => goTo(c.id));
  chipsEl.appendChild(b);
}

function markChip(id) {
  for (const b of chipsEl.children) b.setAttribute('aria-pressed', String(b.dataset.id === id));
  const active = chipsEl.querySelector(`[aria-pressed="true"]`);
  active?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
}

function goTo(id) {
  if (rooms.get(id)?.state === 'locked') { upgrade.open(); return; }
  if (selectedId) closeChat(false);
  if (id === 'overview') {
    stage.focus('overview');
    view = { kind: 'overview', id: null };
  } else {
    const r = rooms.get(id);
    if (!r) return;
    stage.focus('room', r.center.x, r.center.z);
    view = { kind: 'room', id };
  }
  markChip(id);
  history.replaceState(null, '', location.pathname + location.search);
}

// ---------- panel chat ----------
function setInset() {
  if (!selectedId) return stage.setInset(0, 0);
  const el = $('panel');
  if (mobile.matches) stage.setInset(0, el.offsetHeight);
  else stage.setInset(el.offsetWidth + 24, 0);
}

function setStatus(id, status) {
  const c = byId.get(id);
  if (!c) return;
  clearTimeout(doneTimers.get(id));
  c.status = status;
  if (status === 'done') {
    doneTimers.set(id, setTimeout(() => { if (c.status === 'done') c.status = 'idle'; }, 5000));
  }
}

// Parent dashboard may provide a same-origin, tenant-scoped workload summary. It never changes office geometry or animation setup.
const receiveWorkloads = (event) => applyOfficeWorkloads(event, { origin: location.origin, parentWindow: parent, currentWindow: window, agentIds: byId.keys(), setStatus });
addEventListener('message', receiveWorkloads);
addEventListener('pagehide', () => removeEventListener('message', receiveWorkloads), { once: true });
if (tenantOffice) for (const id of byId.keys()) setStatus(id, 'unknown');

// ---------- perintah (job) dan board ----------
const jobsUI = (tenantOffice ? createTenantJobsUI : createJobsUI)({
  root: $('jobs'),
  mountComposer: (node, props) => { const view = createRoot(node); view.render(React.createElement(WorkspaceTaskComposer, props)); return () => view.unmount(); },
  onStatus: tenantOffice ? () => {} : setStatus,
  onOpenItem: (target) => board.open(target),
  onDone: () => refreshBadges(),
});
if (tenantOffice) addEventListener('pagehide', () => jobsUI.dispose(), { once: true });
const board = createBoard({
  onContinue: (jobId, itemId) => continueFrom(jobId, itemId),
  onChange: () => refreshBadges(),
});
setAuthHandler(() => {
  if (!tenantOffice) return showGate('Kode akses salah atau belum diisi.');
  $('banner').textContent = 'Sesi berakhir. Kembali ke dashboard untuk masuk kembali.';
  $('banner').hidden = false;
});

async function refreshBadges() {
  if (tenantOffice) return; // Tenant workload sync is supplied by the parent; never query legacy counts.
  try {
    const c = await api('/items/counts');
    tags.setBadges(c.byAgent);
    const el = $('board-count');
    el.textContent = c.draft;
    el.hidden = !c.draft;
  } catch { /* database belum siap: abaikan */ }
}

// dari kartu di board (mis. ide) -> buka karakter yang tepat dengan form terisi bahan dasarnya
function continueFrom(jobId, itemId) {
  const job = jobById(jobId);
  if (!job) return;
  board.close();
  selectAgent(job.agent);
  panel.setTab('jobs');
  jobsUI.openForm(jobId, { parentId: itemId });
}

$('btn-board').addEventListener('click', () => {
  if (tenantOffice && parent !== window) parent.postMessage({ type: 'virtual-office:navigate', path: '/dashboard/board' }, location.origin);
  else board.open({});
});

const panel = createPanel({
  roster,
  onSelect: (id) => selectAgent(id),
  onClose: () => closeChat(true),
  onStatus: tenantOffice ? () => {} : setStatus,
  onNeedCode: () => showGate('Kode akses salah atau belum diisi.'),
  isDemo: () => config.demo,
  jobs: jobsUI,
});

function selectAgent(id) {
  const agent = agentById(id);
  const c = byId.get(id);
  if (!agent || !c) return;
  if (selectedId && selectedId !== id) byId.get(selectedId).selected = false;

  selectedId = id;
  c.selected = true;
  c.wave();
  const div = divisionById(agent.division);

  document.body.classList.add('chatting');
  $('panel').setAttribute('aria-hidden', 'false');
  panel.open(id);
  const room = rooms.get(agent.division).center;
  stage.focus('agent', room.x + c.home.x, room.z + c.home.z + 0.9);
  stage.setRing(c, div.color);
  tags.setSelected(id);
  view = { kind: 'room', id: agent.division };
  markChip(agent.division);
  requestAnimationFrame(setInset);
  history.replaceState(null, '', `${location.pathname}${location.search}#${id}`);
}

function closeChat(refocus) {
  if (!selectedId) return;
  const c = byId.get(selectedId);
  const div = divisionById(c.agent.division);
  c.selected = false;
  selectedId = null;
  panel.close();
  document.body.classList.remove('chatting');
  $('panel').setAttribute('aria-hidden', 'true');
  $('banner').hidden = true;
  stage.setRing(null);
  tags.setSelected(null);
  stage.setInset(0, 0);
  if (refocus) {
    const r = rooms.get(div.id);
    stage.focus('room', r.center.x, r.center.z);
    history.replaceState(null, '', location.pathname + location.search);
  }
}

// ---------- input scene ----------
stage.onClick((id) => {
  if (rooms.get(id)?.state === 'locked') upgrade.open();
  else if (id) selectAgent(id);
  else if (selectedId && mobile.matches) closeChat(true);
});
stage.onHover((id) => tags.setHovered(id));
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && selectedId) closeChat(true);
});
addEventListener('resize', () => requestAnimationFrame(setInset));
mobile.addEventListener?.('change', () => requestAnimationFrame(setInset));

// ---------- gate kode akses ----------
function showGate(msg) {
  $('gate').hidden = false;
  const err = $('gate-error');
  err.hidden = !msg;
  err.textContent = msg || '';
  setTimeout(() => $('gate-input').focus(), 50);
}

$('gate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('gate-input').value.trim();
  if (!code) return;
  try {
    const r = await fetch('/api/verify', { headers: { 'x-access-code': code } });
    if (r.ok) {
      setCode(code);
      $('gate').hidden = true;
      $('gate-input').value = '';
      return;
    }
    showGate(r.status === 401 ? 'Kode salah.' : 'Server menolak. Coba lagi.');
  } catch {
    showGate('Tidak bisa menghubungi server.');
  }
});

// ---------- start ----------
(async function start() {
  const cfg = await fetchConfig();
  Object.assign(config, cfg);
  if (tenantOffice) { config.needsCode = false; config.demo = false; }

  const banner = $('banner');
  if (config.offline) {
    banner.hidden = false;
    banner.textContent = 'Backend belum jalan. Jalankan "npm run dev" atau "npm start" agar chat bisa dipakai.';
  } else if (config.demo) {
    banner.textContent = 'Mode demo: server belum punya ANTHROPIC_API_KEY, jadi jawaban hanya contoh.';
  }
  banner.hidden = !(config.offline || (config.demo && selectedId));
  if (tenantOffice && (teamError || !roster.agents.length)) {
    banner.hidden = false;
    banner.textContent = teamError || (roster.divisionCapacity > 0
      ? `Tersedia kapasitas ${roster.divisionCapacity} divisi untuk workspace ini. Tambahkan divisi dan agen melalui Kelola divisi & agen. Klik ruangan terkunci untuk melihat pilihan upgrade.`
      : 'Belum ada kapasitas divisi tersedia. Klik ruangan terkunci untuk memeriksa paket atau hubungi pemilik organisasi.');
  }
  if (config.needsCode && !getCode()) showGate('');

  // buka karyawan dari URL, mis. https://office.devan.my.id/#rina
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash && byId.has(hash)) selectAgent(hash);
  else goTo('overview');

  refreshBadges();
  setInterval(refreshBadges, 30000);

  const hide = () => {
    if (stage.frames < 3) return requestAnimationFrame(hide);
    $('loading').classList.add('gone');
    setTimeout(() => $('loading').remove(), 900);
  };
  hide();
})();

window.__kantor = { stage, selectAgent, goTo };
