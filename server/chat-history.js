import { randomUUID } from 'node:crypto';
import { resolveWorkspaceAgent } from './workspace-team.js';
import { teamError } from '../shared/workspace-team.js';

const identity = (ctx) => [ctx.organizationId, ctx.workspaceId, ctx.userId];
const owned = 'organization_id = ? AND workspace_id = ? AND user_id = ? AND id = ?';
export const validChatId = (id) => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);

// All callers supply identity from the validated session/tenant gate, never body IDs.
export function createChatHistoryStore(getPool) {
  async function withConnection(action, transaction = false) {
    const c = await getPool().getConnection();
    try {
      if (transaction) await c.beginTransaction();
      const value = await action(c);
      if (transaction) await c.commit();
      return value;
    } catch (error) { if (transaction) await c.rollback().catch(() => {}); throw error; }
    finally { c.release(); }
  }
  async function conversation(c, ctx, id, lock = false) {
    if (!validChatId(id)) throw teamError('Percakapan tidak ditemukan.', 404);
    const [[row]] = await c.execute(`SELECT *, pending_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE) AS busy FROM chat_conversations WHERE ${owned} AND status = 'active'${lock ? ' FOR UPDATE' : ''}`, [...identity(ctx), id]);
    if (!row) throw teamError('Percakapan tidak ditemukan.', 404);
    await resolveWorkspaceAgent(c, ctx, row.agent_id);
    return row;
  }
  async function messages(c, id, limit, before) {
    const [rows] = await c.execute(`SELECT CAST(id AS CHAR) AS id, role, content FROM chat_messages WHERE conversation_id = ? AND status = 'complete'${before ? ' AND id < ?' : ''} ORDER BY chat_messages.id DESC LIMIT ${limit}`, before ? [id, before] : [id]);
    return rows.reverse();
  }
  return {
    async list(ctx, agentId, offset = 0) {
      return withConnection(async (c) => {
        await resolveWorkspaceAgent(c, ctx, agentId);
        const [rows] = await c.execute(`SELECT id, title, updated_at AS updatedAt FROM chat_conversations WHERE organization_id = ? AND workspace_id = ? AND user_id = ? AND agent_id = ? AND status = 'active' ORDER BY updated_at DESC, id DESC LIMIT 50 OFFSET ${offset}`, [...identity(ctx), agentId]);
        return { conversations: rows, nextOffset: rows.length === 50 ? offset + 50 : null };
      });
    },
    async create(ctx, agentId) {
      return withConnection(async (c) => {
        await resolveWorkspaceAgent(c, ctx, agentId);
        const id = randomUUID();
        await c.execute('INSERT INTO chat_conversations (id, organization_id, workspace_id, user_id, agent_id) VALUES (?, ?, ?, ?, ?)', [id, ...identity(ctx), agentId]);
        return { id, title: 'Chat baru' };
      });
    },
    async read(ctx, id, before = null) {
      return withConnection(async (c) => {
        const row = await conversation(c, ctx, id);
        const rows = await messages(c, id, 100, before);
        return { id, agentId: row.agent_id, title: row.title, messages: rows, nextBefore: rows.length === 100 ? rows[0].id : null, busy: Boolean(row.busy && row.pending_turn) };
      });
    },
    async update(ctx, id, change) {
      return withConnection(async (c) => {
        const row = await conversation(c, ctx, id, true);
        if (row.pending_turn && row.busy) throw teamError('Tunggu jawaban selesai sebelum mengubah percakapan.', 409);
        if (change.archive) await c.execute(`UPDATE chat_conversations SET status = 'archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE ${owned}`, [...identity(ctx), id]);
        else await c.execute(`UPDATE chat_conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE ${owned}`, [change.title, ...identity(ctx), id]);
        return { updated: true };
      }, true);
    },
    async begin(ctx, id, agentId, content) {
      return withConnection(async (c) => {
        const row = await conversation(c, ctx, id, true);
        if (row.agent_id !== agentId) throw teamError('Percakapan bukan milik agen ini.', 404);
        if (row.pending_turn && row.busy) throw teamError('Percakapan sedang menjawab. Tunggu sebentar.', 409);
        // Recover only an expired lease. Late streams cannot commit a superseded turn.
        if (row.pending_turn) await c.execute("UPDATE chat_messages SET status = 'failed' WHERE conversation_id = ? AND turn_id = ? AND status = 'pending'", [id, row.pending_turn]);
        const history = await messages(c, id, 18);
        const token = randomUUID();
        await c.execute("INSERT INTO chat_messages (conversation_id, turn_id, role, content, status) VALUES (?, ?, 'user', ?, 'pending')", [id, token, content]);
        await c.execute(`UPDATE chat_conversations SET pending_turn = ?, pending_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE ${owned}`, [token, ...identity(ctx), id]);
        return { id, token, messages: [...history.map(({ role, content: text }) => ({ role, content: text })), { role: 'user', content }] };
      }, true);
    },
    async finish(ctx, turn, answer) {
      return withConnection(async (c) => {
        const row = await conversation(c, ctx, turn.id, true);
        if (row.pending_turn !== turn.token || !row.busy) throw teamError('Giliran chat sudah kedaluwarsa. Muat ulang riwayat.', 409);
        if (typeof answer !== 'string' || !answer.trim() || answer.length > 64000) throw new Error('Invalid assistant output');
        await c.execute("INSERT INTO chat_messages (conversation_id, turn_id, role, content, status) VALUES (?, ?, 'assistant', ?, 'complete')", [turn.id, turn.token, answer]);
        await c.execute("UPDATE chat_messages SET status = 'complete' WHERE conversation_id = ? AND turn_id = ? AND role = 'user' AND status = 'pending'", [turn.id, turn.token]);
        await c.execute(`UPDATE chat_conversations SET pending_turn = NULL, pending_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE ${owned}`, [...identity(ctx), turn.id]);
      }, true);
    },
    async fail(ctx, turn) {
      return withConnection(async (c) => {
        // Cleanup remains scoped to owner but does not require the agent still be active.
        const [[row]] = await c.execute(`SELECT pending_turn FROM chat_conversations WHERE ${owned} FOR UPDATE`, [...identity(ctx), turn.id]);
        if (row?.pending_turn !== turn.token) return;
        await c.execute("UPDATE chat_messages SET status = 'failed' WHERE conversation_id = ? AND turn_id = ? AND status = 'pending'", [turn.id, turn.token]);
        await c.execute(`UPDATE chat_conversations SET pending_turn = NULL, pending_at = NULL WHERE ${owned}`, [...identity(ctx), turn.id]);
      }, true);
    },
  };
}

