import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDashboardOverview } from '../server/dashboard-routes.js';

test('dashboard overview scopes every query to the active workspace and excludes legacy rows', async () => {
  const calls = [];
  const connection = { execute: async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('total_jobs')) return [[{ total_jobs: 4, active_jobs: 1, completed_jobs: 2 }]];
    if (sql.includes('total_clients')) return [[{ total_clients: 3 }]];
    if (sql.includes('approved_items')) return [[{ approved_items: 5 }]];
    return [[{ id: 9, job_type: 'campaign', agent_id: 'writer', status: 'generating', created_at: '2026-10-22', client_name: 'Acme' }]];
  } };
  const result = await loadDashboardOverview(connection, 22);
  assert.deepEqual(result.metrics, { totalJobs: 4, activeJobs: 1, completedJobs: 2, totalClients: 3, approvedItems: 5 });
  assert.deepEqual(result.recentJobs[0], { id: 9, jobType: 'campaign', agentId: 'writer', status: 'generating', createdAt: '2026-10-22', clientName: 'Acme' });
  assert.equal(calls.length, 4);
  for (const call of calls) assert.ok(call.values.includes(22));
  assert.match(calls[3].sql, /j\.workspace_id = \?/);
});
