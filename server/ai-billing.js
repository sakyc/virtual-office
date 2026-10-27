import { createHash } from 'node:crypto';
import { createBillingService } from './billing.js';
import { assertPaidAccess } from './billing-enforcement.js';
import { billingError } from './billing-policy.js';

const fail = (code = 'AI_BILLING_PRICING_REQUIRED') => { throw billingError(code, 503); };
const decimal = (value) => {
  if (typeof value !== 'string' || !/^\d{1,8}(\.\d{1,6})?$/.test(value)) fail();
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
};
const parse = (v) => typeof v === 'string' ? JSON.parse(v) : v;
export function parseBillingTariffs(raw = '{}', now = Date.now()) {
  let config; try { config = JSON.parse(raw); } catch { fail(); }
  if (!config || Array.isArray(config) || typeof config !== 'object') fail();
  for (const [id, p] of Object.entries(config)) {
    if (!/^[a-zA-Z0-9._-]{1,150}$/.test(id) || !p || !['inputUsdPerMillion','outputUsdPerMillion','cacheReadUsdPerMillion'].every(k => typeof p[k] === 'string') ||
      !Number.isSafeInteger(p.maxInputTokens) || p.maxInputTokens < 1 || p.maxInputTokens > 2000000 ||
      !Number.isSafeInteger(p.maxOutputTokens) || p.maxOutputTokens < 1 || p.maxOutputTokens > 200000 ||
      typeof p.approvalReference !== 'string' || !/^[A-Za-z0-9:._/-]{5,191}$/.test(p.approvalReference) ||
      !Number.isFinite(Date.parse(p.verifiedAt)) || !Number.isFinite(Date.parse(p.validUntil)) ||
      Date.parse(p.verifiedAt) > now || Date.parse(p.validUntil) <= now || Date.parse(p.validUntil) <= Date.parse(p.verifiedAt)) fail();
    if (decimal(p.inputUsdPerMillion) <= 0n || decimal(p.outputUsdPerMillion) <= 0n || decimal(p.cacheReadUsdPerMillion) < 0n) fail();
  }
  return config;
}
export function quoteBilledUsage(snapshot, usage) {
  const counts = [usage?.input_tokens, usage?.output_tokens, usage?.cache_read_input_tokens ?? 0, usage?.cache_creation_input_tokens ?? 0];
  if (counts.some(n => !Number.isSafeInteger(n) || n < 0) || counts[3] !== 0 || counts[0] + counts[2] > snapshot.tariff.maxInputTokens || counts[1] > snapshot.maxOutputTokens) fail('AI_BILLING_USAGE_UNRESOLVED');
  const t = snapshot.tariff;
  const numerator = (BigInt(counts[0])*decimal(t.inputUsdPerMillion) + BigInt(counts[1])*decimal(t.outputUsdPerMillion) + BigInt(counts[2])*decimal(t.cacheReadUsdPerMillion)) * decimal(snapshot.fx.idrPerUsd) * 2n;
  return ((numerator + 10n**18n - 1n) / 10n**18n).toString();
}

// Text-only conservative estimate, NOT a tokenizer or a provider usage report.
// Count the whole server-built request (system prompt + complete history), using
// UTF-8 bytes rather than characters/4, then add framing and a 10% safety margin.
// Unsupported paid modalities/tools must not silently receive a text estimate.
export function reservationInputTokens(input, maxInputTokens) {
  const allowed = ['model','max_tokens','system','messages','temperature','top_p','top_k','stop_sequences','stream','metadata'];
  const text = content => typeof content === 'string' || (Array.isArray(content) && content.every(block =>
    block && Object.keys(block).every(key => ['type','text'].includes(key)) && block.type === 'text' && typeof block.text === 'string'));
  if (!input || Object.keys(input).some(key => !allowed.includes(key)) || !Array.isArray(input.messages) || !input.messages.length
    || input.messages.some(message => !message || !['user','assistant'].includes(message.role) || !text(message.content)
      || Object.keys(message).some(key => !['role','content'].includes(key)))
    || (input.system !== undefined && !text(input.system))) fail('AI_BILLING_FEATURE_UNSUPPORTED');
  const bytes = Buffer.byteLength(JSON.stringify(input), 'utf8');
  if (bytes > 8_000_000) fail('AI_BILLING_INPUT_TOO_LARGE');
  const budget = Math.ceil((bytes + 1024 + input.messages.length * 32) * 1.1);
  return Math.min(maxInputTokens, budget);
}