export function installConversationRoutes(app, { store, requireTenant, permitted, appOrigin }) {
  const ctx = (req) => ({ ...req.tenantContext, userId: req.authPrincipal.userId });
  const handle = (write, fn) => async (req, res) => {
    if (write && (!appOrigin || req.get('origin') !== appOrigin || !req.is('application/json'))) return res.status(403).json({ error: 'Origin atau format chat tidak valid.' });
    try { res.json(await fn(req, ctx(req))); }
    catch (error) { res.status([400, 404, 409].includes(error.status) ? error.status : 503).json({ error: [400, 404, 409].includes(error.status) ? error.message : 'Riwayat chat belum tersedia. Operator perlu memverifikasi migration 006.' }); }
  };
  app.get('/api/office/conversations', requireTenant, permitted, handle(false, (req, context) => {
    if (Object.keys(req.query).some((key) => !['agentId', 'offset'].includes(key)) || !validChatId(req.query.agentId) || !/^\d{1,5}$/.test(String(req.query.offset ?? 0))) throw teamError('Permintaan riwayat tidak valid.');
    return store.list(context, req.query.agentId, Number(req.query.offset || 0));
  }));
  app.post('/api/office/conversations', requireTenant, permitted, handle(true, (req, context) => {
    if (!req.body || Object.keys(req.body).some((key) => key !== 'agentId') || !validChatId(req.body.agentId)) throw teamError('Agen tidak valid.');
    return store.create(context, req.body.agentId);
  }));
  app.get('/api/office/conversations/:id', requireTenant, permitted, handle(false, (req, context) => {
    if (Object.keys(req.query).some((key) => key !== 'before') || (req.query.before !== undefined && !/^[1-9]\d{0,19}$/.test(req.query.before))) throw teamError('Halaman pesan tidak valid.');
    return store.read(context, req.params.id, req.query.before);
  }));
  app.patch('/api/office/conversations/:id', requireTenant, permitted, handle(true, (req, context) => {
    const body = req.body;
    if (!body || Object.keys(body).length !== 1 || !(body.archive === true || (typeof body.title === 'string' && body.title.trim() && body.title.trim().length <= 100))) throw teamError('Judul atau permintaan arsip tidak valid.');
    return store.update(context, req.params.id, body.archive === true ? { archive: true } : { title: body.title.trim() });
  }));
}
