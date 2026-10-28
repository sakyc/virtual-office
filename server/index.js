import 'dotenv/config';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { agentById } from '../shared/roster.js';
import { buildSystemPrompt } from './prompts.js';
import { initDb, pool } from './db.js';
import { createApiRouter } from './api.js';
import { installAuthRoutes } from './auth/auth-routes.js';
import { installOnboardingRoutes } from './auth/onboarding-routes.js';
import { createTenantGate } from './auth/tenant-gate.js';
import { installDashboardRoutes } from './dashboard-routes.js';
import { processTenantJob } from './tenant-jobs.js';
import { processTenantRevision } from './tenant-review.js';
import { installOfficeChatRoutes } from './office-chat.js';
import { createUsageStore, installUsageRoutes } from './ai-usage.js';
import { installTeamRoutes, resolveWorkspaceAgent } from './workspace-team.js';
import { installTaskTemplateRoutes } from './task-templates.js';
import { createChatHistoryStore } from './chat-history.js';
import { createLiveChatModelCatalog } from './live-chat-models.js';
import { readModelCatalog } from './model-catalog.js';
import { createUsagePricing } from './ai-pricing.js';
import { installBillingRoutes } from './billing.js';
import { installCatalogRoutes } from './billing-catalog.js';
import { installPlatformAdminRoutes } from './platform-admin.js';
import { createAiBilling } from './ai-billing.js';
import { createPaidMutationGate } from './billing-enforcement.js';
import { installBillingAdministrationRoutes } from './billing-administration.js';
import { installTenantMemberRoutes } from './tenant-members.js';
import { createWorkLifecycle } from './work-lifecycle.js';

// ---------- Konfigurasi (lihat .env.example) ----------
const PORT = Number(process.env.PORT || 3001);
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ACCESS_CODE = process.env.ACCESS_CODE || '';
const MODEL_LEADER = process.env.MODEL_LEADER || 'claude-sonnet-5-5';
const MODEL_TEAM = process.env.MODEL_TEAM || 'claude-haiku-4-5-20251001';
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 1500);
const RATE_PER_MINUTE = Number(process.env.RATE_PER_MINUTE || 15);
const DAILY_MAX_REQUESTS = Number(process.env.DAILY_MAX_REQUESTS || 300);
const MAX_HISTORY = 20;
const MAX_CHARS = 4000;

const DEMO = !API_KEY;
const client = DEMO ? null : new Anthropic({ apiKey: API_KEY });
const chatModels = createLiveChatModelCatalog({ models: { leader: MODEL_LEADER, team: MODEL_TEAM },
  json: process.env.CHAT_MODELS_JSON || '', client, maxTokens: MAX_TOKENS, databaseOnly: true, readTariffs: () => readModelCatalog(pool) });

const app = express();
const lifecycle = createWorkLifecycle();
app.use(lifecycle.middleware);
// Apache is directly connected over loopback and replaces forwarding headers.
// Never trust forwarding headers from an arbitrary directly connected client.
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '1mb' })); // 1mb: Reporting dan Review kode menempelkan data/kode panjang
// Native login shares the existing server sessions. Migrations remain explicit.
installAuthRoutes(app, { getPool: () => pool });
installCatalogRoutes(app, { getPool: () => pool });
installPlatformAdminRoutes(app, { getPool: () => pool });
installBillingAdministrationRoutes(app, { getPool: () => pool, modelCatalog: chatModels, readModels: readModelCatalog });
installOnboardingRoutes(app, { getPool: () => pool });
const requireTenantApi = lifecycle.handler(createTenantGate({ getPool: () => pool }));
const requireTenantDashboard = lifecycle.handler(createTenantGate({ getPool: () => pool, resourceQueriesScoped: true, memberAssignments: true }));
installTenantMemberRoutes(app, { getPool: () => pool, requireTenant: requireTenantDashboard,
  appOrigin: process.env.APP_ORIGIN || (process.env.NODE_ENV === 'production' ? null : 'http://localhost:5173') });
