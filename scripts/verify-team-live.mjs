// Real SQL/HTTP integration tests, callable only for an explicitly isolated local test schema.
// Fixtures and mock provider only: no external login or billable AI call.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { issueSession } from '../server/auth/sessions.js';
import { createTenantGate } from '../server/auth/tenant-gate.js';
import { installTeamRoutes } from '../server/workspace-team.js';
import { installOfficeChatRoutes } from '../server/office-chat.js';
import { resolveWorkspaceAgent } from '../server/workspace-team.js';
import { createUsageStore } from '../server/ai-usage.js';

export async function verifyTeamLive(connection, pool) {
  const [[identity]] = await connection.execute('SELECT DATABASE() AS name');
  assert.match(identity.name, /^vo_team_fresh_\d+$/, 'ISOLATED_TEAM_TEST_REQUIRED');
  const passed = [];
  const check = (name) => { passed.push(name); console.log(JSON.stringify({ integration: name, passed: true })); };
  const [user] = await connection.execute('INSERT INTO users (provider_issuer, external_subject, email, display_name) VALUES (?, ?, ?, ?)', ['https://fixture.invalid', randomUUID(), 'fixture@example.test', 'Isolated team fixture']);
  const userId = user.insertId;
  const [org] = await connection.execute('INSERT INTO organizations (slug, name, created_by_user_id) VALUES (?, ?, ?)', ['team-fixture', 'Isolated QA', userId]);
  const [otherOrg] = await connection.execute('INSERT INTO organizations (slug, name, created_by_user_id) VALUES (?, ?, ?)', ['team-other', 'Isolated other', userId]);
  async function workspace(organizationId, slug, role = 'admin') {
    const [row] = await connection.execute('INSERT INTO workspaces (organization_id, slug, name, created_by_user_id) VALUES (?, ?, ?, ?)', [organizationId, slug, 'Isolated workspace', userId]);
    await connection.execute('INSERT INTO workspace_memberships (workspace_id, user_id, role, created_by_user_id) VALUES (?, ?, ?, ?)', [row.insertId, userId, role, userId]);
    return { organizationId, workspaceId: row.insertId };
  }
  const a = await workspace(org.insertId, 'a'), b = await workspace(org.insertId, 'b'), other = await workspace(otherOrg.insertId, 'other');
  const session = await issueSession(connection, { userId, activeWorkspaceId: a.workspaceId });
  const requireTenant = createTenantGate({ getPool: () => pool, authEnabled: true, resourceQueriesScoped: true });
  const app = express(); app.use(express.json());
  const models = { team: 'fixture-team', leader: 'fixture-leader' }, origin = 'http://localhost:5173';
  installTeamRoutes(app, { getPool: () => pool, requireTenant, appOrigin: origin, models });
  let providerCalls = 0;
  installOfficeChatRoutes(app, { requireTenant, appOrigin: origin, models, usageStore: createUsageStore(() => pool),
    rateLimit: (_q, _s, next) => next(), dailyCap: (_q, _s, next) => next(),
    resolveAgent: async (tenant, id) => { const c = await pool.getConnection(); try { return await resolveWorkspaceAgent(c, tenant, id); } finally { c.release(); } },
    client: { messages: { stream(input) { assert.equal(input.model, 'fixture-leader'); providerCalls++;
      return { on(_event, callback) { callback('Fixture only'); }, abort() {}, async finalMessage() { return { id: 'fixture-message', usage: { input_tokens: 11, output_tokens: 7 } }; } };
    } } },
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const request = (path, method = 'GET', body, extraHeaders = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { Cookie: `vo_session=${session.token}`, Origin: origin, 'Content-Type': 'application/json', ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const switchWorkspace = (tenant) => connection.execute('UPDATE sessions SET active_workspace_id = ? WHERE id = ?', [tenant.workspaceId, session.id]);
  try {
    const empty = await (await request('/api/team')).json(); assert.equal(empty.divisions.length, 0); assert.equal(empty.agents.length, 0); check('empty-workspace-no-auto-enrollment');
    assert.equal((await request('/api/team', 'GET', undefined, { Cookie: '' })).status, 401); check('real-session-required');
    assert.equal((await request('/api/team/divisions', 'POST', { name: 'Spoof', workspaceId: b.workspaceId })).status, 400);
    assert.equal((await request('/api/team/divisions', 'POST', { name: 'Spoof' }, { Origin: 'https://evil.invalid' })).status, 403); check('forged-scope-and-csrf-denied');
    const templateResponse = await request('/api/team/divisions', 'POST', { templateId: 'proposal' }); assert.equal(templateResponse.status, 200);
    const templateId = (await templateResponse.json()).id;
    let team = await (await request('/api/team')).json(); assert.equal(team.agents.length, 4); check('template-copy-four-agents');
    const customResponse = await request('/api/team/divisions', 'POST', { name: 'Custom QA' }); assert.equal(customResponse.status, 200);
    const customId = (await customResponse.json()).id;
    const input = { name: 'Fixture employee', role: 'Writer', instructions: 'Fixture task; no real provider.', modelTier: 'team' };
    const agentResponse = await request(`/api/team/divisions/${customId}/agents`, 'POST', input); assert.equal(agentResponse.status, 200);
    const agentId = (await agentResponse.json()).id;
    assert.equal((await request(`/api/team/agents/${agentId}`, 'PATCH', { ...input, modelTier: 'leader' })).status, 200); check('custom-agent-create-edit');
    for (const tenant of [b, other]) {
      await switchWorkspace(tenant);
      assert.equal((await request(`/api/team/divisions/${customId}/agents`, 'POST', input)).status, 404);
      assert.equal((await request(`/api/team/agents/${agentId}`, 'PATCH', input)).status, 404);
      const scoped = await (await request('/api/team')).json(); assert.equal(scoped.agents.length, 0);
    }
    check('cross-workspace-and-cross-organization-denied'); await switchWorkspace(a);
    await assert.rejects(connection.execute('INSERT INTO workspace_divisions (id, organization_id, workspace_id, name, slot, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), a.organizationId, a.workspaceId, 'Duplicate slot', 0, userId]), { code: 'ER_DUP_ENTRY' });
    await assert.rejects(connection.execute('INSERT INTO workspace_agents (id, organization_id, workspace_id, division_id, name, role, instructions, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), other.organizationId, other.workspaceId, customId, 'Wrong scope', 'Writer', 'Fixture', userId]), { code: 'ER_NO_REFERENCED_ROW_2' });
    check('sql-unique-slot-and-composite-tenant-fk');
    const concurrent = await Promise.all(Array.from({ length: 5 }, () => request(`/api/team/divisions/${customId}/agents`, 'POST', input)));
    assert.equal(concurrent.filter((r) => r.status === 200).length, 3); assert.equal(concurrent.filter((r) => r.status === 409).length, 2);
    check('concurrent-agent-limit-enforced-by-workspace-lock');
    await connection.execute("UPDATE workspace_memberships SET role = 'viewer' WHERE workspace_id = ? AND user_id = ?", [a.workspaceId, userId]);
    assert.equal((await request('/api/team')).status, 200); assert.equal((await request('/api/team/divisions', 'POST', { name: 'Denied' })).status, 403);
    assert.equal((await request('/api/office/chat/context')).status, 403); check('viewer-cannot-manage-or-chat');
    await connection.execute("UPDATE workspace_memberships SET role = 'admin' WHERE workspace_id = ? AND user_id = ?", [a.workspaceId, userId]);
    const context = await (await request('/api/office/chat/context')).json();
    const chat = { scope: context.scope, agentId, messages: [{ role: 'user', content: 'Fixture request' }] };
    const chatResponse = await request('/api/office/chat', 'POST', chat); assert.equal(chatResponse.status, 200); assert.match(await chatResponse.text(), /"done":true/);
    const [[usage]] = await connection.execute('SELECT status, input_tokens AS inputTokens, output_tokens AS outputTokens, model FROM ai_usage WHERE agent_id = ?', [agentId]);
    assert.equal(usage.status, 'completed'); assert.equal(usage.inputTokens, 11); assert.equal(usage.outputTokens, 7); assert.equal(usage.model, 'fixture-leader'); check('mock-chat-selected-model-real-sql-usage-ledger');
    assert.equal((await request(`/api/team/divisions/${customId}/archive`, 'POST', {})).status, 200);
    assert.equal((await request('/api/office/chat', 'POST', chat)).status, 404);
    const [[archived]] = await connection.execute('SELECT status, slot FROM workspace_divisions WHERE id = ?', [customId]);
    assert.equal(archived.status, 'archived'); assert.equal(archived.slot, null);
    const newDivision = await request('/api/team/divisions', 'POST', { name: 'Reused room' }); assert.equal(newDivision.status, 200);
    const newId = (await newDivision.json()).id;
    const [[newSlot]] = await connection.execute('SELECT slot FROM workspace_divisions WHERE id = ?', [newId]); assert.equal(newSlot.slot, 1);
    const [[oldUsage]] = await connection.execute('SELECT COUNT(*) AS count FROM ai_usage WHERE agent_id = ?', [agentId]); assert.equal(oldUsage.count, 1); check('archive-retains-history-releases-slot-and-denies-chat');
    await connection.execute('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?', [session.id]);
    assert.equal((await request('/api/team')).status, 401); check('revoked-session-denied');
    assert.equal(providerCalls, 1);
    assert.equal((await connection.execute('SELECT COUNT(*) AS count FROM workspace_agents WHERE division_id = ?', [templateId]))[0][0].count, 4);
    return { passed, providerCalls: 0, mockProviderCalls: providerCalls, fixturesOnly: true };
  } finally { await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); }
}
