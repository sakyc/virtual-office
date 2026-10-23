import test from 'node:test';
import assert from 'node:assert/strict';
import { loadUsage } from '../src/react/usage-data.js';

test('usage client uses same-origin no-store endpoint and rejects malformed or unavailable data', async (t) => {
  const previous = globalThis.fetch; t.after(() => { globalThis.fetch = previous; });
  const valid = { scope: 'self', totals: { requests: 0 }, recent: [] };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/dashboard/usage'); assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store');
    return { ok: true, json: async () => valid };
  };
  assert.equal(await loadUsage(), valid);
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(loadUsage(), /belum dapat dimuat/);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  await assert.rejects(loadUsage(), /tidak valid/);
});

test('usage client accepts only supported periods, never arbitrary query or tenant filters', async (t) => {
  const previous = globalThis.fetch; t.after(() => { globalThis.fetch = previous; });
  const urls = [];
  globalThis.fetch = async (url) => { urls.push(url); return { ok: true, json: async () => ({ scope: 'self', totals: {}, recent: [] }) }; };
  for (const range of ['today', '7d', '14d']) await loadUsage(undefined, range);
  assert.deepEqual(urls, ['today', '7d', '14d'].map((range) => `/api/dashboard/usage?range=${range}`));
  await assert.rejects(loadUsage(undefined, '7d&workspaceId=999'), /tidak valid/);
  assert.equal(urls.length, 3);
});
