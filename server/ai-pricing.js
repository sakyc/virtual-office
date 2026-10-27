// Standard direct Anthropic text-token estimates, not wallet debits or invoices.
export const PRICING_SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing';
export const FX_SOURCE = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=IDR';
const VERIFIED_AT = '2026-10-25';
const VALID_UNTIL = '2026-11-24T00:00:00Z';
// USD per million tokens. Decimal strings avoid binary floating-point money math.
const rates = {
  'claude-sonnet-5-5': ['2', '10', '0.10'],
  'claude-opus-5-5': ['4', '20', '0.20'],
  'claude-fable-5-1': ['10', '50', '0.25'],
  'claude-haiku-4-5-20251001': ['1', '5', '0.10'],
};
const integer = (n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? BigInt(n)
  : typeof n === 'string' && /^\d{1,30}$/.test(n) ? BigInt(n) : null;
const decimal = (n) => {
  if (typeof n !== 'string' || !/^\d{1,8}(\.\d{1,6})?$/.test(n)) throw new Error('INVALID_DECIMAL');
  const [whole, fraction = ''] = n.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
};
const unavailable = (reason) => ({ available: false, amountIdr: null, reason });

export function estimateUsage(row, fx, now = Date.now(), modelRates = null) {
  if (!Number.isFinite(now) || (!modelRates && (now < Date.parse(VERIFIED_AT) || now >= Date.parse(VALID_UNTIL)))) return unavailable('pricing_expired');
  if (!fx?.available) return unavailable('exchange_rate_unavailable');
  const day = Date.parse(`${fx.date}T00:00:00Z`);
  if (!Number.isFinite(day) || day > now || now - day > 5 * 86400000) return unavailable('exchange_rate_stale');
  let exchange;
  try { exchange = decimal(fx.idrPerUsd); if (exchange <= 0n) return unavailable('exchange_rate_invalid'); }
  catch { return unavailable('exchange_rate_invalid'); }
  if (row.status !== 'completed') return unavailable('usage_unresolved');
  const catalog = modelRates || rates;
  const tariff = Object.hasOwn(catalog, row.model) ? catalog[row.model] : null;
  if (!tariff) return unavailable('model_price_unverified');
  const counts = [row.inputTokens, row.outputTokens, row.cacheReadTokens, row.cacheCreationTokens].map(integer);
  if (counts.some((value) => value === null)) return unavailable('usage_incomplete');
  // Legacy ai_usage has no cache TTL breakdown: never assume the cheaper 5m price.
  if (counts[3] > 0n) return unavailable('cache_write_duration_unknown');
  if (row.incomplete != null && integer(row.incomplete) !== 0n) return unavailable('usage_incomplete');
  const usdNumerator = counts.slice(0, 3).reduce((sum, tokens, i) => sum + tokens * decimal(tariff[i]), 0n);
  const idrNumerator = usdNumerator * exchange * 2n;
  return { available: true, amountIdr: ((idrNumerator + 10n ** 18n - 1n) / 10n ** 18n).toString(),
    // Exact pre-rounding numerator retained for aggregate rounding, never client input.
    idrNumerator: idrNumerator.toString() };
}

export function summarizeCosts(rows, fx, now = Date.now(), modelRates = null) {
  let numerator = 0n, included = 0n, excluded = 0n;
  const reasons = new Set();
  const excludedUsage = [];
  for (const row of rows) {
    const requests = integer(row.requests);
    if (requests === null) return { available: false, amountIdr: null, includedRequests: included.toString(), excludedRequests: null, reasons: ['usage_incomplete'] };
    const quote = estimateUsage(row, fx, now, modelRates);
    if (!quote.available) {
      excluded += requests; reasons.add(quote.reason);
      excludedUsage.push({ model: row.model, status: row.status, requests: requests.toString(), reason: quote.reason });
    }
    else { numerator += BigInt(quote.idrNumerator); included += requests; }
  }
  const base = estimateUsage({ model: modelRates ? Object.keys(modelRates)[0] : 'claude-sonnet-5-5', status: 'completed', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }, fx, now, modelRates);
  if (!base.available) reasons.add(base.reason);
  const amount = ((numerator + 10n ** 18n - 1n) / 10n ** 18n).toString();
  return { available: excluded === 0n && base.available, amountIdr: excluded === 0n && base.available ? amount : null,
    knownSubtotalIdr: included > 0n ? amount : null, includedRequests: included.toString(), excludedRequests: excluded.toString(), reasons: [...reasons], excludedUsage };
}

export function createUsagePricing({ fetchImpl = fetch, now = Date.now, getModelRates = null } = {}) {
  let cached, pending, retryAfter = 0;
  async function exchangeRate() {
    const time = now();
    if (cached && time < cached.expires) return cached.value;
    if (time < retryAfter) return { available: false };
    pending ??= (async () => {
      try {
        const response = await fetchImpl(FX_SOURCE, { signal: AbortSignal.timeout(5000), redirect: 'error' });
        if (!response.ok) throw new Error('FX_UNAVAILABLE');
        const data = await response.json();
        if (data.base !== 'USD' || data.amount !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || typeof data.rates?.IDR !== 'number' || !Number.isFinite(data.rates.IDR)) throw new Error('FX_INVALID');
        const value = { available: true, date: data.date, idrPerUsd: String(data.rates.IDR) };
        if (decimal(value.idrPerUsd) <= 0n || Date.parse(data.date) > time || time - Date.parse(data.date) > 5 * 86400000) throw new Error('FX_STALE');
        cached = { value, expires: Math.min(time + 6 * 3600000, Date.parse(data.date) + 5 * 86400000) };
        return value;
      } catch { retryAfter = time + 60000; return { available: false }; }
    })();
    try { return await pending; } finally { pending = null; }
  }
  return {
    async snapshot() {
      const fx = await exchangeRate();
      let current = {};
      if (getModelRates) {
        let modelRates; try { modelRates = await getModelRates(); } catch { modelRates = {}; }
        current = { modelRates, pricingSource: null, pricingVerifiedAt: null, pricingValidUntil: null,
          pricingLabel: 'Tarif bawaan pemilik proyek atau tarif khusus admin yang masih aktif' };
      }
      return { fx, now: now(), currency: 'IDR', markup: 2, pricingSource: PRICING_SOURCE, pricingVerifiedAt: VERIFIED_AT,
        pricingValidUntil: VALID_UNTIL, exchangeSource: FX_SOURCE, kind: 'current-rate-estimate', debitsEnabled: false, ...current };
    },
  };
}
