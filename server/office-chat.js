import { createHmac, randomBytes } from 'node:crypto';
import { authorizeTenantAction } from './auth/tenant-authorization.js';
import { trackedClient } from './ai-usage.js';
import { workspaceAgentPrompt } from './workspace-team.js';
import { installConversationRoutes, validChatId } from './chat-history.js';
import { createChatModelCatalog } from './chat-models.js';

// Scope binding is not an authentication credential. Restart invalidates old tabs.
export function installOfficeChatRoutes(app, { requireTenant, client, appOrigin, rateLimit, dailyCap, models, maxTokens = 1500, usageStore, resolveAgent, historyStore, modelCatalog = createChatModelCatalog(models) }) {
  const secret = randomBytes(32);
  const scopeOf = (req) => createHmac('sha256', secret).update(JSON.stringify([
    req.authPrincipal.sessionId, req.authPrincipal.userId,
    req.tenantContext.organizationId, req.tenantContext.workspaceId,
  ])).digest('hex');
  const permitted = (req, res, next) => {
    const { organizationId, workspaceId, role } = req.tenantContext;
    const userId = String(req.authPrincipal.userId);
    const context = { organizationId, workspaceId,
      organizationMemberships: role === 'owner' ? [{ userId, organizationId, role, active: true }] : [],
      workspaceMemberships: [{ userId, organizationId, workspaceId, role, active: true }],
    };
    if (!authorizeTenantAction({ principal: { userId }, context, resource: { organizationId, workspaceId }, permission: 'chat:create' }).allowed)
      return res.status(403).json({ error: 'Anda tidak memiliki izin menggunakan chat workspace.' });
    next();
  };
  if (historyStore) installConversationRoutes(app, { store: historyStore, requireTenant, permitted, appOrigin, modelCatalog });
  app.get('/api/office/chat/context', requireTenant, permitted, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const modelSelection = Boolean(historyStore && await historyStore.supportsModelSelection());
      await modelCatalog.refresh?.();
      const choices = modelCatalog.list().filter(model => model.selectable !== false);
      const defaultModels = Object.fromEntries(Object.entries(models).filter(([, id]) => choices.some(model => model.id === id)));
      res.json({ scope: scopeOf(req), available: Boolean(client), ephemeral: !historyStore, persistent: Boolean(historyStore), modelSelection, models: choices, defaultModels });
    } catch { res.status(503).json({ error: 'Riwayat chat belum tersedia.' }); }
  });
  app.post('/api/office/chat', requireTenant, permitted, async (req, res, next) => {
    if (!appOrigin || req.get('origin') !== appOrigin || !req.is('application/json'))
      return res.status(403).json({ error: 'Origin chat tidak diizinkan.' });
    const body = req.body;
    if (!body || Object.keys(body).some((key) => !(historyStore ? ['agentId', 'conversationId', 'content', 'scope'] : ['agentId', 'messages', 'scope']).includes(key)))
      return res.status(400).json({ error: 'Permintaan chat tidak valid.' });
    if (body.scope !== scopeOf(req)) return res.status(409).json({ error: 'Sesi atau workspace berubah. Buka ulang chat.', code: 'CHAT_SCOPE_CHANGED' });
    if (historyStore ? (!validChatId(body.agentId) || !validChatId(body.conversationId) || typeof body.content !== 'string' || !body.content.trim() || body.content.length > 4000) : (typeof body.agentId !== 'string' || body.agentId.length > 100 || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 20
      || body.messages.some((m, i) => !m || m.role !== (i % 2 === 0 ? 'user' : 'assistant') || typeof m.content !== 'string' || !m.content.trim() || m.content.length > (m.role === 'assistant' ? 16000 : 4000))
      || body.messages.at(-1).role !== 'user')) return res.status(400).json({ error: 'Pesan tidak valid (maksimal 4000 karakter per pesan).' });
    try {
      // No static-roster or shared-access fallback, including on missing migration/configuration.
      if (!resolveAgent) throw new Error('Workspace agent resolver unavailable');
      req.officeAgent = await resolveAgent(req.tenantContext, body.agentId);
      if (!req.officeAgent) return res.status(400).json({ error: 'Agen tidak valid.' });
    } catch (error) { return res.status([403,404].includes(error.status) ? error.status : 503).json({ error: error.status === 403 ? 'Agen ini belum ditugaskan kepada Anda.' : 'Agen workspace belum tersedia.' }); }
    if (!client) return res.status(503).json({ error: 'Layanan AI belum dikonfigurasi. Tidak ada jawaban demo yang dikirim.' });
    next();
  }, rateLimit, dailyCap, async (req, res) => {
    const agent = req.officeAgent;
    const context = { ...req.tenantContext, userId: req.authPrincipal.userId };
    let turn, model;
    try {
      await modelCatalog.refresh?.();
      if (historyStore) turn = await historyStore.begin(context, req.body.conversationId, agent.id, req.body.content.trim(), (override) => modelCatalog.resolve(override, agent));
      model = turn?.modelId || modelCatalog.resolve(null, agent);
    }
    catch (error) { return res.status([404, 409].includes(error.status) ? error.status : 503).json({ error: [404, 409].includes(error.status) ? error.message : 'Riwayat chat belum dapat disimpan. Tidak ada panggilan AI yang dikirim.' }); }
    // Persistent mode uses ONLY server-owned completed history, never client messages.
    const messages = turn ? turn.messages : req.body.messages.map(({ role, content }) => ({ role, content }));
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
    let stream, closed = res.destroyed, answer = '';
    const disconnect = () => { closed = true; if (!res.writableFinished) stream?.abort(); };
    res.on('close', disconnect);
    const send = (event) => { if (!closed) res.write(`data: ${JSON.stringify(event)}\n\n`); };
    const timeout = setTimeout(() => { closed = true; stream?.abort(); res.destroy(); }, 240000);
    timeout.unref?.();
    try {
      if (closed) throw new Error('Client disconnected');
      send({ model });
      const apiClient = trackedClient(client, usageStore, { ...req.tenantContext, userId: req.authPrincipal.userId, sessionId: req.authPrincipal.sessionId, operation: 'chat', agentId: agent.id });
      stream = await apiClient.messages.stream({ model, max_tokens: maxTokens, system: workspaceAgentPrompt(agent), messages });
      if (closed) stream.abort();
      stream.on('text', (text) => { answer += text; send({ t: text }); });
      await stream.finalMessage();
      if (closed) throw new Error('Client disconnected');
      if (turn) await historyStore.finish(context, turn, answer);
      send({ done: true });
    } catch (error) {
      if (turn) await historyStore.fail(context, turn).catch(() => {});
      send({ error: error.status === 402 ? (error.code === 'INSUFFICIENT_AI_BALANCE' ? 'Saldo AI tidak cukup untuk reservasi permintaan ini.' : error.message) : error.code === 'AI_BILLING_PRICING_REQUIRED' ? 'Tarif penagihan model belum divalidasi oleh operator. Tidak ada panggilan AI yang dikirim.' : 'Jawaban AI belum dapat diselesaikan. Saldo yang hasil pemakaiannya belum pasti tetap direservasi untuk pemeriksaan.' });
    } finally { clearTimeout(timeout); res.off('close', disconnect); res.end(); }
  });
}
