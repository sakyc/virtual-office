import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardChecklist, loadDashboardOverview } from '../src/react/dashboard-data.js';

const empty = { metrics: { totalJobs: 0, activeJobs: 0, completedJobs: 0, totalClients: 0, approvedItems: 0 }, recentJobs: [] };

test('dashboard uses real zero counts; unknown activity never becomes completed checklist items', () => {
  const profile = { activeWorkspace: { id: 12 } };
  assert.deepEqual(dashboardChecklist(profile, null).map((entry) => entry.done), [true, null, null, null]);
  assert.deepEqual(dashboardChecklist(profile, empty).map((entry) => entry.done), [true, false, false, false]);
  assert.deepEqual(dashboardChecklist(profile, { ...empty, metrics: { ...empty.metrics, totalJobs: 1, totalClients: 2, approvedItems: 3 } }).map((entry) => entry.done), [true, true, true, true]);
  assert.equal(dashboardChecklist(null, null)[0].done, false);
});

test('overview requires the existing scoped API, distinguishes failures from empty data, and sanitizes errors', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const controller = new AbortController();
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/dashboard/overview');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.signal, controller.signal);
    return { ok: true, json: async () => empty };
  };
  assert.deepEqual(await loadDashboardOverview(controller.signal), empty);
  for (const body of [{}, { ...empty, recentJobs: null }, { ...empty, metrics: { ...empty.metrics, totalJobs: -1 } }]) {
    globalThis.fetch = async () => ({ ok: true, json: async () => body });
    await assert.rejects(loadDashboardOverview(), /Ringkasan workspace/);
  }
  for (const status of [401, 403, 503]) {
    globalThis.fetch = async () => ({ ok: false, status });
    await assert.rejects(loadDashboardOverview(), { message: 'Ringkasan workspace belum dapat dimuat. Coba lagi.' });
  }
  globalThis.fetch = async () => { throw new Error('mysql://private-secret@internal'); };
  await assert.rejects(loadDashboardOverview(), { message: 'Ringkasan workspace belum dapat dimuat. Coba lagi.' });
});
