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
