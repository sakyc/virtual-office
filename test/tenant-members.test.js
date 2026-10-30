import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import express from 'express';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { memberInput } from '../shared/tenant-members.js';
import { normalizeWhatsapp, validateAuthFields } from '../shared/auth-validation.js';
import { listTenantMembers, inviteTenantMember, updateTenantMember, acceptTenantInvitation, invitationHash, installTenantMemberRoutes } from '../server/tenant-members.js';
import { assertTenantAgentAccess, assertTenantItemReview } from '../server/member-access.js';
import { MEMBER_COLUMNS, MEMBER_INDEXES, MEMBER_KEYS, validateTenantMemberSchema } from '../server/migrations/tenant-member-contract.js';
import { inspectMigrationDirectory } from '../server/migrations/status.js';

const division = randomUUID(), agent = randomUUID(), tenant = { organizationId: 3, workspaceId: 8, userId: 9, role: 'member', memberPolicy: true };
const input = { role: 'member', email: ' Person@Example.Test ', divisionIds: [division], agentIds: [] };

test('managed demo owner can read members without invitations or management controls',async()=>{
  const calls=[];const c={async execute(sql){calls.push(sql);if(sql.startsWith('SELECT u.id'))return [[{id:9,email:'demo@example.test',role:'admin',organizationRole:'owner'}]];if(sql.includes('wm.membership_version'))return [[{role:'admin',organizationRole:'owner'}]];return [[]];}};
  const result=await listTenantMembers(c,{organizationId:3,workspaceId:8},{userId:9,managedDemo:{aiEnabled:false}});
  assert.equal(result.canManage,false);assert.equal(result.managedDemo,true);assert.deepEqual(result.invitations,[]);assert(!calls.some(sql=>sql.includes('FROM workspace_invitations')));
});

test('member input rejects forged scope, owner roles, invalid assignments and stale/missing versions', () => {
  assert.equal(memberInput(input, true).email, 'person@example.test');
  for (const patch of [{ role: 'owner' }, { organizationId: 7 }, { userId: 1 }, { email: 'invalid' }, { divisionIds: [division, division] }, { agentIds: ['static-agent'] }, { role: 'viewer' }]) assert.throws(() => memberInput({ ...input, ...patch }, true), { status: 400 });
  assert.throws(() => memberInput({ role: 'member', divisionIds: [], agentIds: [] }), { status: 400 });
});

test('WhatsApp signup normalization is shared, mandatory on signup only, and does not imply verification', () => {
  for (const phone of ['081234567890', '6281234567890', '+62 812-3456-7890']) assert.equal(normalizeWhatsapp(phone), '+6281234567890');
  assert.equal(normalizeWhatsapp('+1 (202) 555-0123'), '+12025550123');
  for (const phone of [null, '', '123', '+01234567890', '+62<script>', '+628123456789012345', '0812 ext 123']) assert.equal(normalizeWhatsapp(phone), null);
  const form = { displayName: 'Person', email: 'person@example.test', password: 'Lentera!9Kantor' };
  assert.ok(validateAuthFields(form, { register: true }).whatsappNumber);
  assert.deepEqual(validateAuthFields({ ...form, whatsappNumber: '081234567890' }, { register: true }), {});
  assert.deepEqual(validateAuthFields({ email: form.email, password: 'legacy' }), {});
});

test('invitation generation stores only a hash and scoped assignments, never creates user/membership', async () => {
  const calls = [];
  const c = { async execute(sql, values) {
    calls.push({ sql, values });
    if (sql.includes('wm.membership_version')) return [[{ role: 'admin', organizationRole: 'owner' }]];
    if (sql.includes('FROM organizations')) return [[{ id: 3 }]];
    if (sql.includes('FROM billing_subscriptions')) return [[{ maxDivisions: 8, maxMembers: 6 }]];
    if (sql.includes('COUNT(DISTINCT memberships.user_id)')) return [[{ members: 1, divisions: 1 }]];
    if (sql.includes('FROM workspace_divisions')) return [[{ id: division }]];
    if (sql.includes('FROM workspace_agents')) return [[{ id: agent, divisionId: division }]];
    if (sql.includes('COUNT(*) AS count')) return [[{ count: 0 }]];
    return [[]];
  } };
  const invite = await inviteTenantMember(c, tenant, { userId: 1 }, input);
  assert.match(invite.token, /^[\w-]{43}$/); assert.equal(invite.expiresInHours, 72);
  const insert = calls.find(call => call.sql.startsWith('INSERT INTO workspace_invitations'));
  assert.deepEqual(insert.values.slice(1, 3), [3, 8]);
  assert.deepEqual(insert.values[6], invitationHash(invite.token));
  assert.ok(!calls.some(call => call.values?.includes(invite.token)));
  assert.ok(!calls.some(call => /INSERT INTO (users|workspace_memberships)/.test(call.sql)));
  assert.match(calls.find(call => call.sql.includes('workspace_member_audit')).sql, /INSERT/);
});

test('role management protects owners/admins/self and rejects optimistic version conflicts before writes', async () => {
  for (const [actorRole, targetRole, userId, version, status] of [['owner','owner',2,1,403], ['admin','admin',2,1,403], ['owner','member',9,1,403], ['member','member',2,1,403], ['owner','member',2,8,409]]) {
    const c = { async execute(sql, values) {
      assert.ok(sql.startsWith('SELECT'), 'unauthorized changes must not write');
      return [[{ role: values[0] === 9 ? actorRole : targetRole, version: 1 }]];
    } };
    await assert.rejects(updateTenantMember(c, tenant, { userId: 9 }, userId, { role: 'member', divisionIds: [], agentIds: [], version }), { status });
  }
});

