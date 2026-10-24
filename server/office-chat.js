import { createHmac, randomBytes } from 'node:crypto';
import { authorizeTenantAction } from './auth/tenant-authorization.js';
import { trackedClient } from './ai-usage.js';
import { workspaceAgentPrompt } from './workspace-team.js';

// Scope binding is not an authentication credential. Restart invalidates old tabs.
export function installOfficeChatRoutes(app, { requireTenant, client, appOrigin, rateLimit, dailyCap, models, maxTokens = 1500, usageStore, resolveAgent }) {
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
  app.get('/api/office/chat/context', requireTenant, permitted, (req, res) => {
    res.json({ scope: scopeOf(req), available: Boolean(client), ephemeral: true });
  });
  app.post('/api/office/chat', requireTenant, permitted, async (req, res, next) => {
    if (!appOrigin || req.get('origin') !== appOrigin || !req.is('application/json'))
      return res.status(403).json({ error: 'Origin chat tidak diizinkan.' });
    const body = req.body;
    if (!body || Object.keys(body).some((key) => !['agentId', 'messages', 'scope'].includes(key)))
      return res.status(400).json({ error: 'Permintaan chat tidak valid.' });
    if (body.scope !== scopeOf(req)) return res.status(409).json({ error: 'Sesi atau workspace berubah. Buka ulang chat.' });
    if (typeof body.agentId !== 'string' || body.agentId.length > 100 || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 20
      || body.messages.some((m, i) => !m || m.role !== (i % 2 === 0 ? 'user' : 'assistant') || typeof m.content !== 'string' || !m.content.trim() || m.content.length > (m.role === 'assistant' ? 16000 : 4000))
      || body.messages.at(-1).role !== 'user') return res.status(400).json({ error: 'Pesan tidak valid (maksimal 4000 karakter per pesan).' });
    try {
      // No static-roster or shared-access fallback, including on missing migration/configuration.
      if (!resolveAgent) throw new Error('Workspace agent resolver unavailable');
      req.officeAgent = await resolveAgent(req.tenantContext, body.agentId);
      if (!req.officeAgent) return res.status(400).json({ error: 'Agen tidak valid.' });
    } catch (error) { return res.status(error.status === 404 ? 404 : 503).json({ error: 'Agen workspace belum tersedia.' }); }
    if (!client) return res.status(503).json({ error: 'Layanan AI belum dikonfigurasi. Tidak ada jawaban demo yang dikirim.' });
    next();
  }, rateLimit, dailyCap, async (req, res) => {
    const agent = req.officeAgent;
    // Only explicitly supplied text is sent. No tools, shared history or resource lookups.
    const messages = req.body.messages.map(({ role, content }) => ({ role, content }));
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
    let stream, closed = false;
    const disconnect = () => { closed = true; if (!res.writableFinished) stream?.abort(); };
    res.on('close', disconnect);
    const send = (event) => { if (!closed) res.write(`data: ${JSON.stringify(event)}\n\n`); };
    try {
      const apiClient = trackedClient(client, usageStore, { ...req.tenantContext, userId: req.authPrincipal.userId, operation: 'chat', agentId: agent.id });
      stream = await apiClient.messages.stream({ model: agent.modelTier === 'leader' ? models.leader : models.team, max_tokens: maxTokens, system: workspaceAgentPrompt(agent), messages });
      if (closed) stream.abort();
      stream.on('text', (text) => send({ t: text }));
      await stream.finalMessage();
      send({ done: true });
    } catch {
      send({ error: 'Jawaban AI belum dapat diselesaikan. Silakan coba lagi.' });
    } finally { res.end(); }
  });
}
