import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { AGENTS, DIVISIONS } from '../shared/roster.js';
import { teamTemplates, agentInput, divisionInput, initialTeamInput, sceneRoster } from '../shared/workspace-team.js';
import { installTeamRoutes, initializeTeam, workspaceAgentPrompt, resolveWorkspaceAgent } from '../server/workspace-team.js';
import { createTenantGate } from '../server/auth/tenant-gate.js';
import { installOfficeChatRoutes } from '../server/office-chat.js';
import { inspectMigrationDirectory } from '../server/migrations/status.js';
import { TEAM_CONTRACT, validateTeamSchema } from '../server/migrations/team-contract.js';
import { Scene } from 'three';
import { buildOffice } from '../src/office.js';
import {managedDemoFirewall} from '../server/managed-demo.js';
import {MANAGED_DEMO_ISSUER} from '../server/managed-demo-policy.js';

const input = { name: 'Rina', role: 'Penulis properti', instructions: 'Tulis draft listing, jangan mengarang harga.', modelTier: 'team' };
async function fixture(t, { resolverAvailable = true, managedDemo = false } = {}) {
  const state = { role: 'admin', organization: 3, workspace: 8, revoked: false, fail: false, paid: true, maxDivisions: 8, maxMembers: 6, members: 1, otherDivisions: 0 };
  let divisions = [], agents = [], snapshot;
  const calls = [], provider = [];
  const connection = {
    release() {},
    async beginTransaction() { calls.push({ transaction: 'begin' }); snapshot = structuredClone({ divisions, agents }); },
    async commit() { calls.push({ transaction: 'commit' }); snapshot = null; },
    async rollback() { calls.push({ transaction: 'rollback' }); if (snapshot) ({ divisions, agents } = snapshot); snapshot = null; },
    async execute(sql, values = []) {
      if(sql.includes('FROM managed_demo_accounts'))return [managedDemo?[{user_id:9,organization_id:3,workspace_id:8,ai_enabled:0}]:[]];
      calls.push({ sql, values });
      if (sql.startsWith('SELECT id FROM organizations WHERE')) {
        if (state.fail) throw new Error('mysql://secret@private');
        return [[{ id: state.organization }]];
      }
      if (sql.includes('FROM billing_subscriptions WHERE')) return [state.paid ? [{ maxDivisions: state.maxDivisions, maxMembers: state.maxMembers, whatsapp: 1 }] : []];
      if (sql.startsWith('SELECT s.max_divisions')) return [state.paid ? [{ maxDivisions: state.maxDivisions, otherDivisions: state.otherDivisions }] : []];
      if (sql.startsWith('SELECT\n    (SELECT COUNT(*) FROM workspace_divisions')) return [[{ divisions: state.otherDivisions + divisions.filter(d => d.organization === values[0] && d.status === 'active').length, members: state.members }]];
      if (sql.startsWith('SELECT s.')) return [[{ id: 4, user_id: 9, active_workspace_id: state.workspace, user_status: 'active', provider_issuer:managedDemo?MANAGED_DEMO_ISSUER:undefined, revoked_at: state.revoked ? new Date() : null, idle_expires_at: new Date(Date.now() + 60000), absolute_expires_at: new Date(Date.now() + 60000) }]];
      if (sql.startsWith('UPDATE sessions')) return [{}];
      if (sql.includes('LEFT JOIN organization_memberships')) return [[{ organizationId: state.organization, role: state.role, organizationRole: null }]];
      if (sql.startsWith('SELECT id FROM workspaces')) return [[{ id: state.workspace }]];
      if (state.fail) throw new Error('mysql://secret@private');
      const scoped = (row, offset = 0) => row.organization === values[offset] && row.workspace === values[offset + 1];
      if (sql.startsWith('SELECT slot')) return [divisions.filter((d) => scoped(d) && d.status === 'active').map((d) => ({ slot: d.slot }))];
      if (sql.startsWith('SELECT id FROM workspace_divisions')) return [divisions.filter((d) => scoped(d) && d.id === values[2] && d.status === 'active')];
      if (sql.startsWith('SELECT COUNT')) return [[{ count: agents.filter((a) => scoped(a) && a.divisionId === values[2] && a.status === 'active').length }]];
      if (sql.startsWith('SELECT id, name')) return [divisions.filter((d) => scoped(d) && d.status === 'active')];
      const visibleAgents = () => agents.filter((a) => scoped(a) && a.status === 'active' && divisions.some((d) => d.id === a.divisionId && d.status === 'active'));
      if (sql.startsWith('SELECT a.id, a.division_id')) return [visibleAgents()];
      if (sql.startsWith('SELECT a.id, a.name')) return [visibleAgents().filter((a) => a.id === values[2]).map((a) => ({ ...a, divisionName: divisions.find((d) => d.id === a.divisionId).name }))];
      if (sql.startsWith('INSERT INTO workspace_divisions')) { const [id, organization, workspace, name, templateId, slot, creator] = values; divisions.push({ id, organization, workspace, name, templateId, slot, creator, status: 'active' }); return [{ affectedRows: 1 }]; }
      if (sql.startsWith('INSERT INTO workspace_agents')) { const [id, organization, workspace, divisionId, templateId, name, role, instructions, modelTier, creator] = values; agents.push({ id, organization, workspace, divisionId, templateId, name, role, instructions, modelTier, creator, status: 'active' }); return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE workspace_agents SET name')) {
        const [name, role, instructions, modelTier] = values;
        Object.assign(agents.find((a) => scoped(a, 4) && a.id === values[6]), { name, role, instructions, modelTier }); return [{}];
      }
      if (sql.startsWith('UPDATE workspace_')) {
        const rows = sql.startsWith('UPDATE workspace_divisions') ? divisions : agents;
        for (const row of rows.filter((a) => scoped(a) && (sql.includes('AND division_id =') ? a.divisionId : a.id) === values[2])) { row.status = 'archived'; if (rows === divisions) row.slot = null; }
        return [{}];
      }
      throw new Error('Unexpected fixture SQL');
    },
  };
  const getPool = () => ({ getConnection: async () => connection });
  const requireTenant = createTenantGate({ getPool, authEnabled: true, resourceQueriesScoped: true });
  const app = express(); app.use(express.json());
  if(managedDemo)app.use(managedDemoFirewall({getPool}));
  installTeamRoutes(app, { getPool, requireTenant, appOrigin: 'http://localhost:5173', models: { team: 'team-test', leader: 'leader-test' } });
  installOfficeChatRoutes(app, { requireTenant, appOrigin: 'http://localhost:5173', models: { team: 'team-test', leader: 'leader-test' },
    rateLimit: (_q, _s, next) => next(), dailyCap: (_q, _s, next) => next(), resolveAgent: resolverAvailable ? (tenant, id) => resolveWorkspaceAgent(connection, tenant, id) : undefined,
    client: { messages: { stream(value) { provider.push(value); return { on(_e, callback) { callback('Fixture reply'); }, async finalMessage() {}, abort() {} }; } } },
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const request = (path = '', method = 'GET', body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}${path.startsWith('/api/') ? path : `/api/team${path}`}`, {
    method, headers: { Cookie: `vo_session=${'a'.repeat(43)}`, Origin: 'http://localhost:5173', 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const create = async (body = { name: 'Konten' }) => { const res = await request('/divisions', 'POST', body); assert.equal(res.status, 200); return (await res.json()).id; };
  return { request, create, state, calls, connection, provider, rows: () => ({ divisions, agents }) };
}

test('team validation rejects identity/permission injection and arbitrary model names; templates stay unchanged', () => {
  assert.deepEqual(agentInput(input), input);
  for (const extra of [{ workspaceId: 99 }, { userId: 99 }, { tools: ['sql'] }, { modelTier: 'arbitrary-provider-model' }]) assert.throws(() => agentInput({ ...input, ...extra }), { status: 400 });
  assert.throws(() => divisionInput({ templateId: 'unknown' }), { status: 400 });
  assert.throws(() => initialTeamInput({ mode: 'empty', agents: ['roy'] }), { status: 400 });
  assert.throws(() => initialTeamInput({ mode: 'custom', division: '', agent: input }), { status: 400 });
  assert.equal(teamTemplates.length, DIVISIONS.length); assert.equal(teamTemplates.flatMap((d) => d.agents).length, AGENTS.length);
});

test('presentation demo can manage team with AI off but capacity, permissions and AI gate stay enforced',async t=>{
  const f=await fixture(t,{managedDemo:true});f.state.paid=false;
  const initial=await (await f.request()).json();assert.equal(initial.canManage,true);assert.equal(initial.managedDemo,true);assert.equal(initial.divisionCapacity,6);
  const id=await f.create();
  for(let i=0;i<4;i++)assert.equal((await f.request(`/divisions/${id}/agents`,'POST',input)).status,200);
  assert.equal((await f.request(`/divisions/${id}/agents`,'POST',input)).status,409);
  const agent=f.rows().agents[0].id;
  assert.equal((await f.request(`/agents/${agent}`,'PATCH',{...input,name:'Presentasi Baru'})).status,200);
  assert.equal((await f.request(`/agents/${agent}/archive`,'POST',{})).status,200);
  assert.equal((await f.request(`/divisions/${id}/agents`,'POST',input)).status,200);
  for(let i=0;i<5;i++)await f.create({name:`Divisi ${i}`});
  assert.equal((await f.request('/divisions','POST',{name:'Melebihi batas demo'})).status,402);
  assert.equal((await f.request(`/divisions/${id}/archive`,'POST',{})).status,200);
  assert(f.rows().agents.filter(a=>a.divisionId===id).every(a=>a.status==='archived'));
  await f.create({name:'Divisi pengganti'});
  assert.equal((await (await f.request()).json()).divisions.length,6);
  assert.equal((await f.request('/api/office/chat','POST',{agentId:agent,messages:[]})).status,402);assert.equal(f.provider.length,0);
  assert.equal((await f.request('/divisions','POST',{name:'Lintas origin'},{Origin:'https://evil.test'})).status,403);
  assert.equal((await f.request('/api/admin/managed-demo','POST',{})).status,403);
  f.state.role='viewer';assert.equal((await (await f.request()).json()).canManage,false);
  assert.equal((await f.request(`/divisions/${id}/agents`,'POST',input)).status,403);
  assert(!f.calls.some(c=>c.sql?.startsWith('DELETE')));
});

test('team API returns subscription capacity without accepting client capacity overrides', async (t) => {
  const f = await fixture(t);
  f.state.maxDivisions = 3;
  f.state.otherDivisions = 2;
  let response = await f.request('?divisionCapacity=8');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).divisionCapacity, 1);
  f.state.paid = false;
  response = await f.request();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).divisionCapacity, 0);
});

test('new workspace starts empty; custom and template creation use server scope and serialized transactions', async (t) => {
  const f = await fixture(t);
  assert.deepEqual((await (await f.request()).json()).agents, []);
  const id = await f.create();
  const created = await f.request(`/divisions/${id}/agents`, 'POST', input); assert.equal(created.status, 200);
  const result = await (await f.request()).json();
  assert.equal(result.agents[0].name, 'Rina'); assert.equal(result.agents[0].modelTier, 'team');
  assert.equal(f.rows().agents[0].creator, 9); assert.equal(f.rows().agents[0].organization, 3); assert.equal(f.rows().agents[0].workspace, 8);
  const template = await f.create({ templateId: 'proposal' });
  assert.equal(f.rows().agents.filter((a) => a.divisionId === template).length, 4);
  assert.equal(AGENTS[0].id, 'roy');
  assert.ok(f.calls.some((c) => c.sql?.includes('FROM workspaces') && c.sql.endsWith('FOR UPDATE')));
  assert.equal(f.calls.filter((c) => c.transaction === 'commit').length, 3);
});

test('member/viewer cannot manage; missing/revoked session and platform-only users cannot read', async (t) => {
  const f = await fixture(t);
  for (const role of ['member', 'viewer']) {
    f.state.role = role;
    assert.equal((await f.request()).status, 200);
    assert.equal((await f.request('/divisions', 'POST', { name: 'Forbidden' })).status, 403);
  }
  f.state.role = 'platform_admin'; assert.equal((await f.request()).status, 403);
  f.state.role = 'admin'; f.state.revoked = true; assert.equal((await f.request()).status, 401);
  f.state.revoked = false; assert.equal((await f.request('', 'GET', undefined, { Cookie: '' })).status, 401);
  assert.equal(f.calls.some((c) => c.sql?.startsWith('INSERT INTO workspace_')), false);
});

test('forged tenant, foreign origins, cross-workspace and cross-organization IDs cannot write', async (t) => {
  const f = await fixture(t), id = await f.create();
  assert.equal((await f.request('/divisions', 'POST', { name: 'Bad', organizationId: 99 })).status, 400);
  assert.equal((await f.request('/divisions', 'POST', { name: 'Bad' }, { Origin: 'https://evil.test' })).status, 403);
  for (const change of [{ workspace: 18 }, { workspace: 8, organization: 33 }]) {
    Object.assign(f.state, change);
    assert.equal((await f.request(`/divisions/${id}/agents`, 'POST', input)).status, 404);
    assert.deepEqual((await (await f.request()).json()).divisions, []);
  }
  assert.equal(f.rows().agents.length, 0);
});

test('edit/archive are scoped, never delete history, and archived slots can be reused', async (t) => {
  const f = await fixture(t), id = await f.create();
  const agentId = (await (await f.request(`/divisions/${id}/agents`, 'POST', input)).json()).id;
  assert.equal((await f.request(`/agents/${agentId}`, 'PATCH', { ...input, name: 'Rina Baru', modelTier: 'leader' })).status, 200);
  assert.equal(f.rows().agents[0].name, 'Rina Baru');
  assert.equal((await f.request(`/divisions/${id}/archive`, 'POST', {})).status, 200);
  assert.equal(f.rows().divisions[0].status, 'archived'); assert.equal(f.rows().agents[0].status, 'archived');
  assert.equal(f.rows().divisions[0].slot, null);
  assert.deepEqual((await (await f.request()).json()).agents, []);
  await f.create({ name: 'Baru' }); assert.equal(f.rows().divisions[1].slot, 0);
  assert.ok(!f.calls.some((c) => /^DELETE|DROP|ALTER/.test(c.sql || '')));
});

test('scene capacity stops excess agents/divisions; failures roll back and sanitize SQL errors', async (t) => {
  const f = await fixture(t), id = await f.create({ templateId: 'proposal' });
  assert.equal((await f.request(`/divisions/${id}/agents`, 'POST', input)).status, 409);
  for (let i = 1; i < 8; i++) await f.create({ name: `Divisi ${i}` });
  assert.equal((await f.request('/divisions', 'POST', { name: 'Overflow' })).status, 402);
  f.state.fail = true;
  const res = await f.request('/divisions', 'POST', { name: 'Fail' }); assert.equal(res.status, 503);
  assert.doesNotMatch(await res.text(), /secret|mysql|private/);
  assert.ok(f.calls.some((c) => c.transaction === 'rollback'));
});

test('initial team choices support empty/template/custom without automatically populating all agents', async (t) => {
  const f = await fixture(t), tenant = { organizationId: 3, workspaceId: 8 };
  await initializeTeam(f.connection, tenant, 9, { mode: 'empty' }); assert.equal(f.rows().divisions.length, 0);
  await initializeTeam(f.connection, tenant, 9, { mode: 'custom', division: 'Properti', agent: input });
  assert.equal(f.rows().divisions.length, 1); assert.equal(f.rows().agents.length, 1);
  await initializeTeam(f.connection, tenant, 9, { mode: 'template', templateId: 'social' });
  assert.equal(f.rows().divisions.length, 2); assert.equal(f.rows().agents.length, 5);
});

test('organization-wide plan limits include other workspaces; expired plans deny additions but allow archive', async (t) => {
  const f = await fixture(t), id = await f.create();
  f.state.maxDivisions = 1;
  assert.equal((await f.request('/divisions', 'POST', { name: 'Over plan' })).status, 402);
  f.state.maxDivisions = 3; f.state.otherDivisions = 2;
  assert.equal((await f.request('/divisions', 'POST', { name: 'Other workspace already uses capacity' })).status, 402);
  f.state.otherDivisions = 0; f.state.members = 7;
  assert.equal((await f.request(`/divisions/${id}/agents`, 'POST', input)).status, 402);
  f.state.members = 1; f.state.paid = false;
  assert.equal((await f.request(`/divisions/${id}/agents`, 'POST', input)).status, 402);
  assert.equal((await f.request(`/divisions/${id}/archive`, 'POST', {})).status, 200);
  assert.equal(f.rows().agents.length, 0);
});

test('custom chat uses server-resolved agent, instructions and model; foreign/archived/static agents never reach provider', async (t) => {
  const f = await fixture(t), id = await f.create();
  const agentId = (await (await f.request(`/divisions/${id}/agents`, 'POST', input)).json()).id;
  const context = await (await f.request('/api/office/chat/context')).json();
  const body = { scope: context.scope, agentId, messages: [{ role: 'user', content: 'Halo' }] };
  assert.equal((await f.request('/api/office/chat', 'POST', body)).status, 200);
  assert.equal(f.provider[0].model, 'team-test'); assert.match(f.provider[0].system, /Penulis properti/);
  assert.equal(f.provider[0].tools, undefined);
  assert.equal((await f.request('/api/office/chat', 'POST', { ...body, model: 'forged' })).status, 400);
  assert.equal((await f.request('/api/office/chat', 'POST', { ...body, agentId: 'roy' })).status, 404);
  await f.request(`/agents/${agentId}/archive`, 'POST', {});
  assert.equal((await f.request('/api/office/chat', 'POST', body)).status, 404);
  assert.equal(f.provider.length, 1);
});

test('missing workspace resolver fails closed rather than falling back to the old roster', async (t) => {
  const f = await fixture(t, { resolverAvailable: false });
  const context = await (await f.request('/api/office/chat/context')).json();
  const res = await f.request('/api/office/chat', 'POST', { scope: context.scope, agentId: 'roy', messages: [{ role: 'user', content: 'Halo' }] });
  assert.equal(res.status, 503); assert.equal(f.provider.length, 0);
});

test('scene roster contains only selected workspace rooms/agents; custom strings are data not markup', () => {
  const roster = sceneRoster({ divisions: [{ id: 'd', name: 'Properti', slot: 0 }], agents: [{ id: 'a', divisionId: 'd', name: '<img src=x>', role: 'Penulis', instructions: 'private' }] });
  assert.equal(roster.divisions.length, 1); assert.equal(roster.agents.length, 1);
  assert.equal(roster.agents[0].instructions, undefined);
  assert.equal(roster.agents[0].leader, false);
  assert.deepEqual(sceneRoster({ divisions: [], agents: [] }), { divisions: [], agents: [] });
  assert.throws(() => sceneRoster({ divisions: [], agents: [{ id: 'a', divisionId: 'other' }] }));
  assert.match(workspaceAgentPrompt({ ...input, divisionName: 'Konten' }), /bukan pemberian izin/);
});

test('existing Three.js geometry supports empty/custom/template teams without creating other employees', (t) => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) };
  t.after(() => { if (saved) Object.defineProperty(globalThis, 'document', saved); else delete globalThis.document; });
  const layouts = [
    { divisions: [], agents: [] },
    sceneRoster({ divisions: [{ id: 'd', name: 'Properti', slot: 0 }], agents: [{ id: 'a', divisionId: 'd', name: 'Rina', role: 'Penulis' }] }),
    sceneRoster({ divisions: [{ id: 'd', templateId: 'proposal', name: 'Proposal', slot: 0 }], agents: teamTemplates[0].agents.map((a) => ({ ...a, id: `copy-${a.id}`, templateId: a.id, divisionId: 'd' })) }),
  ];
  for (const roster of layouts) {
    const scene = new Scene(), office = buildOffice(scene, roster);
    assert.equal(office.rooms.size, 9);
    assert.equal(office.chars.length, roster.agents.length);
    assert.deepEqual([...office.byId.keys()], office.chars.map((c) => c.agent.id));
    office.update(0.016, 1);
    assert.ok(office.chars.every((c) => [c.home.x, c.home.z].every(Number.isFinite)));
    scene.traverse((object) => { object.geometry?.dispose(); for (const m of Array.isArray(object.material) ? object.material : [object.material]) { m?.map?.dispose(); m?.dispose(); } });
  }
});

test('migration 005 is registered/additive and contract verifies composite ownership and lifecycle', async () => {
  const report = await inspectMigrationDirectory(fileURLToPath(new URL('../migrations/', import.meta.url)));
  assert.equal(report.diagnostics.length, 0);
  const migration = report.migrations.find((m) => m.id === '005_workspace_team');
  assert.match(migration.checksum, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(migration.source, /^\s*(DROP|DELETE|ALTER|UPDATE|INSERT)\b/im);
  assert.match(migration.source, /FOREIGN KEY \(division_id, organization_id, workspace_id\)/);
  assert.ok((await validateTeamSchema({ execute: async () => [[]] })).some((d) => d.constraint === 'fk_workspace_agent_division'));
  const connection = { async execute(sql, [table]) {
    const spec = TEAM_CONTRACT[table];
    if (sql.includes('information_schema.columns')) return [spec.columns.map((name) => ({ name, type: name === 'status' ? "enum('active','archived')" : name === 'model_tier' ? "enum('leader','team')" : '', nullable: name === 'slot' ? 'YES' : 'NO' }))];
    if (sql.includes('statistics')) return [Object.entries(spec.indexes).flatMap(([name, cols]) => cols.map((columnName) => ({ name, columnName, nonUnique: name.startsWith('idx_') ? 1 : 0 })))];
    return [Object.entries(spec.keys).flatMap(([name, keys]) => keys.map(([columnName, targetTable, targetColumn]) => ({ name, columnName, targetTable, targetColumn })))];
  } };
  assert.deepEqual(await validateTeamSchema(connection), []);
  const index = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  assert.match(index, /resolveWorkspaceAgent\(connection, tenant, id\)/);
  assert.doesNotMatch(index, /applyMigrations|initializeTeam/);
});
