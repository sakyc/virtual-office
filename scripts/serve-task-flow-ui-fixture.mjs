// Local browser QA ONLY. Separate port, memory fixtures, no real DB/session/provider/payment.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { publicBillingPlans } from '../shared/billing-plans.js';
import { builtinTaskTemplates } from '../shared/task-templates.js';
const app = express(); app.use(express.json());
const agentId = '10000000-0000-4000-8000-000000000001';
const profile = { user: { id: 9001, email: 'qa@example.test', displayName: 'QA Fixture' }, activeWorkspace: { id: 9002, name: 'UI TEST · bukan data nyata', role: 'owner', organization: { id: 9003, name: 'QA only' } } }; profile.workspaces = [profile.activeWorkspace];
const plans = publicBillingPlans.map(p => ({ ...p, version: 1, isPublic: true }));
const agents = [{ id: agentId, name: 'Nara QA', role: 'Penulis konten', modelTier: 'team', divisionId: 'qa-division', instructions: 'Draft only.' }];
const divisions = [{ id: 'qa-division', name: 'Konten', slot: 1 }];
const templates = [{ id: '20000000-0000-4000-8000-000000000001', name: 'Carousel edukasi', description: 'Template demonstrasi QA', instructions: 'Write draft', outputFormat: 'Carousel', fields: [{ name: 'topik', label: 'Topik', type: 'text', required: true }], version: 1 }];
const models = [{ id: 'qa-economy', label: 'Model Hemat · QA', costLabel: 'Hemat', description: 'Model fixture untuk pemeriksaan UI, bukan panggilan AI nyata.', selectable: true }];
const jobs = [], items = [];
const clients = [{ id: 1, name: 'Klien QA', brief: 'Data contoh khusus pengujian UI.' }];
app.get('/api/dashboard/clients', (_req, res) => res.json({ clients }));
app.post('/api/dashboard/clients', (req, res) => { const id = clients.length + 1; clients.push({ id, ...req.body }); res.status(201).json({ id }); });
app.get('/api/dashboard/members', (_req, res) => res.json({ members: [{ id: profile.user.id, displayName: profile.user.displayName, email: profile.user.email, role: 'owner' }] }));
// Member UI fixtures only: never used by the real server or persisted anywhere.
const members = [
  { ...profile.user, role: 'owner', version: 1, divisionIds: [], agentIds: [] },
  { id: 9004, email: 'member@example.test', displayName: 'Dina QA', role: 'member', version: 1, divisionIds: [divisions[0].id], agentIds: [] },
  { id: 9005, email: 'viewer@example.test', displayName: 'Raka QA', role: 'viewer', version: 1, divisionIds: [], agentIds: [] },
];
const invitations = [], reviewers = [];
app.get('/api/workspace/members', (_req, res) => res.json({ canManage: true, actorRole: 'owner', members, agents, divisions, invitations, reviewers }));
app.post('/api/workspace/members/invitations', (req, res) => {
  const id = 'ui-test-' + invitations.length;
  invitations.push({ id, email: req.body.email, role: req.body.role, expiresAt: new Date(Date.now() + 72 * 3600000).toISOString() });
  res.json({ id, inviteUrl: 'http://127.0.0.1:5224/join#token=UI-FIXTURE-NOT-A-REAL-INVITATION' });
});
app.post('/api/workspace/members/invitations/:id/revoke', (req, res) => { const index = invitations.findIndex(i => i.id === req.params.id); if (index >= 0) invitations.splice(index, 1); res.json({ saved: true }); });
app.patch('/api/workspace/members/:id', (req, res) => { const member = members.find(m => m.id === Number(req.params.id)); Object.assign(member, req.body, { version: member.version + 1 }); res.json({ saved: true }); });
app.put('/api/workspace/members/reviewers/:id', (req, res) => { const index = reviewers.findIndex(r => r.divisionId === req.params.id); if (index >= 0) reviewers.splice(index, 1); if (req.body.userId) reviewers.push({ divisionId: req.params.id, userId: req.body.userId }); res.json({ saved: true }); });
app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.get('/auth/me', (_req, res) => res.json(profile));
app.get('/api/platform/me', (_req, res) => res.json({ platformAdmin: true }));
app.get('/api/admin/billing/plans', (_req, res) => res.json({ plans, audit: [] }));
app.get('/api/plans', (_req, res) => res.json({ currency: 'IDR', plans }));
app.get('/api/billing', (_req, res) => res.status(403).json({ error: 'UI fixture: no real wallet' }));
app.get('/api/team', (_req, res) => res.json({ agents, divisions, templates: [], canManage: true, models: [] }));
app.get('/api/task-templates', (_req, res) => res.json({ templates, builtins: builtinTaskTemplates, canManage: true, executionReady: true }));
app.get('/api/dashboard/task-options', (_req, res) => res.json({ agents, divisions, templates, builtins: builtinTaskTemplates, models, clients: [{ id: 1, name: 'Klien QA' }], canCreate: true }));
app.get('/api/dashboard/jobs', (_req, res) => res.json({ jobs }));
app.post('/api/dashboard/jobs', (req, res) => {
  const id = jobs.length + 1;
  jobs.unshift({ id, jobType: 'workspace_task', title: req.body.title, agentId, agentName: agents[0].name, model: req.body.modelId, status: 'done', createdAt: new Date().toISOString() });
  items.unshift({ id, type: 'report', title: req.body.title, agentId, agentName: agents[0].name, model: req.body.modelId, status: 'draft', version: 1, updatedAt: new Date().toISOString(), content: { fields: [{ label: 'Draft QA · bukan hasil AI', kind: 'text', value: 'Tampilan alur tugas berhasil diuji. Konten ini hanya fixture UI.' }] } });
  res.status(202).json({ jobId: id });
});
app.get('/api/dashboard/items', (_req, res) => res.json({ items }));
app.get('/api/dashboard/items/:id', (req, res) => res.json({ item: items.find(i => i.id === Number(req.params.id)) }));
app.get('/api/dashboard/items/:id/revisions', (_req, res) => res.json({ revisions: [] }));
app.post('/api/dashboard/items/:id/approve', (req, res) => { items.find(i => i.id === Number(req.params.id)).status = 'approved'; res.status(204).end(); });
app.get('/api/dashboard/overview', (_req, res) => res.json({ metrics: { totalJobs: jobs.length, activeJobs: 0, completedJobs: jobs.length, totalClients: 1, approvedItems: 0 }, recentJobs: jobs }));
app.get('/api/dashboard/workers', (_req, res) => res.json({ workers: [] }));
app.use('/api', (_req, res) => res.status(503).json({ error: 'UI fixture: endpoint intentionally unavailable' }));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
app.use(express.static(dist)); app.get('/{*path}', (_req, res) => res.sendFile(dist + '/index.html'));
const server = app.listen(5224, '127.0.0.1', () => console.log('UI fixture only: http://127.0.0.1:5224/dashboard/jobs ; no DB/provider/payment. Send stop to close.'));
process.stdin.on('data', value => { if (String(value).trim() === 'stop') { server.close(); server.closeAllConnections(); process.stdin.pause(); } });