export function createAiBilling(getPool, { pricing, env = process.env, now = Date.now, service = createBillingService(getPool), resolveTariff = null }) {
  async function prepare(id, scope, input, sequence) {
    if (!Number.isSafeInteger(scope.sessionId) || scope.sessionId < 1) fail('AI_BILLING_ACCESS_DENIED');
    const tariff = resolveTariff ? await resolveTariff(input.model, now()) : parseBillingTariffs(env.BILLING_MODEL_RATES_JSON, now())[input.model];
    if (tariff) parseBillingTariffs(JSON.stringify({[input.model]:tariff}),now());
    if (!tariff || !Number.isSafeInteger(input.max_tokens) || input.max_tokens < 1 || input.max_tokens > tariff.maxOutputTokens) fail();
    // Cache writes, extended thinking and other independently billed features are not enabled.
    if (input.thinking || input.cache_control || /"cache_control"\s*:/.test(JSON.stringify(input))) fail('AI_BILLING_FEATURE_UNSUPPORTED');
    const current = await pricing.snapshot();
    const fx = current.fx, day = Date.parse(`${fx?.date}T00:00:00Z`), time = now();
    if (!fx?.available || !Number.isFinite(day) || day > time || time-day > 5*86400000 || decimal(fx.idrPerUsd) <= 0n) fail('AI_BILLING_FX_UNAVAILABLE');
    const inputTokenBudget = reservationInputTokens(input, tariff.maxInputTokens);
    const snapshot = { model: input.model, tariff, fx: { date: fx.date, idrPerUsd: fx.idrPerUsd }, markup: 2, maxOutputTokens: input.max_tokens,
      reservation: { method: 'utf8-json-margin-v1', inputTokens: inputTokenBudget }, capturedAt: new Date(time).toISOString() };
    const maximumRate = decimal(tariff.inputUsdPerMillion) >= decimal(tariff.cacheReadUsdPerMillion) ? tariff.inputUsdPerMillion : tariff.cacheReadUsdPerMillion;
    const amountIdr = quoteBilledUsage({ ...snapshot, tariff: { ...tariff, inputUsdPerMillion: maximumRate } }, { input_tokens: inputTokenBudget, output_tokens: input.max_tokens });
    const requestKey = createHash('sha256').update(scope.requestId ? `${scope.operation}:${scope.requestId}:${sequence}` : scope.operation === 'job' ? `job:${scope.resourceId}:${sequence}` : id).digest('hex');
    await service.reserve({ organizationId: scope.organizationId, key: `ai-reserve:${id}`, amountIdr, onReserved: async (c, holdId) => {
      await assertPaidAccess(c, scope.organizationId);
      // Recheck persisted identity and workspace membership immediately before reserving.
      const [[access]] = await c.execute(`SELECT u.id FROM users u JOIN workspaces w ON w.id=? AND w.organization_id=? AND w.status='active'
        JOIN sessions s ON s.user_id=u.id AND s.id=? AND s.active_workspace_id=w.id AND s.revoked_at IS NULL
          AND s.idle_expires_at>UTC_TIMESTAMP() AND s.absolute_expires_at>UTC_TIMESTAMP()
        LEFT JOIN organization_memberships om ON om.organization_id=w.organization_id AND om.user_id=u.id AND om.revoked_at IS NULL
        LEFT JOIN workspace_memberships wm ON wm.workspace_id=w.id AND wm.user_id=u.id AND wm.revoked_at IS NULL
        WHERE u.id=? AND u.status='active' AND (om.role='owner' OR wm.role IN ('admin','member')) FOR UPDATE`, [scope.workspaceId, scope.organizationId, scope.sessionId, scope.userId]);
      if (!access) throw billingError('AI_BILLING_ACCESS_DENIED', 403);
      await c.execute(`INSERT INTO ai_billing_attempts (usage_id,organization_id,request_key,hold_id,pricing_snapshot,request_hash)
        VALUES (?,?,?,?,?,?)`, [id,scope.organizationId,requestKey,holdId,JSON.stringify(snapshot),createHash('sha256').update(JSON.stringify(input)).digest('hex')]);
    } });
  }
  async function dispatched(id) {
    const [r] = await getPool().execute("UPDATE ai_billing_attempts SET state='dispatched' WHERE usage_id=? AND state='prepared'",[id]);
    if (r.affectedRows !== 1) fail('AI_BILLING_DISPATCH_CONFLICT');
  }
  async function settle(id) {
    const [[row]] = await getPool().execute('SELECT organization_id,hold_id,pricing_snapshot,provider_evidence,state FROM ai_billing_attempts WHERE usage_id=?',[id]);
    if (!row || row.state === 'released') fail('AI_BILLING_ATTEMPT_INVALID');
    if (row.state === 'settled') return;
    const snapshot = parse(row.pricing_snapshot), evidence = parse(row.provider_evidence);
    if (!evidence || evidence.model !== snapshot.model || typeof evidence.id !== 'string' || !evidence.id || !evidence.usage) fail('AI_BILLING_USAGE_UNRESOLVED');
    const actualIdr = quoteBilledUsage(snapshot, evidence.usage);
    await service.finishHold({ organizationId: row.organization_id, key: `ai-settle:${id}`, holdId: row.hold_id, actualIdr, onFinished: async c => {
      await c.execute("UPDATE ai_billing_attempts SET state='settled',actual_idr=?,finished_at=UTC_TIMESTAMP() WHERE usage_id=?",[actualIdr,id]);
    } });
  }
  async function finish(id, message) {
    if (!message) {
      await getPool().execute("UPDATE ai_billing_attempts SET state='unresolved' WHERE usage_id=? AND state IN ('prepared','dispatched')",[id]);
      return; // Unknown transport outcome is never assumed free, and never auto-retried.
    }
    // Store evidence before settlement so a database failure can be reconciled without replaying AI.
    const evidence = { id: message.id, model: message.model, usage: message.usage };
    await getPool().execute("UPDATE ai_billing_attempts SET provider_evidence=?,provider_message_id=?,state='unresolved' WHERE usage_id=? AND state IN ('dispatched','unresolved') AND provider_evidence IS NULL",[JSON.stringify(evidence),typeof message.id === 'string' ? message.id : null,id]);
    await settle(id);
  }
  return { prepare, dispatched, finish, reconcile: settle };
}
