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
try { histories = tenantOffice ? {} : JSON.parse(safe.get(KEY_HISTORY) || '{}') || {}; } catch { histories = {}; }

const persist = () => { if (!tenantOffice) safe.set(KEY_HISTORY, JSON.stringify(histories)); };
const chatContext = createChatContext({ reset: () => { histories = {}; } });
export const prepareChat = (signal) => tenantOffice ? chatContext.prepare(signal) : Promise.resolve(false);
export const getChatScope = () => tenantOffice ? chatContext.scope : null;
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
  let res;
  try {
    res = await fetch(tenantOffice ? '/api/office/chat' : '/api/chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: tenantOffice ? { 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json', 'x-access-code': getCode() },
      body: JSON.stringify(tenantOffice ? { agentId, messages: messages.slice(-19), scope } : { agentId, messages }),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('Tidak bisa menghubungi server. Cek koneksi atau pastikan backend jalan.');
  }

  if (!res.ok) {
    let msg = 'Terjadi kesalahan.';
    try { msg = (await res.json()).error || msg; } catch { /* abaikan */ }
    const err = new Error(msg);
    err.code = res.status;
    if (tenantOffice && [401, 403, 409].includes(res.status)) { chatContext.clear(); err.resetHistory = true; }
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
