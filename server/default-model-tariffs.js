import { DEFAULT_MODEL_PRICES, MODEL_PRICE_DATE, MODEL_PRICE_REVIEW_BY, MODEL_PRICE_VERSION } from '../shared/ai-model-prices.js';

const normalize = name => typeof name === 'string' ? name.trim().replace(/^claude\s+/i, '').replace(/\s+/g, ' ').toLowerCase() : '';
const prices = new Map(DEFAULT_MODEL_PRICES.map(price => [normalize(price.name), price]));

// Only trusted server-side provider metadata binds a screenshot name to an API ID.
// No prefix/family/version inference, aliases or client-supplied names/limits.
export function defaultModelTariffRows(discovered, now = Date.now()) {
  if (!Number.isFinite(now) || now < Date.parse(MODEL_PRICE_DATE) || now >= Date.parse(MODEL_PRICE_REVIEW_BY)) return [];
  return discovered.flatMap(model => {
    const price = prices.get(normalize(model.display_name));
    if (!price || typeof model.id !== 'string' || !/^[A-Za-z0-9._-]{1,150}$/.test(model.id) || model.lifecycle === 'retired'
      || !Number.isSafeInteger(model.max_input_tokens) || model.max_input_tokens < 1 || model.max_input_tokens > 2000000
      || !Number.isSafeInteger(model.max_tokens) || model.max_tokens < 1 || model.max_tokens > 200000) return [];
    return [{ model: model.id, enabled: true, source: MODEL_PRICE_VERSION, tariff: {
      inputUsdPerMillion: price.inputUsdPerMillion, outputUsdPerMillion: price.outputUsdPerMillion,
      cacheReadUsdPerMillion: price.cacheReadUsdPerMillion,
      maxInputTokens: model.max_input_tokens, maxOutputTokens: model.max_tokens,
      approvalReference: MODEL_PRICE_VERSION, verifiedAt: MODEL_PRICE_DATE, validUntil: MODEL_PRICE_REVIEW_BY,
    } }];
  });
}