test('invitation acceptance denies unknown, expired, reused and mismatched email without granting membership', async () => {
  const token = 'a'.repeat(43);
  for (const change of [{ missing: true, status: 404 }, { live: 0, status: 410 }, { consumed_at: new Date(), status: 410 }, { revoked_at: new Date(), status: 410 }, { email: 'another@example.test', status: 403 }]) {
    const c = { async execute(sql) {
      assert.ok(sql.startsWith('SELECT'));
      if (sql.startsWith('SELECT organization_id')) return [change.missing ? [] : [{ organizationId: 3, workspaceId: 8 }]];
      if (sql.includes('SELECT *, expires_at')) return [[{ live: 1, email_normalized: 'person@example.test', ...change }]];
      if (sql.startsWith('SELECT email')) return [[{ email: change.email || 'person@example.test' }]];
      return [[{ id: 8 }]];
    } };
    await assert.rejects(acceptTenantInvitation(c, { userId: 9, sessionId: 1 }, token), { status: change.status });
  }
});

test('member agent/PIC enforcement rechecks persisted membership and denies viewers, unassigned and revoked users', async () => {
  for (const role of ['member', 'viewer', 'platform_admin', null]) {
    const c = { async execute(sql, values) {
      if (sql.includes('wm.membership_version')) return [role ? [{ role }] : []];
      assert.deepEqual(values.slice(0, 2), [3, 8]);
      return [[]];
    } };
    await assert.rejects(assertTenantAgentAccess(c, tenant, agent), { status: 403 });
  }
  for (const [role, assigned] of [['owner', false], ['admin', false], ['member', true]]) {
    const c = { async execute(sql) { return sql.includes('wm.membership_version') ? [[{ role }]] : [assigned ? [{ id: agent }] : []]; } };
    await assertTenantAgentAccess(c, tenant, agent);
  }
  for (const [role, pic, expected] of [['member', 9, true], ['member', 10, false], ['viewer', 9, false], ['admin', 10, true]]) {
    const c = { async execute(sql) { return sql.includes('wm.membership_version') ? [[{ role }]] : [[{ id: 4, reviewerUserId: pic, reviewerName: 'Reviewer' }]]; } };
    if (expected) await assertTenantItemReview(c, tenant, 4);
    else await assert.rejects(assertTenantItemReview(c, tenant, 4), { status: 403 });
  }
});

test('member HTTP rejects missing sessions, revoked sessions, cross-origin JSON and forged query scope without writes', async t => {
  const app = express(); app.use(express.json()); let acquisitions = 0;
  installTenantMemberRoutes(app, { appOrigin: 'http://localhost:5173', getPool: () => ({ getConnection: async () => {
    acquisitions++; return { release() {}, async beginTransaction() {}, async rollback() {}, async execute() { return [[]]; } };
  } }), requireTenant: (_req, res) => res.status(401).json({ error: 'Authentication required.' }) });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const root = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(root + '/api/workspace/members')).status, 401);
  assert.equal((await fetch(root + '/api/workspace/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.test' }, body: '{}' })).status, 403);
  assert.equal(acquisitions, 0);
  const response = await fetch(root + '/api/workspace/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify({ token: 'a'.repeat(43) }) });
  assert.equal(response.status, 401);
  assert.equal((await fetch(root + '/api/workspace/invitations/accept?workspaceId=3', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: '{}' })).status, 400);
});

test('016 is registered/checksummed and schema contract detects column, composite FK and unique-index omissions', async () => {
  const manifest = await inspectMigrationDirectory(fileURLToPath(new URL('../migrations', import.meta.url)));
  assert.deepEqual(manifest.diagnostics, []);
  const migration = manifest.migrations.find(m => m.id === '016_tenant_members');
  assert.match(migration.checksum, /^[a-f0-9]{64}$/); assert.doesNotMatch(migration.source, /^\s*(INSERT|UPDATE|DELETE|DROP)\b/im);
  let missing = false;
  const c = { async execute(sql, [table]) {
    if (missing) return [[]];
    if (sql.includes('information_schema.columns')) return [Object.entries(MEMBER_COLUMNS[table] || {}).map(([name,[type,nullable]]) => ({ name, type, nullable }))];
    if (sql.includes('statistics')) return [Object.entries(MEMBER_INDEXES[table] || {}).flatMap(([name,[nonUnique,cols]]) => cols.map(columnName => ({ name, nonUnique, columnName })))];
    return [Object.entries(MEMBER_KEYS[table] || {}).flatMap(([name,[targetTable,cols,targets]]) => cols.map((columnName,i) => ({ name, targetTable, columnName, targetColumn: targets[i] })))];
  } };
  assert.deepEqual(await validateTenantMemberSchema(c), []); missing = true;
  assert.ok((await validateTenantMemberSchema(c)).length > 40);
});

test('React member editor distinguishes human roles from assigned AI agents and shows only permitted admin role choices', async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { MemberEditor } = await vite.ssrLoadModule('/src/react/tenant-members.jsx');
    const props = { team: { divisions: [{ id: division, name: '<script>bad</script>' }], agents: [{ id: agent, name: 'Rani', divisionId: division }] }, onCancel() {}, onSave() {} };
    const owner = renderToStaticMarkup(React.createElement(MemberEditor, { ...props, actorRole: 'owner' }));
    for (const text of ['Email penerima', 'Buat tautan undangan', 'Seluruh agen dalam divisi', 'Agen tertentu saja', 'PIC', 'value="admin"']) assert.ok(owner.includes(text), text);
    assert.ok(!owner.includes('<script>')); assert.ok(owner.includes('&lt;script&gt;'));
    const admin = renderToStaticMarkup(React.createElement(MemberEditor, { ...props, actorRole: 'admin' }));
    assert.ok(!admin.includes('value="admin"'));
  } finally { await vite.close(); }
});
