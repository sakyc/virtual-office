// Only the tenant-scoped API is used here. Identity and scope come from the server session.
export class WorkspaceApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export function createWorkApi(fetcher = globalThis.fetch) {
  const request = async (path, { signal, method = 'GET', body } = {}) => {
    let response;
    try {
      response = await fetcher(`/api/dashboard/${path}`, {
        method, credentials: 'same-origin', signal,
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new WorkspaceApiError('Tidak dapat terhubung. Periksa koneksi lalu coba lagi.', 0);
    }
    const result = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const fallback = response.status === 401 ? 'Sesi berakhir. Silakan login kembali.'
        : response.status === 403 ? 'Anda tidak memiliki akses pada workspace atau aksi ini.'
          : response.status === 402 ? 'Langganan aktif dan saldo AI diperlukan. Periksa Langganan & Saldo.' : response.status === 404 ? 'Item tidak ditemukan pada workspace aktif.' : 'Layanan workspace belum tersedia. Coba lagi nanti.';
      throw new WorkspaceApiError([400, 409].includes(response.status) && typeof result?.error === 'string' ? result.error : fallback, response.status);
    }
    if (response.status !== 204 && (!result || typeof result !== 'object')) throw new WorkspaceApiError('Respons layanan tidak valid. Coba lagi.', 502);
    return result;
  };
  const idPath = (id) => {
    if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new WorkspaceApiError('ID item tidak valid.', 400);
    return `items/${Number(id)}`;
  };
  return {
    jobs: (signal) => request('jobs', { signal }),
    taskOptions: (signal) => request('task-options', { signal }),
    createWorkspaceJob: ({ agentId, templateId, builtinId, title, instructions, values, clientId, modelId, requestKey }, signal) => request('jobs', { method: 'POST', body: { mode: 'workspace', agentId, templateId, builtinId, title, instructions, values, clientId, modelId, requestKey }, signal }),
    clients: (signal) => request('clients', { signal }),
    createClient: ({ name, brief }, signal) => request('clients', { method: 'POST', body: { name, brief }, signal }),
    items: (signal) => request('items', { signal }),
    detail: (id, signal) => request(idPath(id), { signal }),
    revisions: (id, signal) => request(`${idPath(id)}/revisions`, { signal }),
    createJob: ({ jobType, clientId, params }, signal) => request('jobs', { method: 'POST', body: { jobType, clientId, params }, signal }),
    approve: (id, signal) => request(`${idPath(id)}/approve`, { method: 'POST', body: {}, signal }),
    reject: (id, { reason, version }, signal) => request(`${idPath(id)}/reject`, { method: 'POST', body: { reason, version }, signal }),
    revise: (id, { reason, version }, signal) => request(`${idPath(id)}/revise`, { method: 'POST', body: { reason, version }, signal }),
    remove: (id, signal) => request(idPath(id), { method: 'DELETE', body: {}, signal }),
  };
}

export const workApi = createWorkApi();

export function workPermissions(role) {
  return { create: ['owner', 'admin', 'member'].includes(role), approve: ['owner', 'admin', 'member'].includes(role), remove: ['owner', 'admin'].includes(role) };
}
