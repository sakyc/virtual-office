// Klien chat: simpan riwayat per karyawan (localStorage, opsional) dan baca stream SSE dari /api/chat.
import { createChatContext } from './tenant-chat-context.js';

const KEY_HISTORY = 'kantorai.history.v1';
const KEY_CODE = 'kantorai.code';
// Embedded tenant office must never read/write the legacy shared-browser history.
export const tenantOffice = new URLSearchParams(location.search).get('tenant') === '1';

const safe = {
  get(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, v); } catch { /* abaikan */ }
  },
  del(k) {
    try { localStorage.removeItem(k); } catch { /* abaikan */ }
  },
};

let histories = {};
let conversations = {}, selected = {}, olderMessages = {}, olderLists = {};
try { histories = tenantOffice ? {} : JSON.parse(safe.get(KEY_HISTORY) || '{}') || {}; } catch { histories = {}; }

const persist = () => { if (!tenantOffice) safe.set(KEY_HISTORY, JSON.stringify(histories)); };
const chatContext = createChatContext({ reset: () => { histories = {}; conversations = {}; selected = {}; olderMessages = {}; olderLists = {}; } });
export const prepareChat = (signal) => tenantOffice ? chatContext.prepare(signal) : Promise.resolve(false);
export const getChatScope = () => tenantOffice ? chatContext.scope : null;
export const persistentChat = () => tenantOffice && chatContext.persistent;
export const getConversations = (id) => conversations[id] || [];
export const getConversationId = (id) => selected[id] || null;
export const hasOlderMessages = (id) => Boolean(olderMessages[id]);
export const hasOlderConversations = (id) => olderLists[id] !== null && olderLists[id] !== undefined;

async function historyRequest(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(`/api/office/conversations${path}`, { method, credentials: 'same-origin', cache: 'no-store', signal,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  if (!response.ok) {
    if ([401, 403].includes(response.status)) chatContext.clear();
    throw Object.assign(new Error([401, 403].includes(response.status) ? 'Sesi atau izin chat berubah. Buka ulang chat.' : 'Riwayat chat belum dapat dimuat/disimpan. Muat ulang atau hubungi operator.'), { code: response.status });
  }
  return response.json();
}
const unchanged = (scope, signal) => {
  if (!scope || scope !== getChatScope() || signal?.aborted) throw Object.assign(new Error('Konteks percakapan berubah.'), { name: signal?.aborted ? 'AbortError' : 'Error', resetHistory: true });
};
export async function prepareConversation(agentId, signal, choice) {
  if (!persistentChat()) return;
  const scope = getChatScope();
  const list = await historyRequest(`?agentId=${encodeURIComponent(agentId)}`, { signal });
  unchanged(scope, signal);
  const id = choice === null ? null : choice || selected[agentId] || list.conversations[0]?.id || null;
  let detail;
  if (id) {
    detail = await historyRequest(`/${encodeURIComponent(id)}`, { signal });
    unchanged(scope, signal);
    if (detail.agentId !== agentId) throw new Error('Percakapan tidak cocok dengan agen.');
  }
  conversations[agentId] = list.conversations; olderLists[agentId] = list.nextOffset;
  if (detail && !conversations[agentId].some((item) => item.id === id)) conversations[agentId].push({ id, title: detail.title });
  selected[agentId] = id;
  histories[agentId] = detail?.messages || [];
  olderMessages[agentId] = detail?.nextBefore || null;
}
export async function loadOlderChat(agentId, kind, signal) {
  const scope = getChatScope(), id = selected[agentId];
  const path = kind === 'messages' ? `/${encodeURIComponent(id)}?before=${olderMessages[agentId]}`
    : `?agentId=${encodeURIComponent(agentId)}&offset=${olderLists[agentId]}`;
  const data = await historyRequest(path, { signal });
  unchanged(scope, signal);
  if (selected[agentId] !== id) throw new Error('Percakapan berubah.');
  if (kind === 'messages') { histories[agentId] = [...data.messages, ...getHistory(agentId)]; olderMessages[agentId] = data.nextBefore; }
  else { conversations[agentId] = [...getConversations(agentId), ...data.conversations]; olderLists[agentId] = data.nextOffset; }
}
export async function changeConversation(agentId, body, signal) {
  const scope = getChatScope(), id = selected[agentId];
  if (!id) return;
  await historyRequest(`/${encodeURIComponent(id)}`, { method: 'PATCH', body, signal });
  unchanged(scope, signal);
  if (body.archive) { selected[agentId] = null; histories[agentId] = []; }
}
if (tenantOffice) addEventListener('pagehide', () => chatContext.clear(), { once: true });

export const getHistory = (id) => histories[id] || [];
export function setHistory(id, list, scope = getChatScope()) {
  if (tenantOffice && (!scope || scope !== getChatScope())) return;
  histories[id] = list.slice(-40);
  persist();
}
export function clearHistory(id) {
  delete histories[id];
  persist();
}

export const getCode = () => safe.get(KEY_CODE) || '';
export const setCode = (c) => (c ? safe.set(KEY_CODE, c) : safe.del(KEY_CODE));

export async function fetchConfig() {
  try {
    const r = await fetch('/api/config');
    if (!r.ok) throw new Error('config');
    return await r.json();
  } catch {
    return { demo: false, needsCode: false, offline: true };
  }
}

// Mengirim riwayat + pesan baru. Memanggil onText(potongan) saat streaming.
// Melempar Error dengan .code === 401 bila kode akses salah.
export async function streamChat(agentId, messages, { onText, signal }) {
  const scope = chatContext.scope;
  if (tenantOffice && (!scope || await prepareChat(signal))) throw Object.assign(new Error('Sesi atau workspace berubah. Buka ulang chat.'), { resetHistory: true });
  let conversationId;
  if (persistentChat()) {
    conversationId = selected[agentId];
    if (!conversationId) {
      const created = await historyRequest('', { method: 'POST', body: { agentId }, signal });
      unchanged(scope, signal);
      selected[agentId] = conversationId = created.id;
      conversations[agentId] = [created, ...getConversations(agentId)];
    }
  }
  let res;
  try {
    res = await fetch(tenantOffice ? '/api/office/chat' : '/api/chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: tenantOffice ? { 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json', 'x-access-code': getCode() },
      body: JSON.stringify(tenantOffice ? (persistentChat() ? { agentId, conversationId, content: messages.at(-1).content, scope } : { agentId, messages: messages.slice(-19), scope }) : { agentId, messages }),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('Tidak bisa menghubungi server. Cek koneksi atau pastikan backend jalan.');
  }

  if (!res.ok) {
    let msg = 'Terjadi kesalahan.';
    let errorCode;
    try { const error = await res.json(); msg = error.error || msg; errorCode = error.code; } catch { /* abaikan */ }
    const err = new Error(msg);
    err.code = res.status;
    if (tenantOffice && ([401, 403].includes(res.status) || (res.status === 409 && (!persistentChat() || errorCode === 'CHAT_SCOPE_CHANGED')))) { chatContext.clear(); err.resetHistory = true; }
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let completed = false;

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        if (!raw.startsWith('data:')) continue;
        let evt;
        try { evt = JSON.parse(raw.slice(5).trim()); } catch { continue; }
        if (evt.error) throw new Error(evt.error);
        if (evt.done) completed = true;
        if (evt.t) {
          full += evt.t;
          onText(evt.t, full);
        }
      }
    }
    if (tenantOffice && !completed) throw new Error('Koneksi chat terputus sebelum jawaban selesai. Coba lagi.');
    return full;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
