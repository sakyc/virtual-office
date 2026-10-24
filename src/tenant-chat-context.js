// Memory-only binding; never persisted to browser storage or used as identity.
export function createChatContext({ fetchImpl = fetch, reset }) {
  let scope = null;
  let persistent = false;
  let generation = 0;
  return {
    get scope() { return scope; },
    get persistent() { return persistent; },
    async prepare(signal) {
      const request = ++generation;
      try {
        const response = await fetchImpl('/api/office/chat/context', { credentials: 'same-origin', cache: 'no-store', signal });
        if (!response.ok) throw Object.assign(new Error(response.status === 401 ? 'Sesi berakhir. Silakan login kembali.' : 'Chat workspace tidak tersedia atau Anda tidak memiliki izin.'), { code: response.status });
        const data = await response.json();
        if (!/^[a-f0-9]{64}$/.test(data.scope)) throw new Error('Konteks chat tidak valid.');
        if (request !== generation) throw Object.assign(new Error('Konteks chat berubah. Coba lagi.'), { resetHistory: true });
        const changed = scope !== data.scope;
        if (changed) reset();
        scope = data.scope;
        persistent = data.persistent === true;
        if (!data.available && !persistent) throw new Error('Layanan AI belum dikonfigurasi. Chat tidak mengirim jawaban demo.');
        return changed;
      } catch (error) {
        if (request === generation) { scope = null; persistent = false; reset(); }
        error.resetHistory = true;
        throw error;
      }
    },
    clear() { generation += 1; scope = null; persistent = false; reset(); },
  };
}
