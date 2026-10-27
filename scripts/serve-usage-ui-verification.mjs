// UI fixture only: no database, credentials, authentication bypass in the real server, or AI provider.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { summarizeCosts } from '../server/ai-pricing.js';

const fx = { available: true, date: '2026-10-26', idrPerUsd: '18000' };
const fixtureCosts = { ...summarizeCosts([
  { model: 'fixture-model', status: 'completed', requests: '2', inputTokens: '240', outputTokens: '60', cacheReadTokens: '20', cacheCreationTokens: '0' },
  { model: 'fixture-model', status: 'unknown', requests: '1', inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheCreationTokens: null },
], fx, Date.parse('2026-10-27T06:00:00Z'), { 'fixture-model': ['1', '5', '0.1'] }), fx, pricingLabel: 'UI FIXTURE · tarif dan kurs contoh, bukan data nyata' };

const app = express();
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const profile = { user: { id: 9001, email: 'fixture@example.test', displayName: 'UI Fixture' }, activeWorkspace: { id: 9002, name: 'FIXTURE · bukan data nyata', role: 'owner', organization: { id: 9003, name: 'Local QA' } }, workspaces: [] };
profile.workspaces = [profile.activeWorkspace];
app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
const sessionDelay = process.argv.includes('--slow-session') ? 900 : 0;
app.get('/auth/me', (_req, res) => { setTimeout(() => { if (!res.destroyed) res.json(profile); }, sessionDelay); });
app.get('/api/dashboard/overview', (_req, res) => res.json({ metrics: { totalJobs: 0, activeJobs: 0, completedJobs: 0, totalClients: 0, approvedItems: 0 }, recentJobs: [] }));
app.get('/api/dashboard/usage', (req, res) => res.json({ scope: 'workspace', range: req.query.range || '30d', costAvailable: false,
  costs: fixtureCosts,
  quota: { configured: false, enforced: false, unit: 'USD', windows: [
    { id: 'fiveHour', status: 'unconfigured', limit: null, used: null, resetsAt: null, observed: { tokens: 180, requests: 2, unresolved: 1 } },
    { id: 'weekly', status: 'unconfigured', limit: null, used: null, resetsAt: null, observed: { tokens: 330, requests: 3, unresolved: 1 } },
  ] },
  models: [{ model: 'fixture-model', requests: 3, inputTokens: 240, outputTokens: 60, cacheReadTokens: 20, cacheCreationTokens: 10 }],
  totals: { requests: 3, completed: 2, unresolved: 1, inputTokens: 240, outputTokens: 60, cacheReadTokens: 20, cacheCreationTokens: 10 },
  recent: [{ id: 'fixture-1', agentId: 'bagas', operation: 'job', model: 'fixture-model', status: 'completed', inputTokens: 120, outputTokens: 30, startedAt: '2026-10-23T08:00:00Z' }, { id: 'fixture-2', agentId: 'roy', operation: 'chat', model: 'fixture-model', status: 'unknown', inputTokens: null, outputTokens: null, startedAt: '2026-10-23T08:01:00Z' }] }));
app.use(express.static(dist));
app.get('/{*path}', (_req, res) => res.sendFile(`${dist}/index.html`));
const server = app.listen(5221, '127.0.0.1', () => console.log('UI fixture only: http://127.0.0.1:5221/dashboard; no DB/provider. Send stop on stdin to close.'));
process.stdin.on('data', (data) => { if (String(data).trim() === 'stop') { server.close(); server.closeAllConnections(); process.stdin.pause(); } });
