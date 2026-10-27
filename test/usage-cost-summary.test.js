import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { summarizeCosts } from '../server/ai-pricing.js';

test('incomplete history retains a priced subtotal and explains unpriced model groups without guessing', async () => {
  const costs = summarizeCosts([
    { model: 'priced', status: 'completed', requests: '2', inputTokens: '1000', outputTokens: '500', cacheReadTokens: '0', cacheCreationTokens: '0' },
    { model: 'old-model', status: 'completed', requests: '1', inputTokens: '100', outputTokens: '10', cacheReadTokens: '0', cacheCreationTokens: '0' },
    { model: 'priced', status: 'unknown', requests: '3', inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
  ], { available: true, date: '2026-10-26', idrPerUsd: '18162' }, Date.parse('2026-10-27T06:00:00Z'), { priced: ['1', '5', '0.1'] });
  assert.equal(costs.available, false);
  assert.equal(costs.amountIdr, null);
  assert.equal(costs.knownSubtotalIdr, '128');
  assert.equal(costs.includedRequests, '2');
  assert.equal(costs.excludedRequests, '4');
  assert.deepEqual(costs.excludedUsage, [
    { model: 'old-model', status: 'completed', requests: '1', reason: 'model_price_unverified' },
    { model: 'priced', status: 'unknown', requests: '3', reason: 'usage_unresolved' },
  ]);
  const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { CostSummary } = await vite.ssrLoadModule('/src/react/usage-analytics.jsx');
    const html = renderToStaticMarkup(React.createElement(CostSummary, { costs }));
    assert.match(html, /<strong>Rp128<\/strong>/);
    assert.match(html, /Estimasi sebagian/);
    assert.match(html, /bukan total lengkap/);
    assert.match(html, /4 panggilan belum dapat dihitung/);
    assert.match(html, /aria-expanded="false"/);
    assert.doesNotMatch(html, /Belum tersedia<\/strong>/);
    for (const value of [
      { available: false, knownSubtotalIdr: null, includedRequests: '0', excludedRequests: '1', reasons: ['usage_unresolved'] },
      null,
    ]) {
      const unavailable = renderToStaticMarkup(React.createElement(CostSummary, { costs: value }));
      assert.match(unavailable, /Belum dapat dihitung/);
      assert.doesNotMatch(unavailable, /<strong>Rp0<\/strong>/);
    }
    const complete = renderToStaticMarkup(React.createElement(CostSummary, { costs: { available: true, amountIdr: '128', includedRequests: '2' } }));
    assert.match(complete, /<strong>Rp128<\/strong>/);
    assert.doesNotMatch(complete, /Estimasi sebagian|belum dapat dihitung/);
  } finally { await vite.close(); }
});
