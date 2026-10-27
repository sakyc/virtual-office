import 'dotenv/config';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { migrationConnectionOptions } from '../server/migrations/database.js';
import { installPlatformAdminRoutes, administerUser } from '../server/platform-admin.js';
import { issueSession, resolveSession } from '../server/auth/sessions.js';
import { inspectDatabaseHistory, inspectMigrationDirectory } from '../server/migrations/status.js';
import { validateCurrentSchema } from '../server/migrations/schema-contract.js';

// Explicit local operator verification only. All fixtures remain in one outer transaction.
assert.equal(process.env.PLATFORM_ADMIN_LOCAL_VERIFY, '1');
const options = migrationConnectionOptions();
assert(['127.0.0.1','localhost','::1'].includes(options.host));
assert.equal(options.database, 'virtual_office'); assert.equal(options.port, 3306); assert.notEqual(process.env.NODE_ENV, 'production');
let c, server, outer = false;
try {
  c = await mysql.createConnection(options);
  const [[target]] = await c.execute('SELECT DATABASE() AS db, @@datadir AS datadir');
  assert.equal(target.db, 'virtual_office'); assert.match(target.datadir.replaceAll('\\','/'), /^C:\/laragon\/data\/mysql-8\//i);
  const source = await inspectMigrationDirectory(fileURLToPath(new URL('../migrations', import.meta.url)));
  const history = await inspectDatabaseHistory(c, source.migrations);
  assert.deepEqual(source.diagnostics, []); assert.deepEqual(history.diagnostics, []);
  assert(history.history.some((h) => h.migration_id === '010_platform_admin_audit' && h.status === 'applied'));
  const validation = await validateCurrentSchema(c, { requireTenantFoundation:true, requireNativeCredentials:true, requireAiUsage:true, requireWorkspaceTeam:true, requireChatHistory:true, requireChatModelSelection:true, requireBilling:true, requireAdminCatalog:true, requirePlatformAdminAudit:true });
  assert.deepEqual(validation, { valid:true, differences:[] });
  const tables = ['users','organizations','workspaces','organization_memberships','workspace_memberships','sessions','platform_admins','platform_admin_audit','billing_subscriptions'];
  const counts = async () => {
    const result = {};
    for (const table of tables) { const [[r]] = await c.execute(`SELECT COUNT(*) AS n FROM ${table}`); result[table] = r.n; }
    return result;
  };
  const before = await counts(), tag = `admincheck-${randomUUID()}`;
  await c.beginTransaction(); outer = true;
  const user = async (suffix) => {
    const [r] = await c.execute("INSERT INTO users(provider_issuer,external_subject,email,display_name,status) VALUES (?,?,?,?,'active')", ['https://fixture.invalid',`${tag}-${suffix}`,`${tag}-${suffix}@example.invalid`,`${tag}-${suffix}`]); return r.insertId;
  };
  const actor = await user('admin'), member = await user('member'), other = await user('other');
  await c.execute("INSERT INTO platform_admins(user_id,approval_reference) VALUES (?, 'rollback-only-local-verification')",[actor]);
  const createOrg = async (suffix, owner) => {
    const [r] = await c.execute("INSERT INTO organizations(slug,name,created_by_user_id) VALUES (?,?,?)",[`${tag}-${suffix}`,`${tag}-${suffix}`,actor]);
    await c.execute("INSERT INTO organization_memberships(organization_id,user_id,role,created_by_user_id) VALUES (?,?,'owner',?)",[r.insertId,owner,actor]);
    const [w] = await c.execute('INSERT INTO workspaces(organization_id,slug,name,created_by_user_id) VALUES (?,?,?,?)',[r.insertId,'studio',suffix,actor]);
    return {id:r.insertId,workspace:w.insertId};
  };
  const a = await createOrg('A',actor), b = await createOrg('B',other);
  for (const [org,id,role] of [[a,member,'viewer'],[b,other,'admin']]) await c.execute('INSERT INTO workspace_memberships(workspace_id,user_id,role,created_by_user_id) VALUES (?,?,?,?)',[org.workspace,id,role,actor]);
  await c.execute(`INSERT INTO billing_subscriptions(organization_id,id,plan_code,plan_version,status,monthly_price_idr,included_credit_idr,max_divisions,max_members,agents_per_division,whatsapp_enabled,period_start,period_end,approval_reference)
    VALUES (?,?,'starter',1,'active',123456,45000,1,2,4,0,DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 1 DAY),DATE_ADD(CURRENT_TIMESTAMP,INTERVAL 1 DAY),'rollback-only-local-verification')`,[a.id,randomUUID()]);
  const adminSession = await issueSession(c,{userId:actor}), memberSession = await issueSession(c,{userId:member});
  const adapter = { execute:(...args)=>c.execute(...args), beginTransaction:()=>c.query('SAVEPOINT http_operation'), commit:()=>c.query('RELEASE SAVEPOINT http_operation'), rollback:()=>c.query('ROLLBACK TO SAVEPOINT http_operation'), release() {} };
  const app = express(); app.use(express.json()); installPlatformAdminRoutes(app,{getPool:()=>({getConnection:async()=>adapter}),env:{AUTH_PROVIDER:'native',APP_ORIGIN:'http://localhost:5173'}});
  server = app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  const request = (path,token=adminSession.token,body) => fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:body?'POST':'GET',headers:{...(token?{Cookie:`vo_session=${token}`} : {}),...(body?{Origin:'http://localhost:5173','Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  for(const path of ['/api/admin/users','/api/admin/organizations','/api/admin/subscriptions','/api/admin/activity']) {
    assert.equal((await request(path,null)).status,401); assert.equal((await request(path,memberSession.token)).status,403);
  }
  const users = await (await request(`/api/admin/users?q=${tag}`)).json(); assert.equal(users.rows.length,3);
  assert(!JSON.stringify(users).includes('token_hash')); assert(!JSON.stringify(users).includes('external_subject'));
  const orgs = await (await request(`/api/admin/organizations?q=${tag}`)).json(); assert.equal(orgs.rows.length,2);
  const members = await (await request(`/api/admin/organizations/${a.id}/members`)).json();
  assert.equal(members.rows.length,2); assert(!members.rows.some(r=>r.userId===other)); assert(members.rows.some(r=>r.workspaceId===a.workspace && r.role==='viewer'));
  const subscriptions = await (await request(`/api/admin/subscriptions?q=${tag}`)).json();
  assert.equal(subscriptions.rows.find(r=>r.id===a.id).monthlyPriceIdr,'123456'); assert.equal(subscriptions.rows.find(r=>r.id===a.id).effectiveStatus,'active'); assert.equal(subscriptions.rows.find(r=>r.id===b.id).effectiveStatus,'none');
  const body = (action,expectedStatus) => ({action,expectedStatus,reason:'Rollback-only local verification'});
  assert.equal((await request(`/api/admin/users/${actor}/actions`,adminSession.token,body('suspend','active'))).status,403);
  assert.equal((await request(`/api/admin/users/${member}/actions`,adminSession.token,body('suspend','active'))).status,200);
  assert.equal(await resolveSession(c,memberSession.token),null);
  assert.equal((await request(`/api/admin/users/${member}/actions`,adminSession.token,body('suspend','active'))).status,409);
  assert.equal((await request(`/api/admin/users/${member}/actions`,adminSession.token,body('activate','suspended'))).status,200);
  assert.equal(await resolveSession(c,memberSession.token),null);
  const newSession=await issueSession(c,{userId:member});
  assert.equal((await request(`/api/admin/users/${member}/actions`,adminSession.token,body('revoke_sessions','active'))).status,200);
  assert.equal(await resolveSession(c,newSession.token),null);
  const log = await (await request('/api/admin/activity')).json(); assert.equal(log.rows.filter(r=>r.actorUserId===actor).length,3);
  await c.query('SAVEPOINT audit_failure');
  await assert.rejects(administerUser(c,{userId:9007199254740991},other,body('suspend','active')),{code:'ER_NO_REFERENCED_ROW_2'});
  await c.query('ROLLBACK TO SAVEPOINT audit_failure');
  const [[unchanged]]=await c.execute('SELECT status FROM users WHERE id=?',[other]); assert.equal(unchanged.status,'active');
  await c.rollback(); outer=false; assert.deepEqual(await counts(),before);
  console.log(JSON.stringify({database:target.db,validation,checks:['history-and-schema','real-session-platform-grant-denial','parameterized-directories','organization-membership-isolation','stored-subscription-snapshot-and-unsubscribed-organizations','self-admin-protection','suspension-revokes-real-session','stale-status-conflict','reactivation-keeps-old-session-revoked','explicit-session-revocation','persisted-audit','foreign-key-failure-savepoint-rollback','outer-rollback-preserves-row-counts'],allFixtureWritesRolledBack:true,newDatabaseCreated:false,paidProviderCalls:0}));
} catch(e) {
  console.error(JSON.stringify({failed:true,code:e.code||'LOCAL_ADMIN_VERIFICATION_FAILED'}));process.exitCode=1;
} finally { if(server) await new Promise(r=>{server.close(r);server.closeAllConnections();}); if(outer)await c?.rollback();await c?.end(); }
