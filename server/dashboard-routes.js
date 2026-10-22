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

export function installDashboardRoutes(app, { getPool, requireTenant }) {
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
}
