export const WORKLOAD_MESSAGE = 'virtual-office:worker-loads';

export function normalizeWorkerLoads(workers) {
  if (!Array.isArray(workers) || workers.length > 1000) throw new Error('Invalid workload summary.');
  const ids = new Set();
  return workers.map((worker) => {
    if (typeof worker?.agentId !== 'string' || !worker.agentId || ids.has(worker.agentId)
        || !Number.isSafeInteger(worker.totalJobs) || worker.totalJobs < 0
        || !Number.isSafeInteger(worker.activeJobs) || worker.activeJobs < 0 || worker.activeJobs > worker.totalJobs) throw new Error('Invalid workload summary.');
    ids.add(worker.agentId);
    return { agentId: worker.agentId, totalJobs: worker.totalJobs, activeJobs: worker.activeJobs };
  });
}

export function applyOfficeWorkloads(event, { origin, parentWindow, currentWindow, agentIds, setStatus }) {
  if (parentWindow === currentWindow || event.source !== parentWindow || event.origin !== origin || event.data?.type !== WORKLOAD_MESSAGE) return false;
  let workers;
  try { workers = normalizeWorkerLoads(event.data.workers); } catch { return false; }
  if (typeof event.data.available !== 'boolean') return false;
  const active = new Map(workers.map((worker) => [worker.agentId, worker.activeJobs]));
  // Reset absent agents too: an empty valid summary means there are no active jobs.
  for (const id of agentIds) setStatus(id, !event.data.available ? 'unknown' : active.get(id) > 0 ? 'working' : 'idle');
  return true;
}

export function startOfficeWorkloadSync({ send, onState, fetchImpl = fetch, schedule = setInterval, cancel = clearInterval }) {
  let stopped = false, inFlight = false;
  const controller = new AbortController();
  const refresh = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const response = await fetchImpl('/api/dashboard/workers', { credentials: 'same-origin', signal: controller.signal });
      if (!response.ok) throw new Error();
      const workers = normalizeWorkerLoads((await response.json()).workers);
      if (stopped) return;
      send({ type: WORKLOAD_MESSAGE, available: true, workers });
      onState({ status: 'ready', activeJobs: workers.reduce((sum, worker) => sum + worker.activeJobs, 0), updatedAt: new Date() });
    } catch {
      if (stopped) return;
      send({ type: WORKLOAD_MESSAGE, available: false, workers: [] });
      onState({ status: 'unavailable' });
    } finally { inFlight = false; }
  };
  const interval = schedule(refresh, 20_000);
  void refresh();
  return { refresh, stop() { stopped = true; controller.abort(); cancel(interval); } };
}
