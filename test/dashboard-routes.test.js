import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDashboardOverview, loadWorkspaceClients, loadWorkspaceItems, loadWorkspaceJobs, loadWorkspaceMembers, loadWorkspaceWorkerLoads } from '../server/dashboard-routes.js';

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

test('workspace job list excludes unowned rows and internal failure detail', async () => {
  const calls = [];
  const connection = { execute: async (sql, values) => { calls.push({ sql, values }); return [[{ id: 7, job_type: 'campaign', agent_id: 'writer', status: 'failed', created_at: '2026-10-22', finished_at: null, error: 'internal detail', client_name: 'Acme' }]]; } };
  const jobs = await loadWorkspaceJobs(connection, 22);
  assert.deepEqual(jobs, [{ id: 7, jobType: 'campaign', agentId: 'writer', status: 'failed', createdAt: '2026-10-22', finishedAt: null, clientName: 'Acme', failed: true }]);
  assert.match(calls[0].sql, /j\.workspace_id = \?/);
  assert.deepEqual(calls[0].values, [22, 22]);
  assert.doesNotMatch(JSON.stringify(jobs), /internal detail/);
});

test('workspace client list only returns clients owned by the active workspace', async () => {
  const calls = [];
  const connection = { execute: async (sql, values) => { calls.push({ sql, values }); return [[{ id: 2, name: 'Acme' }]]; } };
  assert.deepEqual(await loadWorkspaceClients(connection, 22), [{ id: 2, name: 'Acme' }]);
  assert.match(calls[0].sql, /workspace_id = \?/);
  assert.deepEqual(calls[0].values, [22]);
});

test('workspace item picker excludes deleted and cross-workspace items', async () => {
  const calls = [];
  const connection = { execute: async (sql, values) => { calls.push({ sql, values }); return [[{ id: 4, type: 'brief', title: 'Launch brief', status: 'approved' }]]; } };
  assert.deepEqual(await loadWorkspaceItems(connection, 22), [{ id: 4, type: 'brief', title: 'Launch brief', status: 'approved' }]);
  assert.match(calls[0].sql, /workspace_id = \? AND deleted_at IS NULL/);
  assert.deepEqual(calls[0].values, [22]);
});

test('worker workload comes only from active workspace jobs', async () => {
  const calls = []; const connection = { execute: async (sql, values) => { calls.push({ sql, values }); return [[{ agent_id: 'raka', total_jobs: 4, active_jobs: 2 }]]; } };
  assert.deepEqual(await loadWorkspaceWorkerLoads(connection, 22), [{ agentId: 'raka', totalJobs: 4, activeJobs: 2 }]);
  assert.match(calls[0].sql, /workspace_id = \?/); assert.deepEqual(calls[0].values, [22]);
});

test('member list is resolved only from active workspace membership', async () => {
  const calls = []; const connection = { execute: async (sql, values) => { calls.push({ sql, values }); return [[{ id: 7, email: 'person@example.test', display_name: 'Person', role: 'viewer' }]]; } };
  assert.deepEqual(await loadWorkspaceMembers(connection, 22), [{ id: 7, email: 'person@example.test', displayName: 'Person', role: 'viewer' }]);
  assert.match(calls[0].sql, /wm\.workspace_id = \? AND wm\.revoked_at IS NULL/); assert.deepEqual(calls[0].values, [22]);
});
