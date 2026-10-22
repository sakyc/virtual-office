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
    `SELECT j.id, j.job_type, j.agent_id, j.status, j.created_at, j.finished_at, j.error, c.name AS client_name
       FROM jobs j LEFT JOIN clients c ON c.id = j.client_id AND c.workspace_id = ?
      WHERE j.workspace_id = ? ORDER BY j.id DESC LIMIT ${safeLimit}`,
    [workspaceId, workspaceId],
  );
  return rows.map((job) => ({
    id: job.id, jobType: job.job_type, agentId: job.agent_id, status: job.status,
    createdAt: job.created_at, finishedAt: job.finished_at, clientName: job.client_name || null,
    // Do not return internal error details to the dashboard.
    failed: job.status === 'failed',
  }));
}

export async function loadWorkspaceClients(connection, workspaceId) {
  const [rows] = await connection.execute(
    'SELECT id, name FROM clients WHERE workspace_id = ? ORDER BY name, id',
    [workspaceId],
  );
  return rows.map((client) => ({ id: client.id, name: client.name }));
}

export async function loadWorkspaceItems(connection, workspaceId) {
  const [rows] = await connection.execute(
    `SELECT id, type, title, status FROM items
      WHERE workspace_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC, id DESC LIMIT 100`,
    [workspaceId],
  );
  return rows.map((item) => ({ id: item.id, type: item.type, title: item.title, status: item.status }));
}

export function installDashboardRoutes(app, { getPool, requireTenant, runTenantJob }) {
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
      res.json({ items: await loadWorkspaceItems(connection, req.tenantContext.workspaceId) });
    } catch {
      res.status(503).json({ error: 'Dashboard service unavailable.' });
    } finally { connection?.release(); }
  });
  app.post('/api/dashboard/jobs', requireTenant, async (req, res) => {
    let connection;
    try {
      connection = await getPool()?.getConnection();
      if (!connection) return res.status(503).json({ error: 'Dashboard service unavailable.' });
      const { createTenantJob } = await import('./tenant-jobs.js');
      const created = await createTenantJob(connection, { tenantContext: req.tenantContext, principal: req.authPrincipal, body: req.body });
      res.status(202).json(created);
      if (runTenantJob) void runTenantJob(created.jobId, req.tenantContext, req.authPrincipal.userId);
    } catch (error) {
      res.status(error?.status || 503).json({ error: error?.status ? error.message : 'Job service unavailable.' });
    } finally { connection?.release(); }
  });
}