const usagePricing = createUsagePricing({ getModelRates: () => chatModels.estimateRates() });
const usageStore = createUsageStore(() => pool, { billing: createAiBilling(() => pool, { pricing: usagePricing, resolveTariff: (model) => chatModels.resolveTariff(model) }) });
const requirePaidAi = lifecycle.handler(createPaidMutationGate({ getPool: () => pool, providerAvailable: Boolean(client) }));
app.post(['/api/dashboard/jobs', '/api/dashboard/items/:id/revise'], requireTenantDashboard, requirePaidAi);
installBillingRoutes(app, { getPool: () => pool, requireTenant: requireTenantDashboard });
installTaskTemplateRoutes(app, { getPool: () => pool, requireTenant: requireTenantDashboard,
  appOrigin: process.env.APP_ORIGIN || (process.env.NODE_ENV === 'production' ? null : 'http://localhost:5173') });
installTeamRoutes(app, { getPool: () => pool, requireTenant: requireTenantDashboard,
  appOrigin: process.env.APP_ORIGIN || (process.env.NODE_ENV === 'production' ? null : 'http://localhost:5173'),
  models: { leader: MODEL_LEADER, team: MODEL_TEAM } });
installUsageRoutes(app, { getPool: () => pool, requireTenant: requireTenantDashboard, pricing: usagePricing });
installDashboardRoutes(app, {
  trackHandler: lifecycle.handler, runBackground: lifecycle.track,
  getPool: () => pool,
  appOrigin: process.env.APP_ORIGIN || (process.env.NODE_ENV === 'production' ? null : 'http://localhost:5173'),
  modelCatalog: chatModels,
  requireTenant: requireTenantDashboard,
  runTenantJob: (jobId, tenantContext, userId, sessionId) => processTenantJob({ pool, client, DEMO, models: { leader: MODEL_LEADER, team: MODEL_TEAM }, jobId, tenantContext, userId, sessionId, usageStore }),
  runTenantRevision: (reservation) => processTenantRevision({ pool, client, DEMO, models: { leader: MODEL_LEADER, team: MODEL_TEAM }, reservation, usageStore }),
});

// ---------- Pembatas: akses, rate limit per IP, batas harian ----------
function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function requireAccess(req, res, next) {
  if (!ACCESS_CODE) return next();
  if (safeEqual(req.get('x-access-code') || '', ACCESS_CODE)) return next();
  res.status(401).json({ error: 'Kode akses salah atau belum diisi.' });
}

const hits = new Map(); // ip -> [timestamp]
function rateLimit(req, res, next) {
  const now = Date.now();
  const list = (hits.get(req.ip) || []).filter((t) => now - t < 60_000);
  if (list.length >= RATE_PER_MINUTE) {
    return res.status(429).json({ error: 'Terlalu cepat. Tunggu sebentar lalu coba lagi.' });
  }
  list.push(now);
  hits.set(req.ip, list);
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) {
    if (!list.some((t) => now - t < 60_000)) hits.delete(ip);
  }
}, 5 * 60_000).unref();

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
let daily = { day: today(), count: 0 };
function dailyCap(req, res, next) {
  if (daily.day !== today()) daily = { day: today(), count: 0 };
  if (daily.count >= DAILY_MAX_REQUESTS) {
    return res.status(429).json({ error: 'Batas pemakaian harian tercapai. Coba lagi besok.' });
  }
  daily.count += 1;
  next();
}

// ---------- Util ----------
installOfficeChatRoutes(app, {
  trackHandler: lifecycle.handler,
  requireTenant: requireTenantDashboard, client,
  appOrigin: process.env.APP_ORIGIN || (process.env.NODE_ENV === 'production' ? null : 'http://localhost:5173'),
  rateLimit, dailyCap, models: { leader: MODEL_LEADER, team: MODEL_TEAM }, maxTokens: MAX_TOKENS,
  usageStore,
  historyStore: createChatHistoryStore(() => pool),
  modelCatalog: chatModels,
  resolveAgent: async (tenant, id) => {
    const connection = await pool.getConnection();
    try { return await resolveWorkspaceAgent(connection, tenant, id); } finally { connection.release(); }
  },
});

function cleanMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const out = raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_CHARS) }))
    .filter((m) => m.content)
    .slice(-MAX_HISTORY);
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function demoReply(agent, lastUser) {
  return (
    `Halo, gue ${agent.name.split(' ')[0]} (${agent.role}).\n\n` +
    `**Mode demo**: server belum punya ANTHROPIC_API_KEY, jadi ini jawaban contoh supaya tampilan chat bisa dites.\n\n` +
    `Lo bilang: "${lastUser.slice(0, 160)}"\n\n` +
    `Setelah API key dipasang, gue bakal jawab sungguhan sesuai keahlian gue: ${agent.focus}.\n\n` +
    `- Poin contoh pertama\n- Poin contoh kedua\n- Poin contoh ketiga`
  );
}

