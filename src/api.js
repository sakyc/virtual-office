import { getCode } from './chat.js';

let onAuth = () => {};
export const setAuthHandler = (fn) => { onAuth = fn; };

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-access-code': getCode() },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Tidak bisa menghubungi server. Pastikan backend jalan.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* body kosong */ }
  if (!res.ok) {
    const err = new Error(data?.error || 'Terjadi kesalahan.');
    err.code = res.status;
    if (res.status === 401) onAuth();
    throw err;
  }
  return data;
}
