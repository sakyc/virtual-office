import { randomUUID } from 'node:crypto';
import { defaultModelTariffRows } from './default-model-tariffs.js';
import { MODEL_PRICE_VERSION } from '../shared/ai-model-prices.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const validId = id => typeof id === 'string' && /^[A-Za-z0-9._-]{1,150}$/.test(id);

// Explicit operator workflow only. No startup/read request may call this writer.
// Caller owns the transaction; duplicate keys are a no-op, including on reruns.
export async function seedModelCatalog(c, metadata, { now = Date.now() } = {}) {
  if (!Array.isArray(metadata) || metadata.length > 1000) throw Error('MODEL_METADATA_INVALID');
  const prices = new Map(defaultModelTariffRows(metadata, now).map(row => [row.model, row]));
  let inserted = 0;
  const seen = new Set();
  for (const model of metadata) {
    if (!validId(model.id) || typeof model.display_name !== 'string' || !model.display_name.trim() || model.display_name.length > 100) throw Error('MODEL_METADATA_INVALID');
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    const price = prices.get(model.id);
    const lifecycle = ['active','deprecated','retired'].includes(model.lifecycle) ? model.lifecycle : 'unknown';
    const id = randomUUID();
    await c.execute(`INSERT INTO ai_models(id,provider,provider_model_id,display_name,lifecycle,enabled,seed_tariff,seed_reference)
      VALUES (?,'anthropic',?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id`,
    [id, model.id, model.display_name, lifecycle, price ? 1 : 0, price ? JSON.stringify(price.tariff) : null, MODEL_PRICE_VERSION]);
    const [[created]] = await c.execute('SELECT id FROM ai_models WHERE id=?', [id]);
    if (created) inserted++;
  }
  // Import previously approved manual IDs without guessing metadata or prices.
  // The existing tariff remains authoritative; no customer history is rewritten.
  const [legacy] = await c.execute('SELECT model FROM billing_model_tariffs ORDER BY model');
  for (const row of legacy) {
    if (!validId(row.model)) throw Error('MODEL_METADATA_INVALID');
    const id = randomUUID();
    await c.execute(`INSERT INTO ai_models(id,provider,provider_model_id,display_name,lifecycle,enabled,seed_tariff,seed_reference)
      VALUES (?,'anthropic',?,?,'unknown',0,NULL,'existing-admin-tariff') ON DUPLICATE KEY UPDATE id=id`, [id,row.model,row.model]);
    const [[created]] = await c.execute('SELECT id FROM ai_models WHERE id=?', [id]);
    if (created) inserted++;
  }
  return { inserted };
}

export async function readModelCatalog(c) {
  const [rows] = await c.execute(`SELECT m.id AS catalogId,m.provider,m.provider_model_id AS model,m.display_name AS label,m.lifecycle,
    m.enabled AS seedEnabled,m.seed_tariff AS seedTariff,m.seed_reference AS seedReference,
    t.version,t.enabled,t.tariff,t.source_reference AS sourceReference
    FROM ai_models m LEFT JOIN billing_model_tariffs t ON t.model=m.provider_model_id AND m.provider='anthropic'
    ORDER BY m.display_name,m.provider_model_id`);
  return rows.map(row => ({ ...row, enabled: row.version == null ? row.seedEnabled : row.enabled,
    tariff: parse(row.version == null ? row.seedTariff : row.tariff),
    sourceReference: row.version == null ? 'https://platform.claude.com/docs/en/about-claude/pricing' : row.sourceReference,
    source: row.version == null ? row.seedReference : 'admin' }));
}

// Bounded metadata lookup only, never an inference request or guessed provider ID.
export async function fetchModelMetadata(client) {
  const result = []; let after;
  for (let page = 0; page < 10; page++) {
    const data = await client.models.list({ limit: 100, ...(after ? { after_id: after } : {}) }, { timeout: 3000, maxRetries: 0 });
    if (!Array.isArray(data.data) || data.data.length > 100) throw Error('MODEL_METADATA_INVALID');
    result.push(...data.data);
    if (!data.has_more) return result;
    if (!validId(data.last_id) || data.last_id === after) throw Error('MODEL_METADATA_INVALID');
    after = data.last_id;
  }
  throw Error('MODEL_METADATA_LIMIT');
}