function friendlyError(err) {
  const status = err?.status;
  if (status === 401) return 'API key Anthropic ditolak. Cek ANTHROPIC_API_KEY di server.';
  if (status === 402 || status === 403) return 'Akun API tidak punya akses atau saldo. Cek Console Anthropic.';
  if (status === 429) return 'Kena rate limit dari Anthropic. Coba lagi sebentar lagi.';
  if (status === 529 || status >= 500) return 'Server Claude lagi sibuk. Coba lagi sebentar lagi.';
  return 'Terjadi kesalahan di server. Coba lagi.';
}

// ---------- API ----------
app.get('/api/config', (req, res) => {
  res.json({ demo: DEMO, needsCode: Boolean(ACCESS_CODE) });
});

app.get('/api/verify', requireAccess, (req, res) => res.json({ ok: true }));

app.post('/api/chat', requireTenantApi, rateLimit, dailyCap, lifecycle.handler(async (req, res) => {
  const agent = agentById(req.body?.agentId);
  if (!agent) return res.status(400).json({ error: 'Karyawan tidak ditemukan.' });

  const messages = cleanMessages(req.body?.messages);
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Pesan kosong.' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  let closed = false;
  let stream = null;
  res.on('close', () => {
    closed = true;
    if (stream && !res.writableFinished) stream.abort();
  });

  try {
    if (DEMO) {
      const words = demoReply(agent, messages[messages.length - 1].content).split(/(\s+)/);
      for (const w of words) {
        if (closed) return;
        send({ t: w });
        await sleep(25);
      }
    } else {
      stream = client.messages.stream({
        model: agent.leader ? MODEL_LEADER : MODEL_TEAM,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(agent),
        messages,
      });
      stream.on('text', (t) => {
        if (!closed) send({ t });
      });
      const final = await stream.finalMessage();
      const u = final.usage || {};
      console.log(`[chat] ${agent.id} model=${final.model} in=${u.input_tokens} out=${u.output_tokens}`);
    }
    if (!closed) send({ done: true });
  } catch (err) {
    if (!closed) {
      console.error('[chat error]', err?.status || '', err?.message || err);
      send({ error: friendlyError(err) });
    }
  } finally {
    res.end();
  }
}));

// ---------- Perintah (job), board, klien: butuh database ----------
app.use('/api', createApiRouter({
  trackHandler: lifecycle.handler, runBackground: lifecycle.track,
  client,
  DEMO,
  requireAccess,
  rateLimit,
  dailyCap,
  models: { leader: MODEL_LEADER, team: MODEL_TEAM },
  customerAuth: requireTenantApi,
}));

// ---------- Frontend hasil build (produksi) ----------
const dist = fileURLToPath(new URL('../dist', import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(`${dist}/index.html`);
  });
}

void lifecycle.track(() => initDb());

const server = app.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  console.log(`Kantor AI API jalan di http://localhost:${PORT}`);
  console.log(DEMO ? 'Mode: DEMO (tanpa ANTHROPIC_API_KEY)' : `Mode: LIVE  leader=${MODEL_LEADER}  tim=${MODEL_TEAM}`);
  console.log(ACCESS_CODE ? 'Kode akses: aktif' : 'Kode akses: TIDAK aktif (isi ACCESS_CODE sebelum dipublikasi)');
});

let shutdownRequested = false;
function shutdown() {
  if (shutdownRequested) return;
  shutdownRequested = true;
  console.log(`[shutdown] draining active=${lifecycle.active}; no automatic AI retries`);
  void lifecycle.stop({ server, timeoutMs: 300000, closeResources: async () => { await pool?.end(); } })
    .then(({ drained, active }) => {
      console.log(`[shutdown] ${drained ? 'completed' : 'timeout; operator review required'} active=${active}`);
      process.exit(drained ? 0 : 1);
    }).catch(() => {
      console.error('[shutdown] failed; operator review required');
      process.exit(1);
    });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
