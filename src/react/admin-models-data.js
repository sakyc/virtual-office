const tariffKeys = ['inputUsdPerMillion', 'outputUsdPerMillion', 'cacheReadUsdPerMillion', 'maxInputTokens', 'maxOutputTokens', 'verifiedAt', 'validUntil'];
// A reference URL, not a claim that the application fetched/verified its contents.
const providerPricing = 'https://platform.claude.com/docs/en/about-claude/pricing';

export function modelTariffRecord(model, time = Date.now()) {
  const defaults = { inputUsdPerMillion: '', outputUsdPerMillion: '', cacheReadUsdPerMillion: '',
    maxInputTokens: model.maxInputTokens ?? '', maxOutputTokens: model.maxOutputTokens ?? '',
    verifiedAt: new Date(time).toISOString(), validUntil: new Date(time + 30 * 86400000).toISOString() };
  return { model: model.model, version: model.version, enabled: model.enabled,
    sourceReference: model.sourceReference || providerPricing,
    tariff: Object.fromEntries(tariffKeys.map(key => [key, model.tariff ? model.tariff[key] : defaults[key]])) };
}

export function modelStatusUpdate(model, { reason, requestId, confirmed }) {
  if (!model.tariff || confirmed !== true || typeof reason !== 'string' || reason.trim().length < 5) throw new Error('Periksa tarif, isi alasan, dan konfirmasi perubahan status.');
  const record = modelTariffRecord(model);
  return { requestId, expectedVersion: record.version, enabled: !record.enabled, sourceReference: record.sourceReference,
    tariff: record.tariff, reason: reason.trim(), confirmedProviderPricing: true };
}

export function modelStatus(model) {
  return model.selectable ? 'Aktif' : model.enabled ? 'Tarif perlu diperiksa' : model.tariff ? 'Dinonaktifkan' : 'Belum ada tarif';
}
