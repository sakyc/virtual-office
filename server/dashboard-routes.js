import { readTaskFailure } from '../shared/task-failures.js';
function asCount(value) { return Number(value || 0); }

// Every query carries the server-derived workspace ID. Legacy rows with NULL ownership never match.
export async function loadDashboardOverview(connection, workspaceId) {
  const [[jobCounts], [clientCounts], [itemCounts], [recentJobs]] = await Promise.all([
    connection.execute(`SELECT COUNT(*) AS total_jobs, SUM(status = 'generating') AS active_jobs, SUM(status = 'done') AS completed_jobs
                        FROM jobs WHERE workspace_id = ?`, [workspaceId]),
    connection.execute('SELECT COUNT(*) AS total_clients FROM clients WHERE workspace_id = ?', [workspaceId]),
    connection.execute(`SELECT COUNT(*) AS approved_items FROM items WHERE workspace_id = ? AND deleted_at IS NULL AND status = 'approved'`, [workspaceId]),
    connection.execute(`SELECT j.id, j.job_type, j.agent_id, j.status, j.created_at, c.name AS client_name
                        FROM jobs j LEFT JOIN clients c ON c.id = j.client_id AND c.workspace_id = ?
                        WHERE j.workspace_id = ? ORDER BY j.id DESC LIMIT 5`, [workspaceId, workspaceId]),
  ]);
  return {
    metrics: {
      totalJobs: asCount(jobCounts[0]?.total_jobs), activeJobs: asCount(jobCounts[0]?.active_jobs), completedJobs: asCount(jobCounts[0]?.completed_jobs),
      totalClients: asCount(clientCounts[0]?.total_clients), approvedItems: asCount(itemCounts[0]?.approved_items),
    },
    recentJobs: recentJobs.map((job) => ({ id: job.id, jobType: job.job_type, agentId: job.agent_id, status: job.status, createdAt: job.created_at, clientName: job.client_name || null })),
  };
}

