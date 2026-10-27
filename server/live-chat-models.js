import { createChatModelCatalog } from './chat-models.js';
import { parseBillingTariffs } from './ai-billing.js';

const validId = id => typeof id === 'string' && /^[A-Za-z0-9._-]{1,150}$/.test(id);
const unavailable = () => Object.assign(new Error('Model belum tersedia. Pilih model dengan tarif aktif atau hubungi admin.'), { status: 409 });
const costLabels = { economy: 'Hemat', balanced: 'Seimbang', premium: 'Premium', unspecified: 'Biaya belum tersedia' };
const descriptions = {
  haiku: 'Cocok untuk percakapan dan tugas rutin yang ringan.',
  sonnet: 'Pilihan serbaguna untuk menulis, coding, dan analisis.',
  opus: 'Ditujukan untuk tugas kompleks yang memerlukan penalaran mendalam.',
};

// Discovery is metadata only: never call messages, invent IDs, or approve prices.
// Every send still revalidates pricing and balance in the billing service.
export function createLiveChatModelCatalog({ models, json = '', client, readTariffs, now = Date.now, maxTokens = 1500, databaseOnly = false }) {
  const configured = createChatModelCatalog(models, json).list();
  let entries = new Map(), discovered = [], retryAt = 0, discoveryPending;
  async function discover() {
    if (!client?.models?.list || now() < retryAt) return;
    if (discoveryPending) return discoveryPending;
    discoveryPending = (async () => {
      try {
        const found = [];
        let after;
        // Bound network work even if a provider returns malformed pagination.
        for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
          const page = await client.models.list({ limit: 100, ...(after ? { after_id: after } : {}) }, { timeout: 3000, maxRetries: 0 });
          if (!Array.isArray(page.data)) throw new Error('Invalid model metadata');
          found.push(...page.data.filter(m => validId(m.id)).slice(0, 100));
          if (!page.has_more) break;
          if (!validId(page.last_id) || page.last_id === after || pageNumber === 9) throw new Error('Invalid model pagination');
          after = page.last_id;
        }
        discovered = found;
        retryAt = now() + 10 * 60_000;
      } catch {
        // No error details/credentials are exposed; manual approved IDs remain usable.
        discovered = [];
        retryAt = now() + 60_000;
      } finally { discoveryPending = null; }
    })();
    return discoveryPending;
  }
  function available(entry) {
    return entry?.selectable === true && Date.parse(entry.validUntil) > now();
  }
  return Object.freeze({
    async refresh(tariffRows) {
      await discover();
      // Do not cache tariff approval: disabling a tariff must affect the next request.
      let rows;
      try { rows = tariffRows ?? await readTariffs(); }
      catch { entries = new Map(); throw unavailable(); }
      // Runtime prices/status come only from persisted rows, never screenshot defaults.
      const next = new Map(configured.map(m => [m.id, { ...m,
        description: m.costClass === 'unspecified' ? 'Pilih model sesuai kebutuhan tugas; harga bukan jaminan kualitas.' : m.description,
      }]));
      for (const m of discovered) {
        if (databaseOnly && !rows.some(row => row.model === m.id)) continue;
        const old = next.get(m.id);
        next.set(m.id, { ...old, id: m.id,
          label: old?.label !== m.id && old?.label ? old.label : (typeof m.display_name === 'string' ? m.display_name.slice(0, 100) : m.id),
          description: descriptions[m.line] || old?.description || 'Bandingkan hasil model sesuai kebutuhan tugas; harga bukan jaminan kualitas.',
          retired: m.lifecycle === 'retired', providerMaxTokens: m.max_tokens,
          providerMaxInputTokens: m.max_input_tokens, discovered: true,
        });
      }
      for (const row of rows) {
        if (!validId(row.model)) continue;
        const entry = next.get(row.model) || { id: row.model, label: row.model, description: 'Bandingkan hasil model sesuai kebutuhan tugas; harga bukan jaminan kualitas.' };
        entry.catalogId = row.catalogId;
        entry.provider = row.provider;
        if (row.label) entry.label = row.label;
        entry.retired = entry.retired || row.lifecycle === 'retired';
        entry.selectable = false;
        entry.adminVersion = row.version ?? 0;
        entry.enabled = row.enabled === true || row.enabled === 1;
        entry.source = row.version ? 'admin' : row.source || 'default';
        entry.sourceReference = row.sourceReference || '';
        try {
          const tariff = typeof row.tariff === 'string' ? JSON.parse(row.tariff) : row.tariff;
          entry.draft = tariff;
          if (row.enabled !== true && row.enabled !== 1) throw unavailable();
          parseBillingTariffs(JSON.stringify({ [row.model]: tariff }), now());
          if (tariff.maxOutputTokens < maxTokens || (Number.isFinite(entry.providerMaxTokens) && entry.providerMaxTokens < maxTokens) || entry.retired) throw unavailable();
          entry.selectable = true;
          entry.validUntil = tariff.validUntil;
          entry.tariff = { ...tariff, catalogVersion: row.version ?? row.source,
            ...(row.catalogId ? { catalogId: row.catalogId, provider: row.provider } : {}) };
          // Cost category compares approved rates, not token counts or intelligence.
          entry.costClass = Number(tariff.inputUsdPerMillion) <= 1 && Number(tariff.outputUsdPerMillion) <= 5 ? 'economy'
            : Number(tariff.inputUsdPerMillion) <= 3 && Number(tariff.outputUsdPerMillion) <= 15 ? 'balanced' : 'premium';
        } catch { /* Missing, expired, or incompatible pricing stays unavailable. */ }
        next.set(row.model, entry);
      }
      entries = databaseOnly ? new Map([...next].filter(([id]) => rows.some(row => row.model === id))) : next;
    },
    async adminList(tariffRows) {
      await this.refresh(tariffRows);
      const keys = ['inputUsdPerMillion', 'outputUsdPerMillion', 'cacheReadUsdPerMillion', 'maxInputTokens', 'maxOutputTokens', 'verifiedAt', 'validUntil'];
      return [...entries.values()].map(entry => ({ model: entry.id, label: entry.label,
        catalogId: entry.catalogId, provider: entry.provider,
        version: entry.adminVersion ?? 0, enabled: entry.enabled === true, selectable: available(entry),
        source: entry.source || 'unpriced', sourceReference: entry.sourceReference || '',
        tariff: entry.draft && typeof entry.draft === 'object' ? Object.fromEntries(keys.map(key => [key, entry.draft[key]])) : null,
        discovered: entry.discovered === true, retired: entry.retired === true,
        maxInputTokens: Number.isSafeInteger(entry.providerMaxInputTokens) ? entry.providerMaxInputTokens : null,
        maxOutputTokens: Number.isSafeInteger(entry.providerMaxTokens) ? entry.providerMaxTokens : null,
        costClass: available(entry) ? entry.costClass : 'unspecified',
      }));
    },
    // Billing and selector share the exact same merged tariff policy. Never use
    // defaults to bypass a database failure or explicit operator disablement.
    async resolveTariff(id) {
      await this.refresh();
      const entry = entries.get(id);
      if (!available(entry)) throw Object.assign(unavailable(), { status: 503, code: 'AI_BILLING_PRICING_REQUIRED' });
      return { ...entry.tariff };
    },
    async estimateRates() {
      await this.refresh();
      return Object.fromEntries([...entries.values()].filter(available).map(entry => [entry.id,
        [entry.tariff.inputUsdPerMillion, entry.tariff.outputUsdPerMillion, entry.tariff.cacheReadUsdPerMillion]]));
    },
    list: () => [...entries.values()].map(entry => ({
      id: entry.id, label: entry.label, costClass: available(entry) ? entry.costClass : 'unspecified',
      costLabel: available(entry) ? costLabels[entry.costClass] : 'Belum aktif',
      selectable: available(entry),
      description: `${entry.description} ${available(entry) ? 'Harga per token berbeda antar model; premium dapat lebih cepat mengurangi Saldo AI untuk jumlah token yang sama.' : 'Belum dapat dipakai: tarif aktif yang sesuai belum tersedia atau model tidak mendukung konfigurasi chat.'}`,
    })),
    validate(id) {
      if (id !== null && !available(entries.get(id))) throw unavailable();
      return id;
    },
    resolve(override, agent) {
      const id = override ?? models[agent.modelTier === 'leader' ? 'leader' : 'team'];
      if (!available(entries.get(id))) throw unavailable();
      return id;
    },
  });
}
