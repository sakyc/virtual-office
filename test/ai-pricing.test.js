import test from 'node:test';
import assert from 'node:assert/strict';
import { createUsagePricing, estimateUsage, summarizeCosts, FX_SOURCE } from '../server/ai-pricing.js';
import { loadUsage } from '../server/ai-usage.js';

const now = Date.parse('2026-10-25T06:00:00Z');
const fx = { available: true, date: '2026-10-23', idrPerUsd: '16000' }; // Fixture, not a live rate.
const row = { model: 'claude-sonnet-5-5', status: 'completed', inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheCreationTokens: 0, requests: 1 };

test('decimal arithmetic converts standard token usage with 2x markup and rounds once', () => {
  assert.equal(estimateUsage(row, fx, now).amountIdr, '384');
  assert.equal(estimateUsage({ ...row, inputTokens: 1, outputTokens: 0 }, fx, now).amountIdr, '1');
  assert.equal(estimateUsage({ ...row, inputTokens: 0, outputTokens: 0 }, fx, now).amountIdr, '0');
  assert.equal(estimateUsage({ ...row, model: 'claude-haiku-4-5-20251001', inputTokens: 184, outputTokens: 414 }, fx, now).amountIdr, '73');
  assert.equal(estimateUsage({ ...row, inputTokens: 0, outputTokens: 0, cacheReadTokens: 1000000 }, fx, now).amountIdr, '3200');
  const one = { ...row, inputTokens: 1, outputTokens: 0 };
  assert.equal(summarizeCosts([one, one], fx, now).amountIdr, '1', 'not sum of rounded requests');
});

test('unknown models, tiered models, cache writes, incomplete and unresolved usage are never quoted as free', () => {
  for (const [override, reason] of [
    [{ model: 'unknown' }, 'model_price_unverified'], [{ model: 'claude-haiku-5-5' }, 'model_price_unverified'],
    [{ model: '__proto__' }, 'model_price_unverified'], [{ cacheCreationTokens: 1 }, 'cache_write_duration_unknown'],
    [{ inputTokens: null }, 'usage_incomplete'], [{ outputTokens: -1 }, 'usage_incomplete'],
    [{ outputTokens: 1.5 }, 'usage_incomplete'], [{ inputTokens: Number.MAX_SAFE_INTEGER + 1 }, 'usage_incomplete'],
    [{ incomplete: '1' }, 'usage_incomplete'], [{ status: 'unknown' }, 'usage_unresolved'], [{ status: 'started' }, 'usage_unresolved'],
  ]) {
    const cost = estimateUsage({ ...row, ...override }, fx, now);
    assert.equal(cost.available, false); assert.equal(cost.amountIdr, null); assert.equal(cost.reason, reason);
  }
  assert.equal(estimateUsage({ ...row, inputTokens: '9007199254740993' }, fx, now).available, true, 'BIGINT strings remain exact');
});

test('stale or invalid rates and expired prices fail closed, including future dates', () => {
  for (const value of [null, { ...fx, idrPerUsd: '0' }, { ...fx, idrPerUsd: '-2' }, { ...fx, idrPerUsd: 'NaN' }, { ...fx, date: '2026-10-26' }, { ...fx, date: '2026-10-19' }]) {
    assert.equal(estimateUsage(row, value, now).available, false);
  }
  assert.equal(estimateUsage(row, fx, Date.parse('2026-11-24')).reason, 'pricing_expired');
});

test('partial coverage exposes known subtotal but never an authoritative total', () => {
  const cost = summarizeCosts([row, { ...row, status: 'unknown', requests: '2' }], fx, now);
  assert.equal(cost.available, false); assert.equal(cost.amountIdr, null); assert.equal(cost.knownSubtotalIdr, '384');
  assert.equal(cost.includedRequests, '1'); assert.equal(cost.excludedRequests, '2');
  assert.deepEqual(cost.reasons, ['usage_unresolved']);
  assert.equal(summarizeCosts([], { available: false }, now).available, false);
  assert.equal(summarizeCosts([], fx, now).amountIdr, '0');
});

test('FX retrieval uses only public fixed URL, coalesces calls and caches a dated rate', async () => {
  let calls = 0;
  const pricing = createUsagePricing({ now: () => now, fetchImpl: async (url, options) => {
    calls++; assert.equal(url, FX_SOURCE); assert.equal(options.redirect, 'error'); assert.equal(options.headers, undefined);
    return Response.json({ amount: 1, base: 'USD', date: '2026-10-23', rates: { IDR: 16000 } });
  } });
  const [a, b] = await Promise.all([pricing.snapshot(), pricing.snapshot()]);
  assert.deepEqual(a, b); assert.equal(a.fx.idrPerUsd, '16000'); assert.equal(a.markup, 2); assert.equal(a.debitsEnabled, false);
  await pricing.snapshot(); assert.equal(calls, 1);
});

test('FX failures are sanitized and backed off, expired cache is never silently reused', async () => {
  let time = now, calls = 0;
  const pricing = createUsagePricing({ now: () => time, fetchImpl: async () => {
    calls++; if (calls > 1) throw new Error('private-secret');
    return Response.json({ amount: 1, base: 'USD', date: '2026-10-23', rates: { IDR: 16000 } });
  } });
  assert.equal((await pricing.snapshot()).fx.available, true);
  time += 7 * 3600000;
  assert.deepEqual((await pricing.snapshot()).fx, { available: false });
  assert.deepEqual((await pricing.snapshot()).fx, { available: false }); assert.equal(calls, 2);
});

test('FX rejects wrong base, stale dates, invalid numbers and unavailable services', async () => {
  for (const data of [{ base: 'EUR', amount: 1, date: '2026-10-23', rates: { IDR: 16000 } }, { base: 'USD', amount: 1, date: '2020-01-01', rates: { IDR: 16000 } }, { base: 'USD', amount: 1, date: '2026-10-23', rates: { IDR: -1 } }]) {
    const pricing = createUsagePricing({ now: () => now, fetchImpl: async () => Response.json(data) });
    assert.equal((await pricing.snapshot()).fx.available, false);
  }
});

test('usage estimates cover the full selected period, never only 50 recent rows, and remain tenant scoped', async () => {
  for (const role of ['owner', 'member']) {
    const calls = [];
    const connection = { execute: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('GROUP BY model, status')) return [[{ ...row, inputTokens: 100000, outputTokens: 100000, requests: 100, incomplete: 0 }]];
      if (sql.includes('SELECT id, operation')) return [[{ ...row, id: 'request' }]];
      return [[{ requests: 100 }]];
    } };
    const pricing = { snapshot: async () => ({ fx, now, currency: 'IDR', kind: 'current-rate-estimate', debitsEnabled: false }) };
    const data = await loadUsage(connection, { organizationId: 3, workspaceId: 8, role }, { userId: 9 }, '7d', pricing);
    assert.equal(data.costs.amountIdr, '38400'); assert.equal(data.recent[0].costEstimate.amountIdr, '384');
    assert.equal(data.recent[0].costEstimate.idrNumerator, undefined);
    assert(calls.every(({ sql }) => sql.includes('organization_id = ? AND workspace_id = ?')));
    assert.deepEqual(calls.at(-1).values, role === 'owner' ? [3, 8] : [3, 8, 9]);
    assert.match(calls.at(-1).sql, /INTERVAL 7 DAY/); assert.doesNotMatch(calls.at(-1).sql, /LIMIT/);
  }
});
