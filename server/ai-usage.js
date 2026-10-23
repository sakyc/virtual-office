import { randomUUID } from 'node:crypto';

const unavailable = () => Object.assign(new Error('Pencatatan pemakaian AI belum tersedia.'), { code: 'AI_USAGE_UNAVAILABLE' });
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;

export function createUsageStore(getPool) {
  return {
    async start(scope, model) {
      const id = randomUUID();
      try {
        const pool = getPool();
        await pool.execute(`INSERT INTO ai_usage
          (id, organization_id, workspace_id, user_id, operation, resource_id, agent_id, provider, model)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, scope.organizationId, scope.workspaceId, scope.userId, scope.operation, scope.resourceId ?? null, scope.agentId, 'anthropic', model]);
        return id;
      } catch { throw unavailable(); }
    },
    async finish(id, message) {
      const usage = message?.usage;
      const input = count(usage?.input_tokens), output = count(usage?.output_tokens);
      const complete = input !== null && output !== null;
      try {
        await getPool().execute(`UPDATE ai_usage SET status = ?, provider_message_id = ?,
          input_tokens = ?, output_tokens = ?, cache_read_tokens = ?, cache_creation_tokens = ?, finished_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'started'`,
        [complete ? 'completed' : 'unknown', typeof message?.id === 'string' ? message.id.slice(0, 191) : null,
          input, output, usage ? count(usage.cache_read_input_tokens ?? 0) : null,
          usage ? count(usage.cache_creation_input_tokens ?? 0) : null, id]);
      } catch { throw unavailable(); }
    },
  };
}

// Decorate each tenant operation, not the global SDK: identity never comes from prompt/body fields.
// Persist before sending; disable hidden SDK retries so one row represents one transport attempt.
export function trackedClient(client, store, scope) {
  if (!store || !client) return client;
  if (!['organizationId', 'workspaceId', 'userId'].every((key) => Number.isSafeInteger(scope[key]) && scope[key] > 0)
      || !['chat', 'job', 'revision'].includes(scope.operation) || !scope.agentId) throw unavailable();
  return { messages: {
    async create(input) {
      const id = await store.start(scope, input.model);
      let message;
      try { message = await client.messages.create(input, { maxRetries: 0 }); }
      catch (error) { await store.finish(id, null); throw error; }
      await store.finish(id, message);
      return message;
    },
    async stream(input) {
      const id = await store.start(scope, input.model);
      let stream;
      try { stream = client.messages.stream(input, { maxRetries: 0 }); }
      catch (error) { await store.finish(id, null); throw error; }
      let final;
      return {
        on: (...args) => stream.on(...args),
        abort: () => stream.abort(),
        finalMessage() {
          // Calling finalMessage twice must not double-finalize or reissue the provider request.
          final ??= (async () => {
            let message;
            try { message = await stream.finalMessage(); }
            catch (error) { await store.finish(id, null); throw error; }
            await store.finish(id, message);
            return message;
          })();
          return final;
        },
      };
    },
  } };
}

export async function loadUsage(connection, tenant, principal, range = '30d') {
  const periods = { today: 'UTC_DATE()', '7d': 'CURRENT_TIMESTAMP - INTERVAL 7 DAY', '14d': 'CURRENT_TIMESTAMP - INTERVAL 14 DAY', '30d': 'CURRENT_TIMESTAMP - INTERVAL 30 DAY' };
  if (!Object.hasOwn(periods, range)) throw Object.assign(new Error('Periode pemakaian tidak valid.'), { status: 400 });
  const team = ['owner', 'admin'].includes(tenant.role);
  const params = [tenant.organizationId, tenant.workspaceId, ...(team ? [] : [principal.userId])];
  const scopeWhere = `organization_id = ? AND workspace_id = ?${team ? '' : ' AND user_id = ?'}`;
  const where = `${scopeWhere} AND started_at >= ${periods[range]}`;
  const [totals] = await connection.execute(`SELECT COUNT(*) AS requests,
    SUM(status = 'completed') AS completed, SUM(status <> 'completed') AS unresolved,
    COALESCE(SUM(input_tokens), 0) AS inputTokens, COALESCE(SUM(output_tokens), 0) AS outputTokens,
    COALESCE(SUM(cache_read_tokens), 0) AS cacheReadTokens, COALESCE(SUM(cache_creation_tokens), 0) AS cacheCreationTokens
    FROM ai_usage WHERE ${where}`, params);
  const [recent] = await connection.execute(`SELECT id, operation, agent_id AS agentId, model, status,
    input_tokens AS inputTokens, output_tokens AS outputTokens, started_at AS startedAt
    FROM ai_usage WHERE ${where} ORDER BY started_at DESC, id DESC LIMIT 50`, params);
  const [models] = await connection.execute(`SELECT model, COUNT(*) AS requests,
    COALESCE(SUM(input_tokens), 0) AS inputTokens, COALESCE(SUM(output_tokens), 0) AS outputTokens,
    COALESCE(SUM(cache_read_tokens), 0) AS cacheReadTokens, COALESCE(SUM(cache_creation_tokens), 0) AS cacheCreationTokens
    FROM ai_usage WHERE ${where} GROUP BY model ORDER BY requests DESC, model`, params);
  const windows = [];
  for (const [id, interval] of [['fiveHour', '5 HOUR'], ['weekly', '7 DAY']]) {
    const [rows] = await connection.execute(`SELECT COUNT(*) AS requests, SUM(status <> 'completed') AS unresolved,
      COALESCE(SUM(input_tokens), 0) + COALESCE(SUM(output_tokens), 0) + COALESCE(SUM(cache_read_tokens), 0) + COALESCE(SUM(cache_creation_tokens), 0) AS tokens
      FROM ai_usage WHERE ${scopeWhere} AND started_at >= CURRENT_TIMESTAMP - INTERVAL ${interval}`, params);
    windows.push({ id, status: 'unconfigured', limit: null, used: null, resetsAt: null, observed: rows[0] });
  }
  return { scope: team ? 'workspace' : 'self', range, periodDays: range === 'today' ? 1 : Number(range.slice(0, -1)), totals: totals[0], recent, models, costAvailable: false,
    quota: { configured: false, enforced: false, unit: 'USD', windows } };
}

export function installUsageRoutes(app, { getPool, requireTenant }) {
  app.get('/api/dashboard/usage', requireTenant, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let connection;
    try {
      if (Object.keys(req.query).some((key) => key !== 'range') || (req.query.range !== undefined && !['today', '7d', '14d', '30d'].includes(req.query.range))) return res.status(400).json({ error: 'Filter pemakaian tidak valid.' });
      connection = await getPool()?.getConnection();
      if (!connection) throw unavailable();
      res.json(await loadUsage(connection, req.tenantContext, req.authPrincipal, req.query.range || '30d'));
    } catch { res.status(503).json({ error: 'Pencatatan pemakaian belum tersedia. Periksa migrasi 004 dengan operator.' }); }
    finally { connection?.release(); }
  });
}
