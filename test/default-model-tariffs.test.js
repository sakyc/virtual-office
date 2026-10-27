import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MODEL_PRICES, MODEL_PRICE_DATE, MODEL_PRICE_REVIEW_BY, MODEL_PRICE_VERSION } from '../shared/ai-model-prices.js';
import { defaultModelTariffRows } from '../server/default-model-tariffs.js';
import { createLiveChatModelCatalog } from '../server/live-chat-models.js';
import { parseBillingTariffs, quoteBilledUsage } from '../server/ai-billing.js';
import { createUsagePricing, estimateUsage, summarizeCosts } from '../server/ai-pricing.js';

const now = Date.parse('2026-10-25T12:00:00Z');
// Mock provider IDs, not real advertised API IDs.
const model = (display_name = 'Claude Sonnet 5', change = {}) => ({ id: 'fixture-provider-id', display_name,
  max_input_tokens: 200000, max_tokens: 8000, lifecycle: 'active', ...change });
function fixture() {
  const state = { rows: defaultModelTariffRows([model()], now), fail: false, time: now, meta: [model()] };
  const catalog = createLiveChatModelCatalog({ models: { team: 'fixture-provider-id', leader: 'fixture-provider-id' },
    now: () => state.time, readTariffs: async () => { if (state.fail) throw new Error('Private SQL'); return state.rows; },
    client: { models: { list: async () => ({ data: state.meta, has_more: false }) } } });
  return { state, catalog };
}

test('all ten screenshot prices are preserved exactly, including cache-read and reference-only 5m write prices', () => {
  assert.equal(DEFAULT_MODEL_PRICES.length, 10);
  assert.deepEqual(DEFAULT_MODEL_PRICES.map(p => [p.name, p.inputUsdPerMillion, p.outputUsdPerMillion, p.cacheReadUsdPerMillion, p.cacheWrite5mUsdPerMillion]), [
    ['Haiku 4.5','1','5','0.10','1.25'], ['Sonnet 5','2','10','0.20','2.50'],
    ['Opus 5','5','25','0.50','6.25'], ['Fable 5','10','50','1','12.50'],
    ['Opus 4.8','5','25','0.50','6.25'], ['Sonnet 4.6','3','15','0.30','3.75'],
    ['Opus 4.7','5','25','0.50','6.25'], ['Opus 4.6','5','25','0.50','6.25'],
    ['Sonnet 4.5','3','15','0.30','3.75'], ['Opus 4.5','5','25','0.50','6.25'],
  ]);
  for (const price of DEFAULT_MODEL_PRICES) {
    const [row] = defaultModelTariffRows([model(price.name)], now);
    assert.equal(row.tariff.inputUsdPerMillion, price.inputUsdPerMillion);
    assert.equal(row.tariff.maxInputTokens, 200000);
    assert.equal(row.tariff.maxOutputTokens, 8000);
    assert.equal(row.tariff.approvalReference, MODEL_PRICE_VERSION);
    assert(!Object.hasOwn(row.tariff, 'cacheWrite5mUsdPerMillion'), 'write caching is not enabled by publishing the price card');
    assert.doesNotThrow(() => parseBillingTariffs(JSON.stringify({ [row.model]: row.tariff }), now));
  }
});

test('exact provider names map to returned IDs, never guessed versions or missing/invalid context limits', () => {
  assert.equal(defaultModelTariffRows([model('  Claude   Sonnet 5  ')], now)[0].model, 'fixture-provider-id');
  for (const name of ['Claude Sonnet 5.5', 'Sonnet 5 preview', 'Sonnet', 'Claude Mythos 5', '', null]) {
    assert.deepEqual(defaultModelTariffRows([model(name)], now), []);
  }
  for (const change of [{ id: '../bad' }, { max_input_tokens: null }, { max_tokens: null },
    { max_input_tokens: 2000001 }, { max_tokens: 200001 }, { max_tokens: 0 }, { lifecycle: 'retired' }]) {
    assert.deepEqual(defaultModelTariffRows([model('Sonnet 5', change)], now), []);
  }
});

test('hardcoded prices have fixed review validity, not a rolling approval on restart', () => {
  assert.deepEqual(defaultModelTariffRows([model()], Date.parse(MODEL_PRICE_DATE) - 1), []);
  assert.equal(defaultModelTariffRows([model()], Date.parse(MODEL_PRICE_REVIEW_BY) - 1).length, 1);
  assert.deepEqual(defaultModelTariffRows([model()], Date.parse(MODEL_PRICE_REVIEW_BY)), []);
});