export async function loadWorkspaceJobs(connection, workspaceId, { limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const [rows] = await connection.execute(
    `SELECT j.id, j.job_type, j.agent_id, j.status, j.created_at, j.finished_at, j.error, c.name AS client_name,
       JSON_UNQUOTE(JSON_EXTRACT(j.params, '$.task.title')) AS task_title,
       JSON_UNQUOTE(JSON_EXTRACT(j.params, '$.task.agent.name')) AS agent_name,
       JSON_UNQUOTE(JSON_EXTRACT(j.params, '$.task.model')) AS selected_model
       FROM jobs j LEFT JOIN clients c ON c.id = j.client_id AND c.workspace_id = ?
      WHERE j.workspace_id = ? ORDER BY j.id DESC LIMIT ${safeLimit}`,
    [workspaceId, workspaceId],
  );
  return rows.map((job) => ({
    id: job.id, jobType: job.job_type, agentId: job.agent_id, status: job.status,
    createdAt: job.created_at, finishedAt: job.finished_at, clientName: job.client_name || null,
    // Do not return internal error details to the dashboard.
    failed: job.status === 'failed',
    ...(job.status === 'failed' ? { failure: readTaskFailure(job.error) } : {}),
    ...(job.task_title ? { title: job.task_title, agentName: job.agent_name, model: job.selected_model } : {}),
  }));
}

export async function loadWorkspaceClients(connection, workspaceId) {
  const [rows] = await connection.execute(
    'SELECT id, name, brief FROM clients WHERE workspace_id = ? ORDER BY name, id',
    [workspaceId],
  );
  return rows.map((client) => ({ id: client.id, name: client.name, ...(client.brief ? { brief: client.brief } : {}) }));
}

export async function loadWorkspaceItems(connection, workspaceId, tenantContext) {
  const [rows] = await connection.execute(
    `SELECT id, type, title, status, agent_id, version, updated_at,
       (SELECT a.name FROM workspace_agents a WHERE a.id = items.agent_id AND a.organization_id = items.organization_id AND a.workspace_id = items.workspace_id) AS agent_name FROM items
      WHERE workspace_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC, id DESC LIMIT 100`,
    [workspaceId],
  );
  const routing = tenantContext?.memberPolicy ? await (await import('./member-access.js')).reviewRoutingForItems(connection, tenantContext, rows.map(row => row.id)) : null;
  return rows.map((item) => ({ id: item.id, type: item.type, title: item.title, status: item.status, agentId: item.agent_id, version: item.version, updatedAt: item.updated_at, ...(item.agent_name ? { agentName: item.agent_name } : {}), ...(routing ? routing.get(item.id) || { canReview: false, reviewer: null } : {}) }));
}

export async function loadWorkspaceWorkerLoads(connection, workspaceId) {
  const [rows] = await connection.execute(
    `SELECT agent_id, COUNT(*) AS total_jobs, SUM(status = 'generating') AS active_jobs
       FROM jobs WHERE workspace_id = ? GROUP BY agent_id`, [workspaceId],
  );
  return rows.map((row) => ({ agentId: row.agent_id, totalJobs: asCount(row.total_jobs), activeJobs: asCount(row.active_jobs) }));
}

export async function loadWorkspaceMembers(connection, workspaceId) {
  const [rows] = await connection.execute(
    `SELECT u.id, u.email, u.display_name, wm.role
       FROM workspace_memberships wm
       JOIN users u ON u.id = wm.user_id AND u.status = 'active'
      WHERE wm.workspace_id = ? AND wm.revoked_at IS NULL
      ORDER BY wm.role = 'admin' DESC, u.display_name, u.email`,
    [workspaceId],
  );
  return rows.map((member) => ({ id: member.id, email: member.email, displayName: member.display_name, role: member.role }));
}

export function installDashboardRoutes(app, { getPool, requireTenant, runTenantJob, runTenantRevision, modelCatalog, appOrigin }) {
  app.use('/api/dashboard', (req, res, next) => {
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    requireTenant(req, res, () => {
      if (req.tenantContext.memberPolicy && (!appOrigin || req.headers.origin !== appOrigin || !req.is('application/json'))) return res.status(403).json({ error: 'Permintaan harus berasal dari aplikasi ini dengan format JSON.' });
      next();
    });
  });
  app.get('/api/dashboard/task-options', requireTenant, async (req, res) => {
    let c;
    try {
      c = await getPool().getConnection();
      const { loadTeam } = await import('./workspace-team.js');
      const { loadTaskTemplates } = await import('./task-templates.js');
      const { builtinTaskTemplates } = await import('../shared/task-templates.js');
      await modelCatalog?.refresh();
      const team = await loadTeam(c, req.tenantContext);
      if (req.tenantContext.memberPolicy && req.tenantContext.role === 'member') {
        const { assertTenantAgentAccess } = await import('./member-access.js');
        const allowed = [];
        for (const agent of team.agents) {
          try { await assertTenantAgentAccess(c, req.tenantContext, agent.id); allowed.push(agent); }
          catch (error) { if (error.status !== 403) throw error; }
        }
        team.agents = allowed;
      }
      res.json({ agents: team.agents, divisions: team.divisions, templates: await loadTaskTemplates(c, req.tenantContext), builtins: builtinTaskTemplates,
        clients: await loadWorkspaceClients(c, req.tenantContext.workspaceId), models: modelCatalog?.list().filter(m => m.selectable) || [], canCreate: ['owner', 'admin'].includes(req.tenantContext.role) || (req.tenantContext.memberPolicy && req.tenantContext.role === 'member') });
    } catch { res.status(503).json({ error: 'Pilihan tugas belum tersedia. Periksa sesi, migration dan katalog model.' }); }
    finally { c?.release(); }
  });
  app.get('/api/dashboard/overview', requireTenant, async (req, res) => {
    let connection;
    try {
      connection = await getPool()?.getConnection();
      if (!connection) return res.status(503).json({ error: 'Dashboard service unavailable.' });
      res.json(await loadDashboardOverview(connection, req.tenantContext.workspaceId));
    } catch {
      res.status(503).json({ error: 'Dashboard service unavailable.' });
    } finally { connection?.release(); }
  });
  app.get('/api/dashboard/jobs', requireTenant, async (req, res) => {
    let connection;
    try {
      connection = await getPool()?.getConnection();
      if (!connection) return res.status(503).json({ error: 'Dashboard service unavailable.' });
      res.json({ jobs: await loadWorkspaceJobs(connection, req.tenantContext.workspaceId) });
    } catch {
      res.status(503).json({ error: 'Dashboard service unavailable.' });
    } finally { connection?.release(); }
  });
  app.get('/api/dashboard/clients', requireTenant, async (req, res) => {
    let connection;
    try {
      connection = await getPool()?.getConnection();
      if (!connection) return res.status(503).json({ error: 'Dashboard service unavailable.' });
      res.json({ clients: await loadWorkspaceClients(connection, req.tenantContext.workspaceId) });
    } catch {
      res.status(503).json({ error: 'Dashboard service unavailable.' });
    } finally { connection?.release(); }
  });
  app.post('/api/dashboard/clients', requireTenant, async (req, res) => {
    let connection;
    try {
      connection = await getPool()?.getConnection();
      if (!connection) return res.status(503).json({ error: 'Dashboard service unavailable.' });
      const { createTenantClient } = await import('./tenant-clients.js');
      res.status(201).json(await createTenantClient(connection, { tenantContext: req.tenantContext, principal: req.authPrincipal, body: req.body }));
    } catch (error) {
      res.status(error?.status || 503).json({ error: error?.status ? error.message : 'Client service unavailable.' });
    } finally { connection?.release(); }
  });
  app.get('/api/dashboard/items', requireTenant, async (req, res) => {
    let connection;
    try {
      connection = await getPool()?.getConnection();
      if (!connection) return res.status(503).json({ error: 'Dashboard service unavailable.' });
      res.json({ items: await loadWorkspaceItems(connection, req.tenantContext.workspaceId, req.tenantContext) });
    } catch {
      res.status(503).json({ error: 'Dashboard service unavailable.' });
    } finally { connection?.release(); }
  });
  app.get('/api/dashboard/items/:id/revisions', requireTenant, async (req, res) => {
    let connection;
    try {
      connection = await getPool()?.getConnection();
      if (!connection) return res.status(503).json({ error: 'Item service unavailable.' });
      const { loadTenantItemRevisions } = await import('./tenant-items.js');
      res.json({ revisions: await loadTenantItemRevisions(connection, { tenantContext: req.tenantContext, itemId: Number(req.params.id) }) });
    } catch {
      res.status(503).json({ error: 'Item service unavailable.' });
    } finally { connection?.release(); }
  });
  app.get('/api/dashboard/items/:id', requireTenant, async (req, res) => {
    let connection;
    try {
      connection = await getPool()?.getConnection();
      if (!connection) return res.status(503).json({ error: 'Item service unavailable.' });
      const { loadTenantItemDetail } = await import('./tenant-items.js');
      res.json({ item: await loadTenantItemDetail(connection, { tenantContext: req.tenantContext, itemId: Number(req.params.id) }) });
    } catch (error) {
      res.status(error?.status || 503).json({ error: error?.status ? error.message : 'Item service unavailable.' });
    } finally { connection?.release(); }
  });
  app.get('/api/dashboard/workers', requireTenant, async (req, res) => {
    let connection;
    try { connection = await getPool()?.getConnection(); if (!connection) return res.status(503).json({ error: 'Dashboard service unavailable.' }); res.json({ workers: await loadWorkspaceWorkerLoads(connection, req.tenantContext.workspaceId) }); } catch { res.status(503).json({ error: 'Dashboard service unavailable.' }); } finally { connection?.release(); }
  });
  app.get('/api/dashboard/members', requireTenant, async (req, res) => {
    let connection;
    try { connection = await getPool()?.getConnection(); if (!connection) return res.status(503).json({ error: 'Dashboard service unavailable.' }); res.json({ members: await loadWorkspaceMembers(connection, req.tenantContext.workspaceId), role: req.tenantContext.role }); } catch { res.status(503).json({ error: 'Dashboard service unavailable.' }); } finally { connection?.release(); }
  });
  app.post('/api/dashboard/items/:id/approve', requireTenant, async (req, res) => {
    let connection;
    try { connection = await getPool()?.getConnection(); if (!connection) return res.status(503).json({ error: 'Item service unavailable.' }); const { approveTenantItem } = await import('./tenant-items.js'); await approveTenantItem(connection, { tenantContext: req.tenantContext, principal: req.authPrincipal, itemId: Number(req.params.id) }); res.status(204).end(); } catch (error) { res.status(error?.status || 503).json({ error: error?.status ? error.message : 'Item service unavailable.' }); } finally { connection?.release(); }
  });
  app.post('/api/dashboard/items/:id/reject', requireTenant, async (req, res) => {
    let connection;
    try {
      connection = await getPool()?.getConnection();
      if (!connection) return res.status(503).json({ error: 'Item service unavailable.' });
      const { rejectTenantItem } = await import('./tenant-review.js');
      await rejectTenantItem(connection, { tenantContext: req.tenantContext, principal: req.authPrincipal, itemId: Number(req.params.id), body: req.body });
      res.status(204).end();
    } catch (error) {
      res.status(error?.status || 503).json({ error: error?.status ? error.message : 'Item service unavailable.' });
    } finally { connection?.release(); }
  });
  app.post('/api/dashboard/items/:id/revise', requireTenant, async (req, res) => {
    let connection;
    try {
      if (!runTenantRevision) return res.status(503).json({ error: 'Item revision service unavailable.' });
      connection = await getPool()?.getConnection();
      if (!connection) return res.status(503).json({ error: 'Item service unavailable.' });
      const { reserveTenantRevision, recoverTenantRevision } = await import('./tenant-review.js');
      const reservation = await reserveTenantRevision(connection, { tenantContext: req.tenantContext, principal: req.authPrincipal, itemId: Number(req.params.id), body: req.body });
      res.status(202).json({ itemId: reservation.itemId, status: 'revising' });
      void Promise.resolve().then(() => runTenantRevision(reservation)).catch(async () => {
        let recovery;
        try { recovery = await getPool()?.getConnection(); if (recovery) await recoverTenantRevision(recovery, reservation); }
        catch { /* Operator recovery is required if the database is unavailable. No automatic replay. */ }
        finally { recovery?.release(); }
      });
    } catch (error) {
      res.status(error?.status || 503).json({ error: error?.status ? error.message : 'Item revision service unavailable.' });
    } finally { connection?.release(); }
  });
  app.delete('/api/dashboard/items/:id', requireTenant, async (req, res) => {
    let connection;
    try { connection = await getPool()?.getConnection(); if (!connection) return res.status(503).json({ error: 'Item service unavailable.' }); const { deleteTenantItem } = await import('./tenant-items.js'); await deleteTenantItem(connection, { tenantContext: req.tenantContext, principal: req.authPrincipal, itemId: Number(req.params.id) }); res.status(204).end(); } catch (error) { res.status(error?.status || 503).json({ error: error?.status ? error.message : 'Item service unavailable.' }); } finally { connection?.release(); }
  });
  app.post('/api/dashboard/jobs', requireTenant, async (req, res) => {
    let connection;
    try {
      // Historical jobs stay readable, but new customer work must select a real workspace agent.
      // The old static roster must not bypass division/agent entitlements via direct HTTP calls.
      if (!['owner', 'admin'].includes(req.tenantContext.role) && !(req.tenantContext.memberPolicy && req.tenantContext.role === 'member')) return res.status(403).json({ error: 'Workspace task permission required.' });
      if (req.body?.mode !== 'workspace') return res.status(400).json({ error: 'Pilih agen workspace melalui formulir Buat tugas.', code: 'WORKSPACE_AGENT_REQUIRED' });
      connection = await getPool()?.getConnection();
      if (!connection) return res.status(503).json({ error: 'Dashboard service unavailable.' });
      const { createTenantJob } = await import('./tenant-jobs.js');
      const created = await createTenantJob(connection, { tenantContext: req.tenantContext, principal: req.authPrincipal, body: req.body, modelCatalog });
      res.status(202).json(created);
      if (runTenantJob && !created.duplicate) void Promise.resolve().then(() => runTenantJob(created.jobId, req.tenantContext, req.authPrincipal.userId, req.authPrincipal.sessionId)).catch(() => {});
    } catch (error) {
      res.status(error?.status || 503).json({ error: error?.status ? error.message : 'Job service unavailable.' });
    } finally { connection?.release(); }
  });
}
