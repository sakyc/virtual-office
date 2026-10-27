import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { installPlatformAdminRoutes, adminPage, adminId, validateUserAction, readAdminUsers, readAdminOrganizations, readAdminMembers, readAdminSubscriptions } from '../server/platform-admin.js';
import { hashSessionToken } from '../server/auth/sessions.js';
import { inspectMigrationDirectory } from '../server/migrations/status.js';
import { BILLING_CONTRACT, ADMIN_CATALOG_CONTRACT, PLATFORM_AUDIT_CONTRACT, validateBillingSchema } from '../server/migrations/billing-contract.js';
import { adminManagementRequest } from '../src/react/admin-management-data.js';

const token = (id) => `platform-test-${id}-` + 'a'.repeat(40);
const action = (overrides = {}) => ({ action: 'suspend', expectedStatus: 'active', reason: 'Peninjauan keamanan akun', ...overrides });
function fixture(env = { AUTH_PROVIDER: 'native', APP_ORIGIN: 'http://localhost:5173' }) {
  let state = { users: [{ id: 1, status: 'active' }, { id: 2, status: 'active' }, { id: 3, status: 'active' }, { id: 4, status: 'deleted' }],
    audit: [], sessions: [1,2,3,4].map((id) => ({ id, user_id: id, token_hash: hashSessionToken(token(id)), idle_expires_at: new Date(Date.now()+3600000), absolute_expires_at: new Date(Date.now()+3600000), revoked_at: null })) };
  const grants = new Set([1,3]); let failAudit = false, queue = Promise.resolve(); const calls = [];
  const pool = { async getConnection() {
    let snapshot, unlock;
    return {
      async beginTransaction() { const previous = queue; queue = new Promise((r) => { unlock = r; }); await previous; snapshot = structuredClone(state); },
      async commit() { snapshot = null; }, async rollback() { if (snapshot) state = snapshot; }, release() { unlock?.(); },
      async execute(sql, values = []) {
        calls.push({ sql, values });
        if (sql.includes('FROM sessions s JOIN users')) {
          const s = state.sessions.find((s) => Buffer.from(s.token_hash).equals(values[0]));
          return [[s ? { ...s, user_status: state.users.find((u) => u.id === s.user_id).status } : null].filter(Boolean)];
        }
        if (sql.startsWith('UPDATE sessions SET last_seen')) return [{ affectedRows: 1 }];
        if (sql.includes('FROM platform_admins WHERE')) return [grants.has(values[0]) ? [{ user_id: values[0] }] : []];
        if (sql.startsWith('SELECT id, status FROM users')) return [structuredClone(state.users.filter((u) => u.id === values[0]))];
        if (sql.startsWith('UPDATE users SET status')) { const u = state.users.find((u) => u.id === values[1]); u.status = values[0]; return [{ affectedRows: 1 }]; }
        if (sql.startsWith('UPDATE sessions SET revoked_at')) { let count = 0; for (const s of state.sessions) if (s.user_id === values[1] && !s.revoked_at) { s.revoked_at = new Date(); count++; } return [{ affectedRows: count }]; }
        if (sql.includes('INSERT INTO platform_admin_audit')) { if (failAudit) throw Object.assign(Error('private database details'), { code: 'ER_NO_SUCH_TABLE' }); state.audit.push({ id: values[0], actorUserId: values[1], targetUserId: values[2], action: values[3], reason: values[4], beforeSnapshot: values[5], afterSnapshot: values[6] }); return [{}]; }
        if (sql.includes('FROM platform_admin_audit')) return [structuredClone(state.audit)];
        if (sql.startsWith('SELECT u.id, u.email')) return [[{ id: 2, email: 'member@example.test', status: 'active', activeSessions: 1 }]];
        if (sql.startsWith('SELECT o.id, o.name, o.slug')) return [[{ id: 10, name: 'Org A', status: 'active', activeWorkspaces: 1, owners: 1, workspaceMembers: 1 }]];
        if (sql.startsWith('SELECT id, name, status FROM organizations')) return [values[0] === 10 ? [{ id: 10, name: 'Org A', status: 'active' }] : []];
        if (sql.startsWith('SELECT * FROM (')) return [[{ userId: 2, scope: 'workspace', workspaceId: 20, role: 'viewer', email: 'member@example.test' }]];
        if (sql.startsWith('SELECT o.id, o.name AS organizationName')) return [[{ id: 10, organizationName: 'Org A', subscriptionId: null, effectiveStatus: 'none' }]];
        throw Error('Unexpected SQL: ' + sql);
      },
    };
  } };
  const app = express(); app.use(express.json()); installPlatformAdminRoutes(app, { getPool: () => pool, env });
  return { app, state: () => state, calls, grants, failAudit: () => { failAudit = true; } };
}
async function serve(t, f) {
  const server = f.app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  t.after(() => new Promise((r) => { server.close(r); server.closeAllConnections(); }));
  return (path, id = 1, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { ...options, headers: { ...(id ? { Cookie: `vo_session=${token(id)}` } : {}), ...options.headers } });
}
const post = (body, origin = 'http://localhost:5173') => ({ method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('all management endpoints require real sessions and persisted platform grants; forged roles, shared codes, tenant IDs and revoked sessions do not grant access', async (t) => {
  const f = fixture(), request = await serve(t,f);
  for (const path of ['/api/admin/users','/api/admin/organizations','/api/admin/organizations/10/members','/api/admin/subscriptions','/api/admin/activity']) {
    assert.equal((await request(path, null)).status, 401);
    assert.equal((await request(path, 2, { headers: { 'x-user-id': '1', 'x-role': 'platform_admin', 'x-access-code': 'secret' } })).status, 403);
    assert.equal((await request(path, 1)).status, 200);
  }
  f.grants.delete(1); assert.equal((await request('/api/admin/users')).status, 403);
  f.grants.add(1); f.state().sessions[0].revoked_at = new Date(); assert.equal((await request('/api/admin/users')).status, 401);
  assert.equal((await request('/api/admin/users/2/actions', 2, post(action()))).status, 403);
  assert.equal(f.state().audit.length, 0);
});

test('suspend atomically revokes sessions, records server actor/reason, denies login, and reactivation does not revive old sessions', async (t) => {
  const f = fixture(), request = await serve(t,f);
  const r = await request('/api/admin/users/2/actions', 1, post(action()));
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { userId: 2, status: 'suspended', revokedSessions: 1 });
  assert.equal(f.state().users[1].status, 'suspended');
  assert.equal(f.state().audit[0].actorUserId, 1); assert.equal(f.state().audit[0].targetUserId, 2);
  assert.equal(JSON.parse(f.state().audit[0].beforeSnapshot).status, 'active');
  assert.deepEqual(JSON.parse(f.state().audit[0].afterSnapshot), { status: 'suspended', revokedSessions: 1 });
  assert.equal((await request('/api/admin/users',2)).status,401);
  assert.equal((await request('/api/admin/users/2/actions', 1, post(action({ action: 'activate', expectedStatus: 'suspended' })))).status,200);
  assert.equal(f.state().users[1].status,'active'); assert.ok(f.state().sessions[1].revoked_at);
  assert.equal(f.state().audit.length,2);
  assert.ok(!f.calls.some(({sql}) => /DELETE|UPDATE organization|UPDATE workspace|FROM (items|jobs|clients|revisions|chat_messages)/.test(sql)));
});

test('session revocation preserves account status and audit; stale/concurrent changes cannot silently overwrite', async (t) => {
  const f = fixture(), request = await serve(t,f);
  assert.equal((await request('/api/admin/users/2/actions',1,post(action({ action:'revoke_sessions' })))).status,200);
  assert.equal(f.state().users[1].status,'active'); assert.ok(f.state().sessions[1].revoked_at);
  const results = await Promise.all([1,2].map(() => request('/api/admin/users/2/actions',1,post(action()))));
  assert.deepEqual(results.map((r)=>r.status).sort(),[200,409]);
  assert.equal(f.state().audit.length,2);
});

test('self/admin/deleted account protections, nonexistent targets, CSRF, type and forged body validation fail without audit writes', async (t) => {
  const f = fixture(), request = await serve(t,f);
  for (const id of [1,3]) assert.equal((await request(`/api/admin/users/${id}/actions`,1,post(action()))).status,403);
  assert.equal((await request('/api/admin/users/4/actions',1,post(action()))).status,409);
  assert.equal((await request('/api/admin/users/999/actions',1,post(action()))).status,404);
  for (const input of [action({ role:'admin' }), action({ userId:1 }), action({ action:'delete' }), action({ expectedStatus:'deleted' }),action({reason:'a'})]) assert.equal((await request('/api/admin/users/2/actions',1,post(input))).status,400);
  for (const origin of ['', 'https://evil.invalid']) assert.equal((await request('/api/admin/users/2/actions',1,post(action(),origin))).status,403);
  assert.equal((await request('/api/admin/users/2/actions',1,{method:'POST',headers:{Origin:'http://localhost:5173','Content-Type':'text/plain'},body:'{}'})).status,403);
  for (const path of ['/api/admin/users?userId=1','/api/admin/users?organizationId=10','/api/admin/users?limit=999','/api/admin/users?limit=0','/api/admin/users?q=a&q=b','/api/admin/organizations/10/members?after=2']) assert.equal((await request(path)).status,400);
  assert.equal((await request('/api/admin/organizations/11/members')).status,404);
  assert.equal(f.state().audit.length,0);
});

test('missing audit schema fails closed and rolls back account/session changes; disabled auth blocks reads and writes', async (t) => {
  const f = fixture(), request = await serve(t,f), before = structuredClone(f.state()); f.failAudit();
  const r = await request('/api/admin/users/2/actions',1,post(action()));
  assert.equal(r.status,503); assert.deepEqual(await r.json(),{code:'ADMIN_SCHEMA_REQUIRED'}); assert.deepEqual(f.state(),before);
  const disabled = await serve(t,fixture({AUTH_PROVIDER:'auth0',AUTH0_ENABLED:'0'}));
  assert.equal((await disabled('/api/admin/users')).status,503);
  assert.equal((await disabled('/api/admin/users/2/actions',1,post(action()))).status,503);
});

test('bounded parameterized directory queries project only account metadata and scope membership rows by real workspace relationships', async () => {
  const calls=[]; const c={execute:async(sql,values)=>{ calls.push({sql,values}); return sql.startsWith('SELECT id, name, status') ? [[{id:10}]] : [[{id:1},{id:2},{id:3}]]; }};
  const page={q:"x' OR 1=1 --",after:0,limit:2,offset:0};
  assert.deepEqual(await readAdminUsers(c,page),{rows:[{id:1},{id:2}],nextAfter:2});
  await readAdminOrganizations(c,page); const members=await readAdminMembers(c,10,page); assert.equal(members.nextOffset,2);
  await readAdminSubscriptions(c,page);
  assert.ok(calls.every(({sql})=> !sql.includes(page.q)));
  const membership=calls.find(({sql})=>sql.startsWith('SELECT * FROM ('));
  assert.deepEqual(membership.values,[10,10,page.q,page.q]); assert.match(membership.sql,/w.organization_id=\?/); assert.match(membership.sql,/UNION ALL/);
  const userSql=calls[0].sql; assert.doesNotMatch(userSql,/password|token_hash|provider_issuer|external_subject|ip_hash|user_agent_hash|u\.\*/);
  const subSql=calls.at(-1).sql; assert.match(subSql,/s\.monthly_price_idr/);assert.doesNotMatch(subSql,/billing_plans|approval_reference/);
  for(const value of ['0','01','-1','1 OR 1=1','9007199254740992']) assert.throws(()=>adminId(value));
  assert.deepEqual(adminPage({}),{q:'',after:0,limit:25,offset:0}); assert.throws(()=>adminPage({limit:['1']}));
  assert.equal(validateUserAction(action()).action,'suspend');
});

test('010 is expand-only, registered and checksum inspected; complete contract detects missing audit relationships and does not mutate earlier contracts',async()=>{
  const result=await inspectMigrationDirectory(fileURLToPath(new URL('../migrations',import.meta.url)));
  assert.deepEqual(result.diagnostics,[]);const migration=result.migrations.find((m)=>m.id==='010_platform_admin_audit');assert.match(migration.checksum,/^[a-f0-9]{64}$/);
  assert.doesNotMatch(migration.source,/^\s*(DROP|DELETE|INSERT|UPDATE|ALTER|TRUNCATE)\b/im);
  const spec={...BILLING_CONTRACT,...ADMIN_CATALOG_CONTRACT,...PLATFORM_AUDIT_CONTRACT,billing_plans:{...BILLING_CONTRACT.billing_plans,columns:[...BILLING_CONTRACT.billing_plans.columns,'is_public'],checks:[...BILLING_CONTRACT.billing_plans.checks,'ck_billing_plan_public']}};
  let missing=false;
  const c={execute:async(sql,[table])=>{const s=spec[table]; if(missing&&table==='platform_admin_audit')return [[]];
    if(sql.includes('information_schema.columns'))return [s.columns.map(name=>({name,nullable:(s.nullable||[]).includes(name)?'YES':'NO',type:s.enums?.[name]||(name.endsWith('_idr')||name==='organization_id'?'bigint unsigned':'varchar(191)')}))];
    if(sql.includes('information_schema.statistics'))return [Object.entries(s.indexes).flatMap(([name,columns])=>columns.map(columnName=>({name,columnName,nonUnique:name==='PRIMARY'||name.startsWith('uq_')?0:1})))];
    if(sql.includes('information_schema.table_constraints'))return [(s.checks||[]).map(name=>({name}))];
    return [Object.entries(s.keys).map(([name,[columnName,targetTable,targetColumn]])=>({name,columnName,targetTable,targetColumn}))];}};
  assert.deepEqual(await validateBillingSchema(c,{adminCatalog:true,platformAdminAudit:true}),[]);missing=true;
  const differences=await validateBillingSchema(c,{adminCatalog:true,platformAdminAudit:true});
  assert.ok(differences.some(d=>d.constraint==='fk_platform_audit_actor')); assert.ok(differences.some(d=>d.constraint==='fk_platform_audit_target'));
  assert.ok(!BILLING_CONTRACT.platform_admin_audit);
  const source=await readFile(new URL('../server/index.js',import.meta.url),'utf8');assert.ok(source.includes('installPlatformAdminRoutes(app, { getPool: () => pool })'));
});

test('admin client is same-origin/no-store, rejects arbitrary endpoints, submits no identity claims, and exposes sanitized failures',async()=>{
  const controller=new AbortController();
  const data=await adminManagementRequest('/api/admin/users/2/actions',{body:action(),signal:controller.signal},async(url,options)=>{
    assert.equal(url,'/api/admin/users/2/actions');assert.equal(options.method,'POST');assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');assert.equal(options.signal,controller.signal);assert.deepEqual(JSON.parse(options.body),action());return {ok:true,json:async()=>({status:'suspended'})};});
  assert.equal(data.status,'suspended');
  for(const path of ['https://evil.invalid','/api/admin/roles','/api/admin/users/0/actions']) await assert.rejects(adminManagementRequest(path),/Endpoint/);
  await assert.rejects(adminManagementRequest('/api/admin/users',{},async()=>({ok:false,status:503,json:async()=>({code:'ADMIN_SCHEMA_REQUIRED',error:'private error'})})),/migration 010/);
});
