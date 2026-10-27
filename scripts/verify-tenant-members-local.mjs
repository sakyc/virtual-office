// Explicit local MySQL integration verification. All fixtures are rolled back in the existing local database.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { connectApprovedNonProduction, migrationConnectionOptions } from '../server/migrations/database.js';
import { inspectMigrationDirectory, inspectDatabaseHistory } from '../server/migrations/status.js';
import { validateTenantMemberSchema } from '../server/migrations/tenant-member-contract.js';
import { createTenantGate } from '../server/auth/tenant-gate.js';
import { installAuthRoutes } from '../server/auth/auth-routes.js';
import { issueSession } from '../server/auth/sessions.js';
import { installTenantMemberRoutes, invitationHash } from '../server/tenant-members.js';
import { installDashboardRoutes } from '../server/dashboard-routes.js';
import { assertTenantAgentAccess } from '../server/member-access.js';
import { installOfficeChatRoutes } from '../server/office-chat.js';
import { createChatHistoryStore } from '../server/chat-history.js';
import { resolveWorkspaceAgent } from '../server/workspace-team.js';

let c, server, transaction = false, stage = 'target', checks = 0;
function passed(check) { checks++; console.log(JSON.stringify({ check, passed: true })); }
try {
  assert.equal(process.argv.slice(2).join(' '), '--confirm-non-production');
  const options = migrationConnectionOptions();
  assert.equal(options.database, 'virtual_office'); assert.equal(options.port, 3306); assert.notEqual(process.env.NODE_ENV, 'production'); assert(['127.0.0.1','localhost','::1'].includes(options.host));
  c = await connectApprovedNonProduction();
  const [[target]] = await c.execute('SELECT DATABASE() AS db, @@datadir AS datadir'); assert.equal(target.db, 'virtual_office'); assert.match(target.datadir.replaceAll('\\', '/'), /^C:\/laragon\/data\/mysql-8\//i);
  const manifest = await inspectMigrationDirectory(fileURLToPath(new URL('../migrations', import.meta.url))); assert.deepEqual(manifest.diagnostics, []);
  const history = await inspectDatabaseHistory(c, manifest.migrations); assert.deepEqual(history.diagnostics, []);
  assert(history.history.some(row => row.migration_id === '016_tenant_members' && row.status === 'applied'));
  assert.deepEqual(await validateTenantMemberSchema(c), []);
  passed('016-schema-composite-foreign-keys-indexes-and-checksum');
  const [tables] = await c.execute('SELECT table_name AS name FROM information_schema.tables WHERE table_schema=DATABASE() ORDER BY table_name');
  async function fingerprint() {
    const result = {};
    for (const { name } of tables) { assert(/^[a-z0-9_]+$/.test(name)); const [rows] = await c.query('SELECT * FROM `' + name + '`'); result[name] = createHash('sha256').update(JSON.stringify(rows.map(row => JSON.stringify(row)).sort())).digest('hex'); }
    return result;
  }
  const before = await fingerprint();
  await c.beginTransaction(); transaction = true; stage = 'fixtures';
  const suffix = randomUUID();
  async function user(name) {
    const email = `${name}-${suffix}@example.test`;
    const [r] = await c.execute('INSERT INTO users (provider_issuer, external_subject, email, display_name) VALUES (?, ?, ?, ?)', ['urn:local:member-test', randomUUID(), email, name]);
    return { id: r.insertId, email };
  }
  const owner = await user('owner'), member = await user('member'), other = await user('other'), viewer = await user('viewer'), admin = await user('admin');
  async function workspace(name) {
    const [org] = await c.execute('INSERT INTO organizations (slug, name, created_by_user_id) VALUES (?, ?, ?)', [name + '-' + suffix, name, owner.id]);
    await c.execute("INSERT INTO organization_memberships (organization_id, user_id, role, created_by_user_id) VALUES (?, ?, 'owner', ?)", [org.insertId, owner.id, owner.id]);
    const [ws] = await c.execute('INSERT INTO workspaces (organization_id, slug, name, created_by_user_id) VALUES (?, ?, ?, ?)', [org.insertId, 'main', name, owner.id]);
    await c.execute("INSERT INTO workspace_memberships (workspace_id,user_id,role,created_by_user_id) VALUES (?,?,'admin',?)", [ws.insertId,owner.id,owner.id]);
    const [[plan]] = await c.execute('SELECT code, version FROM billing_plans ORDER BY code LIMIT 1'); assert(plan);
    await c.execute(`INSERT INTO billing_subscriptions (organization_id,id,plan_code,plan_version,status,monthly_price_idr,included_credit_idr,max_divisions,max_members,whatsapp_enabled,period_start,period_end,approval_reference)
      VALUES (?, ?, ?, ?, 'active', 0, 0, 8, 8, 0, DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY), DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY), 'rollback-test')`, [org.insertId,randomUUID(),plan.code,plan.version]);
    return { organizationId: org.insertId, workspaceId: ws.insertId };
  }
  const tenant = await workspace('member-qa'), foreign = await workspace('foreign-qa');
  for (const [person,role] of [[viewer,'viewer'],[admin,'admin']]) await c.execute('INSERT INTO workspace_memberships (workspace_id,user_id,role,created_by_user_id) VALUES (?,?,?,?)', [tenant.workspaceId,person.id,role,owner.id]);
  async function agent(t) {
    const divisionId=randomUUID(), agentId=randomUUID();
    await c.execute('INSERT INTO workspace_divisions (id,organization_id,workspace_id,name,created_by_user_id) VALUES (?,?,?,?,?)', [divisionId,t.organizationId,t.workspaceId,'QA division',owner.id]);
    await c.execute("INSERT INTO workspace_agents (id,organization_id,workspace_id,division_id,name,role,instructions,created_by_user_id) VALUES (?,?,?,?,?,'Writer','Draft only',?)", [agentId,t.organizationId,t.workspaceId,divisionId,'QA agent',owner.id]);
    return { divisionId, agentId };
  }
  const own = await agent(tenant), unassigned = await agent(tenant), cross = await agent(foreign);
  const tokens = {};
  for (const person of [owner,member,other,viewer,admin]) { const session = await issueSession(c,{userId:person.id,activeWorkspaceId:person===member || person===other ? null : tenant.workspaceId}); tokens[person.id] = session.token; }
  let nesting = 0;
  const connection = { execute: (...a)=>c.execute(...a), query: (...a)=>c.query(...a), release() {},
    async beginTransaction() { await c.query(`SAVEPOINT member_${++nesting}`); },
    async commit() { await c.query(`RELEASE SAVEPOINT member_${nesting--}`); },
    async rollback() { await c.query(`ROLLBACK TO SAVEPOINT member_${nesting}`); await c.query(`RELEASE SAVEPOINT member_${nesting--}`); } };
  const pool={ getConnection:async()=>connection }, origin='http://localhost:5173';
  const app=express();app.use(express.json());
  const requireTenant=createTenantGate({getPool:()=>pool,authEnabled:true,resourceQueriesScoped:true,memberAssignments:true});
  installAuthRoutes(app,{getPool:()=>pool,env:{AUTH_PROVIDER:'native',APP_ORIGIN:origin}});
  installTenantMemberRoutes(app,{getPool:()=>pool,requireTenant,appOrigin:origin});
  const modelCatalog={async refresh(){},list:()=>[{id:'local-test',selectable:true}],resolve:()=> 'local-test',resolveTariff:async()=>({maxOutputTokens:1500})};
  installDashboardRoutes(app,{getPool:()=>pool,requireTenant,appOrigin:origin,modelCatalog,runTenantRevision:async()=>{}});
  installOfficeChatRoutes(app,{requireTenant,appOrigin:origin,client:null,models:{leader:'local-test',team:'local-test'},rateLimit:(_r,_s,next)=>next(),dailyCap:(_r,_s,next)=>next(),modelCatalog,
    resolveAgent:(t,id)=>resolveWorkspaceAgent(connection,t,id),historyStore:createChatHistoryStore(()=>pool)});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const root=`http://127.0.0.1:${server.address().port}`;
  const request=(path,person=owner,body,method=body===undefined?'GET':'POST',headers={})=>fetch(root+path,{method,headers:{...(person?{Cookie:`vo_session=${tokens[person.id]}`} : {}),...(body===undefined?{}:{Origin:origin,'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const base='/api/workspace/members';
  stage='registration';
  const signup=await request('/auth/register',null,{displayName:'WA test',email:`signup-${suffix}@example.test`,password:'Lentera!9Kantor',whatsappNumber:'081234567890'});assert.equal(signup.status,201);
  const [[phone]]=await c.execute('SELECT whatsapp_number,whatsapp_verified_at FROM users WHERE email=?',[`signup-${suffix}@example.test`]);assert.equal(phone.whatsapp_number,'+6281234567890');assert.equal(phone.whatsapp_verified_at,null);
  assert.equal((await request('/auth/register',null,{displayName:'Bad WA',email:'bad@example.test',password:'Lentera!9Kantor'})).status,400);
  passed('signup-requires-normalized-whatsapp-without-claiming-verification');
  stage='invite';
  assert.equal((await request(base,null)).status,401);
  assert.equal((await request(base+'/invitations',viewer,{email:member.email,role:'member',divisionIds:[],agentIds:[]})).status,403);
  assert.equal((await request(base+'/invitations',admin,{email:member.email,role:'admin',divisionIds:[],agentIds:[]})).status,403);
  assert.equal((await request(base+'/invitations',owner,{},'POST',{Origin:'https://evil.test'})).status,403);
  assert.equal((await request(base+'?organizationId=1')).status,400);
  assert.equal((await request(base+'/invitations',owner,{email:member.email,role:'member',divisionIds:[cross.divisionId],agentIds:[]})).status,404);
  const response=await request(base+'/invitations',owner,{email:member.email,role:'member',divisionIds:[own.divisionId],agentIds:[]});assert.equal(response.status,200);
  const invite=await response.json(), token=new URLSearchParams(new URL(invite.inviteUrl).hash.slice(1)).get('token');
  const [[saved]]=await c.execute('SELECT token_hash,consumed_at FROM workspace_invitations WHERE id=?',[invite.id]);assert.deepEqual(saved.token_hash,invitationHash(token));
  const [[notJoined]]=await c.execute('SELECT COUNT(*) AS count FROM workspace_memberships WHERE workspace_id=? AND user_id=?',[tenant.workspaceId,member.id]);assert.equal(notJoined.count,0);
  passed('server-scoped-invites-hashed-no-automatic-membership-and-csrf-role-denial');
  stage='accept';
  assert.equal((await request('/api/workspace/invitations/accept',other,{token})).status,403);
  assert.equal((await request('/api/workspace/invitations/accept',member,{token,userId:owner.id})).status,400);
  assert.equal((await request('/api/workspace/invitations/accept',member,{token})).status,200);
  assert.equal((await request('/api/workspace/invitations/accept',member,{token})).status,410);
  const list=await (await request(base)).json();assert(list.members.some(m=>m.id===member.id && m.role==='member' && m.divisionIds.includes(own.divisionId)));assert(!JSON.stringify(list).includes(token));
  passed('email-bound-one-use-invitation-and-server-selected-workspace');
  stage='assignments';
  const opts=await (await request('/api/dashboard/task-options',member)).json();assert(opts.canCreate);assert(opts.agents.some(a=>a.id===own.agentId));assert(!opts.agents.some(a=>a.id===unassigned.agentId));
  const body={mode:'workspace',agentId:own.agentId,requestKey:randomUUID(),title:'QA task',instructions:'Draft text',values:{},modelId:'local-test'};
  const created=await request('/api/dashboard/jobs',member,body);assert.equal(created.status,202);const {jobId}=await created.json();
  assert.equal((await request('/api/dashboard/jobs',member,{...body,agentId:unassigned.agentId,requestKey:randomUUID()})).status,403);
  assert.equal((await request('/api/dashboard/jobs',viewer,{...body,requestKey:randomUUID()})).status,403);
  assert.equal((await request('/api/dashboard/jobs',member,{...body,requestKey:randomUUID(),organizationId:foreign.organizationId})).status,400);
  assert.equal((await request('/api/office/conversations',member,{agentId:unassigned.agentId})).status,403);
  assert.equal((await request('/api/office/conversations',member,{agentId:own.agentId})).status,200);
  const memberContext={...tenant,userId:member.id,role:'member',memberPolicy:true};
  await assert.rejects(assertTenantAgentAccess(connection,memberContext,cross.agentId),{status:403});
  passed('assigned-agent-chat-task-enforcement-and-cross-tenant-viewer-denial');
  stage='pic';
  const [itemResult]=await c.execute("INSERT INTO items (job_id,agent_id,type,title,content,organization_id,workspace_id,created_by_user_id) VALUES (?,?,'task','QA result',?,?,?,?)",[jobId,own.agentId,JSON.stringify({fields:[]}),tenant.organizationId,tenant.workspaceId,member.id]);const itemId=itemResult.insertId;
  assert.equal((await request(`/api/dashboard/items/${itemId}/approve`,member,{})).status,403);
  assert.equal((await request(base+`/reviewers/${own.divisionId}`,owner,{userId:member.id},'PUT')).status,200);
  const item=await (await request(`/api/dashboard/items/${itemId}`,member)).json();assert.equal(item.item.canReview,true);assert.equal(item.item.reviewer.userId,member.id);
  const board=await (await request('/api/dashboard/items',member)).json();assert(board.items.some(i=>i.id===itemId && i.canReview===true));
  assert.equal((await request(`/api/dashboard/items/${itemId}/approve`,member,{})).status,204);
  assert.equal((await request(`/api/dashboard/items/${itemId}/reject`,viewer,{version:1,reason:'Denied'})).status,403);
  assert.equal((await request(base+`/reviewers/${cross.divisionId}`,owner,{userId:member.id},'PUT')).status,404);
  assert.equal((await request(base+`/reviewers/${own.divisionId}`,owner,{userId:viewer.id},'PUT')).status,403);
  passed('board-routes-approval-to-active-assigned-pic-and-owner-admin-only');
  stage='versions-revocation';
  const beforeMember=list.members.find(m=>m.id===member.id);
  const patch={role:'member',version:beforeMember.version,divisionIds:[],agentIds:[unassigned.agentId]};
  assert.equal((await request(base+`/${member.id}`,owner,patch,'PATCH')).status,200);
  assert.equal((await request(base+`/${member.id}`,owner,patch,'PATCH')).status,409);
  assert.equal((await request(`/api/dashboard/items/${itemId}/approve`,member,{})).status,403);
  assert.equal((await request('/api/office/conversations',member,{agentId:own.agentId})).status,403);
  assert.equal((await request('/api/office/conversations',member,{agentId:unassigned.agentId})).status,200);
  assert.equal((await request(base+`/${owner.id}`,admin,{...patch,role:'viewer',agentIds:[]},'PATCH')).status,403);
  assert.equal((await request(base+`/${member.id}/revoke`,owner,{version:beforeMember.version+1})).status,200);
  assert.equal((await request(base,member)).status,403);
  passed('version-conflicts-owner-protection-assignment-changes-clear-pic-and-revocation');
  stage='expiry-capacity';
  async function newInvitation() { const r=await request(base+'/invitations',owner,{email:other.email,role:'member',divisionIds:[],agentIds:[]});assert.equal(r.status,200);return r.json(); }
  const expired=await newInvitation();await c.execute('UPDATE workspace_invitations SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id=?',[expired.id]);
  const extract=x=>new URLSearchParams(new URL(x.inviteUrl).hash.slice(1)).get('token');
  assert.equal((await request('/api/workspace/invitations/accept',other,{token:extract(expired)})).status,410);
  const revoked=await newInvitation();assert.equal((await request(base+`/invitations/${revoked.id}/revoke`,owner,{})).status,200);
  assert.equal((await request('/api/workspace/invitations/accept',other,{token:extract(revoked)})).status,410);
  const limited=await newInvitation();await c.execute('UPDATE billing_subscriptions SET max_members=3 WHERE organization_id=?',[tenant.organizationId]);
  assert.equal((await request('/api/workspace/invitations/accept',other,{token:extract(limited)})).status,402);
  // Existing humans do not consume a second organization-wide seat in a sibling workspace.
  const [sibling]=await c.execute('INSERT INTO workspaces (organization_id,slug,name,created_by_user_id) VALUES (?,?,?,?)',[tenant.organizationId,'sibling','QA sibling',owner.id]);
  await c.execute("INSERT INTO workspace_memberships (workspace_id,user_id,role,created_by_user_id) VALUES (?,?,'admin',?)",[sibling.insertId,owner.id,owner.id]);
  await c.execute('UPDATE sessions SET active_workspace_id=? WHERE user_id=?',[sibling.insertId,owner.id]);
  const reusedSeat=await request(base+'/invitations',owner,{email:viewer.email,role:'viewer',divisionIds:[],agentIds:[]});assert.equal(reusedSeat.status,200);
  assert.equal((await request('/api/workspace/invitations/accept',viewer,{token:extract(await reusedSeat.json())})).status,200);
  await c.execute('UPDATE sessions SET active_workspace_id=? WHERE user_id=?',[tenant.workspaceId,owner.id]);
  await c.execute('UPDATE sessions SET revoked_at=UTC_TIMESTAMP() WHERE user_id=?',[viewer.id]);assert.equal((await request(base,viewer)).status,401);
  passed('expired-revoked-invites-seat-limit-at-acceptance-and-revoked-session');
  stage='foreign-key';
  await assert.rejects(c.execute('INSERT INTO workspace_member_agents (organization_id,workspace_id,user_id,agent_id) VALUES (?,?,?,?)',[tenant.organizationId,tenant.workspaceId,admin.id,cross.agentId]),{code:'ER_NO_REFERENCED_ROW_2'});
  const [[audit]]=await c.execute('SELECT COUNT(*) AS count FROM workspace_member_audit WHERE organization_id=?',[tenant.organizationId]);assert(audit.count>4);
  passed('real-composite-foreign-key-and-member-audit');
  await c.rollback();transaction=false;
  assert.deepEqual(await fingerprint(),before);passed('all-fixture-rows-rolled-back-existing-data-unchanged');
  console.log(JSON.stringify({database:target.db,checks,paidProviderCalls:0,fixturesRolledBack:true,whatsappMessagesSent:0}));
} catch(error) {
  console.error(JSON.stringify({failed:true,stage,code:error.code||'LOCAL_MEMBER_VERIFICATION_FAILED',...(typeof error.actual==='number'?{actual:error.actual,expected:error.expected}:{})}));process.exitCode=1;
} finally { if(server) await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});if(transaction)await c?.rollback().catch(()=>{});await c?.end(); }
