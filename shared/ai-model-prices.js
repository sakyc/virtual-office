// Owner-supplied standard (non-batch) USD / million rates from the two screenshots.
// This records the owner's supplied prices, NOT independent provider verification.
export const MODEL_PRICE_VERSION = 'owner-screenshot-20261025-v1';
export const MODEL_PRICE_DATE = '2026-10-25T00:00:00Z';
export const MODEL_PRICE_REVIEW_BY = '2026-11-24T00:00:00Z';
export const DEFAULT_MODEL_PRICES = Object.freeze([
  ['Haiku 4.5', '1', '5', '0.10', '1.25'],
  ['Sonnet 5', '2', '10', '0.20', '2.50'],
  ['Opus 5', '5', '25', '0.50', '6.25'],
  ['Fable 5', '10', '50', '1', '12.50'],
  ['Opus 4.8', '5', '25', '0.50', '6.25'],
  ['Sonnet 4.6', '3', '15', '0.30', '3.75'],
  ['Opus 4.7', '5', '25', '0.50', '6.25'],
  ['Opus 4.6', '5', '25', '0.50', '6.25'],
  ['Sonnet 4.5', '3', '15', '0.30', '3.75'],
  ['Opus 4.5', '5', '25', '0.50', '6.25'],
].map(([name, inputUsdPerMillion, outputUsdPerMillion, cacheReadUsdPerMillion, cacheWrite5mUsdPerMillion]) => Object.freeze({
  name, inputUsdPerMillion, outputUsdPerMillion, cacheReadUsdPerMillion, cacheWrite5mUsdPerMillion,
})));
