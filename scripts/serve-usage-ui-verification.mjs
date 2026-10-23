// UI fixture only: no database, credentials, authentication bypass in the real server, or AI provider.
import express from 'express';
import { fileURLToPath } from 'node:url';

const app = express();
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const profile = { user: { id: 9001, email: 'fixture@example.test', displayName: 'UI Fixture' }, activeWorkspace: { id: 9002, name: 'FIXTURE · bukan data nyata', role: 'owner', organization: { id: 9003, name: 'Local QA' } }, workspaces: [] };
profile.workspaces = [profile.activeWorkspace];
app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.get('/auth/me', (_req, res) => res.json(profile));
app.get('/api/dashboard/overview', (_req, res) => res.json({ metrics: { totalJobs: 0, activeJobs: 0, completedJobs: 0, totalClients: 0, approvedItems: 0 }, recentJobs: [] }));
app.get('/api/dashboard/usage', (_req, res) => res.json({ scope: 'workspace', periodDays: 30, costAvailable: false,
  totals: { requests: 3, completed: 2, unresolved: 1, inputTokens: 240, outputTokens: 60, cacheReadTokens: 20, cacheCreationTokens: 10 },
  recent: [{ id: 'fixture-1', agentId: 'bagas', operation: 'job', model: 'fixture-model', status: 'completed', inputTokens: 120, outputTokens: 30 }, { id: 'fixture-2', agentId: 'roy', operation: 'chat', model: 'fixture-model', status: 'unknown', inputTokens: null, outputTokens: null }] }));
app.use(express.static(dist));
app.get('/{*path}', (_req, res) => res.sendFile(`${dist}/index.html`));
const server = app.listen(5221, '127.0.0.1', () => console.log('UI fixture only: http://127.0.0.1:5221/app; no DB/provider. Send stop on stdin to close.'));
process.stdin.on('data', (data) => { if (String(data).trim() === 'stop') { server.close(); server.closeAllConnections(); process.stdin.pause(); } });