test('catalog and billing share the persisted seeded owner prices without runtime price entry', async () => {
  const { catalog } = fixture(); await catalog.refresh();
  assert.equal(catalog.list()[0].selectable, true); assert.equal(catalog.list()[0].costLabel, 'Seimbang');
  const tariff = await catalog.resolveTariff('fixture-provider-id');
  assert.equal(tariff.catalogVersion, MODEL_PRICE_VERSION); assert.equal(tariff.cacheReadUsdPerMillion, '0.20');
  const snapshot = { tariff, fx: { idrPerUsd: '16000' }, maxOutputTokens: 1500 };
  assert.equal(quoteBilledUsage(snapshot, { input_tokens: 1000, output_tokens: 1000 }), '384', 'supplier cost × FX × 2');
  assert.equal(quoteBilledUsage(snapshot, { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 100000 }), '640');
  assert.throws(() => quoteBilledUsage(snapshot, { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 1 }));
  tariff.inputUsdPerMillion = '99';
  assert.equal((await catalog.resolveTariff('fixture-provider-id')).inputUsdPerMillion, '2');
});

test('admin overrides win; disabled, expired or malformed overrides and DB errors never fall back to owner prices', async () => {
  const { catalog, state } = fixture();
  const owner = await catalog.resolveTariff('fixture-provider-id');
  state.rows = [{ model: 'fixture-provider-id', enabled: 1, version: 7,
    tariff: { ...owner, inputUsdPerMillion: '3', outputUsdPerMillion: '15' } }];
  assert.equal((await catalog.resolveTariff('fixture-provider-id')).catalogVersion, 7);
  assert.equal((await catalog.resolveTariff('fixture-provider-id')).inputUsdPerMillion, '3');
  for (const change of [{ enabled: 0 }, { tariff: { ...owner, validUntil: '2026-10-24T00:00:00Z' } }, { tariff: 'broken json' }]) {
    state.rows = [{ model: 'fixture-provider-id', enabled: 1, tariff: owner, ...change }];
    await assert.rejects(catalog.resolveTariff('fixture-provider-id'), { code: 'AI_BILLING_PRICING_REQUIRED' });
    assert.equal(catalog.list()[0].selectable, false);
  }
  state.rows = []; state.fail = true;
  await assert.rejects(catalog.resolveTariff('fixture-provider-id'));
  state.fail = false;
  await assert.rejects(catalog.resolveTariff('fixture-provider-id'), 'metadata alone must never restore prices');
  state.rows = defaultModelTariffRows([model()], now);
  assert.equal((await catalog.resolveTariff('fixture-provider-id')).inputUsdPerMillion, '2');
});

test('old billing snapshots remain usable after the default rate card expires; new sends are denied', async () => {
  const { catalog, state } = fixture(); const tariff = await catalog.resolveTariff('fixture-provider-id');
  state.time = Date.parse(MODEL_PRICE_REVIEW_BY);
  await assert.rejects(catalog.resolveTariff('fixture-provider-id'));
  assert.equal(quoteBilledUsage({ tariff, fx: { idrPerUsd: '16000' }, maxOutputTokens: 1500 }, { input_tokens: 1000, output_tokens: 1000 }), '384');
});

test('dashboard estimates use the same active model rates as billing, never the unrelated legacy table', async () => {
  const { catalog } = fixture();
  const pricing = createUsagePricing({ now: () => now, getModelRates: () => catalog.estimateRates(),
    fetchImpl: async () => Response.json({ amount: 1, base: 'USD', date: '2026-10-25', rates: { IDR: 16000 } }) });
  const snapshot = await pricing.snapshot();
  const row = { model: 'fixture-provider-id', status: 'completed', inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheCreationTokens: 0, requests: 1 };
  assert.equal(estimateUsage(row, snapshot.fx, now, snapshot.modelRates).amountIdr, '384');
  assert.equal(summarizeCosts([row], snapshot.fx, now, snapshot.modelRates).amountIdr, '384');
  assert.equal(estimateUsage({ ...row, model: 'claude-sonnet-5-5' }, snapshot.fx, now, snapshot.modelRates).available, false);
  assert.equal(snapshot.pricingSource, null, 'do not claim independent source verification for owner screenshots');
});
