import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { dashboardNavigation } from '../src/react/dashboard-navigation.js';
import { builtinTaskTemplates, draftFromBuiltin, templateInput, templateMatchesDivision } from '../shared/task-templates.js';
import { JOBS } from '../shared/jobs.js';
import { installTaskTemplateRoutes } from '../server/task-templates.js';
import { createTenantGate } from '../server/auth/tenant-gate.js';
import { TASK_TEMPLATE_COLUMNS, validateTaskTemplateSchema } from '../server/migrations/task-template-contract.js';
import { inspectMigrationDirectory } from '../server/migrations/status.js';
import { fileURLToPath } from 'node:url';
import {managedDemoFirewall} from '../server/managed-demo.js';
import {MANAGED_DEMO_ISSUER} from '../server/managed-demo-policy.js';

const input = { name: 'Carousel produk', description: 'Edukasi', instructions: 'Buat draft dengan fakta dari input.', outputFormat: '7 slide', fields: [{ name: 'topik', label: 'Topik', type: 'text', required: true }] };
const divisionId='11111111-1111-1111-1111-111111111111';
async function fixture(t,{managedDemo=false}={}) {
  const state = { role: 'admin', organization: 3, workspace: 8, revoked: false, fail: false };
  let rows = [], snapshot;
  const calls = [];
  const c = {
    release() {}, async beginTransaction() { snapshot = structuredClone(rows); }, async commit() { snapshot = null; }, async rollback() { if (snapshot) rows = snapshot; snapshot = null; },
    async execute(sql, values = []) {
      if(sql.includes('FROM managed_demo_accounts'))return [managedDemo?[{organization_id:3,workspace_id:8,ai_enabled:0}]:[]];
      calls.push({ sql, values });
      if (sql.startsWith('SELECT s.')) return [[{ id: 4, user_id: 9, active_workspace_id: state.workspace, user_status: 'active', provider_issuer:managedDemo?MANAGED_DEMO_ISSUER:undefined, revoked_at: state.revoked ? new Date() : null, idle_expires_at: new Date(Date.now() + 60000), absolute_expires_at: new Date(Date.now() + 60000) }]];
      if (sql.startsWith('UPDATE sessions')) return [{}];
      if (sql.includes('LEFT JOIN organization_memberships')) return [[{ organizationId: state.organization, role: state.role, organizationRole: state.role === 'owner' ? 'owner' : null }]];
      if (state.fail) throw Error('mysql://secret@private');
      if (sql.startsWith('SELECT id FROM workspaces')) return [[{ id: state.workspace }]];
      if (sql.includes('FROM workspace_divisions')) return [values[0]===3 && values[1]===8 ? [{id:divisionId,name:'Social Media',templateId:'social'}] : []];
      const scoped = (r, offset = 0) => r.organization === values[offset] && r.workspace === values[offset + 1] && r.status === 'active';
      if (sql.startsWith('SELECT COUNT')) return [[{ count: rows.filter(r => scoped(r)).length }]];
      if (sql.startsWith('SELECT id, name')) return [rows.filter(r => scoped(r)).map(({ id, name, description, definition, version }) => ({ id, name, description, definition, version }))];
      if (sql.startsWith('SELECT id FROM workspace_task_templates')) return [rows.filter(r => scoped(r) && r.id === values[2])];
      if (sql.startsWith('INSERT INTO workspace_task_templates')) { const [id, organization, workspace, name, description, definition, creator] = values; rows.push({ id, organization, workspace, name, description, definition, creator, version: 1, status: 'active' }); return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE workspace_task_templates')) {
        const archived = sql.includes("SET status = 'archived'");
        const offset = archived ? 1 : 4;
        const row = rows.find(r => scoped(r, offset) && r.id === values[offset + 2] && r.version === values[offset + 3]);
        if (!row) return [{ affectedRows: 0 }];
        if (archived) row.status = 'archived';
        else [row.name, row.description, row.definition] = values;
        row.version++; return [{ affectedRows: 1 }];
      }
      throw Error('Unexpected SQL');
    },
  };
  const getPool = () => ({ getConnection: async () => c });
  const app = express(); app.use(express.json());
  if(managedDemo)app.use(managedDemoFirewall({getPool}));
  installTaskTemplateRoutes(app, { getPool, requireTenant: createTenantGate({ getPool, authEnabled: true, resourceQueriesScoped: true }), appOrigin: 'http://localhost:5173' });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = (path = '', method = 'GET', body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/task-templates${path}`, { method,
    headers: { Cookie: `vo_session=${'a'.repeat(43)}`, Origin: 'http://localhost:5173', 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const create = async () => { const response = await request('', 'POST', input); assert.equal(response.status, 200); return (await response.json()).id; };
  return { state, calls, request, create, rows: () => rows };
}

test('template validation and builtin catalog preserve public definitions without exposing private executor prompts', () => {
  assert.deepEqual(templateInput(input), {...input,divisionIds:[]});
  assert.equal(builtinTaskTemplates.length, JOBS.length);
  for (const template of builtinTaskTemplates) { assert.equal(template.readOnly, true); assert.equal(template.instructions, undefined); assert.deepEqual(template.fields, JOBS.find(j => j.id === template.id).fields); }
  assert.equal(draftFromBuiltin(builtinTaskTemplates[0]).instructions, '');
  for (const patch of [{ organizationId: 5 }, { userId: 5 }, { role: 'owner' }, { instructions: '' }, { name: 'a'.repeat(151) }, { fields: [...input.fields, ...input.fields] }, { fields: [{ ...input.fields[0], type: 'tool' }] }, { fields: Array(13).fill(input.fields[0]) }]) assert.throws(() => templateInput({ ...input, ...patch }), { status: 400 });
});

test('division selection is scoped, persisted and validated; legacy templates remain general',async t=>{
  const f=await fixture(t);
  const scopedInput={...input,divisionIds:[divisionId]};
  const response=await f.request('','POST',scopedInput);assert.equal(response.status,200);
  const id=(await response.json()).id;
  let result=await (await f.request()).json();
  assert.deepEqual(result.templates[0].divisionIds,[divisionId]);assert.equal(result.divisions[0].id,divisionId);
  const foreign='22222222-2222-2222-2222-222222222222';
  assert.equal((await f.request(`/${id}`,'PATCH',{...scopedInput,divisionIds:[foreign],version:1})).status,400);
  assert.equal((await f.request(`/${id}`,'PATCH',{...input,divisionIds:[],version:1})).status,200);
  result=await (await f.request()).json();assert.deepEqual(result.templates[0].divisionIds,[]);
  assert(templateMatchesDivision({},undefined));
  assert(templateMatchesDivision({divisionIds:[divisionId]},{id:divisionId}));
  assert(!templateMatchesDivision({divisionIds:[divisionId]},{id:foreign}));
  const carousel=builtinTaskTemplates.find(t=>t.id==='carousel');
  assert(templateMatchesDivision(carousel,{templateId:'social'}));assert(!templateMatchesDivision(carousel,{templateId:'ads'}));
  assert(builtinTaskTemplates.every(t=>t.divisionTemplateIds.length===1));
  for(const divisionIds of [null,'all',['bad'],[divisionId,divisionId]]) {
    assert.throws(()=>templateInput({...input,divisionIds}),{status:400});
  }
});

test('presentation demo manages templates with AI off, but keeps role and origin checks',async t=>{
  const f=await fixture(t,{managedDemo:true});assert.equal((await (await f.request()).json()).canManage,true);
  const id=await f.create();assert.equal((await f.request(`/${id}`,'PATCH',{...input,name:'Presentasi',version:1})).status,200);
  assert.equal((await f.request(`/${id}/archive`,'POST',{version:2})).status,200);
  assert.equal((await (await f.request()).json()).templates.length,0);
  assert.equal((await f.request('','POST',input,{Origin:'https://evil.test'})).status,403);
  f.state.role='viewer';assert.equal((await (await f.request()).json()).canManage,false);assert.equal((await f.request('','POST',input)).status,403);
});
test('custom templates persist through CRUD, optimistic conflicts and archive without deleting rows', async t => {
  const f = await fixture(t), id = await f.create();
  assert.equal(f.rows()[0].creator, 9);
  let body = await (await f.request()).json(); assert.equal(body.templates[0].name, input.name); assert.equal(body.templates[0].instructions, input.instructions); assert.equal(body.executionReady, true);
  assert.equal((await f.request(`/${id}`, 'PATCH', { ...input, name: 'Baru', version: 1 })).status, 200);
  assert.equal((await f.request(`/${id}`, 'PATCH', { ...input, version: 1 })).status, 409);
  assert.equal((await f.request(`/${id}/archive`, 'POST', { version: 1 })).status, 409);
  assert.equal((await f.request(`/${id}/archive`, 'POST', { version: 2 })).status, 200);
  assert.equal((await (await f.request()).json()).templates.length, 0);
  assert.equal(f.rows().length, 1); assert.equal(f.rows()[0].status, 'archived');
  assert.equal((await f.request(`/${id}`, 'PATCH', { ...input, version: 3 })).status, 404);
  assert.ok(f.calls.some(call => call.sql.includes('FOR UPDATE'))); assert.ok(!f.calls.some(call => call.sql.startsWith('DELETE')));
});
test('server session and membership enforce read access and owner/admin management', async t => {
  const f = await fixture(t);
  for (const role of ['member', 'viewer']) { f.state.role = role; assert.equal((await f.request()).status, 200); assert.equal((await f.request('', 'POST', input)).status, 403); }
  for (const role of ['owner', 'admin']) { f.state.role = role; await f.create(); }
  f.state.role = 'platform_admin'; assert.equal((await f.request()).status, 403);
  f.state.role = 'admin'; f.state.revoked = true; assert.equal((await f.request()).status, 401);
  f.state.revoked = false; assert.equal((await f.request('', 'GET', undefined, { Cookie: '' })).status, 401);
});
test('cross-tenant IDs, forged scope and cross-origin writes fail closed', async t => {
  const f = await fixture(t), id = await f.create();
  assert.equal((await f.request('', 'POST', { ...input, workspaceId: 1 })).status, 400);
  assert.equal((await f.request('?workspaceId=8')).status, 400);
  assert.equal((await f.request('', 'POST', input, { Origin: 'https://evil.test' })).status, 403);
  for (const change of [{ workspace: 18 }, { workspace: 8, organization: 33 }]) {
    Object.assign(f.state, change); assert.equal((await (await f.request()).json()).templates.length, 0);
    assert.equal((await f.request(`/${id}`, 'PATCH', { ...input, version: 1 })).status, 404);
    assert.equal((await f.request(`/${id}/archive`, 'POST', { version: 1 })).status, 404);
  }
  assert.equal(f.rows()[0].version, 1);
  f.state.fail = true; const res = await f.request(); assert.equal(res.status, 503); assert.doesNotMatch(await res.text(), /secret|mysql:/);
});
test('014 is additive and registered; contract detects missing columns, keys and indexes', async () => {
  const manifest = await inspectMigrationDirectory(fileURLToPath(new URL('../migrations', import.meta.url)));
  assert.deepEqual(manifest.diagnostics, []);
  const migration = manifest.migrations.find(m => m.id === '014_task_templates'); assert.match(migration.checksum, /^[a-f0-9]{64}$/); assert.doesNotMatch(migration.source, /^\s*(?:DELETE|DROP|ALTER|INSERT|UPDATE)\b/im);
  let missing = false;
  const c = { async execute(sql) {
    if (missing) return [[]];
    if (sql.includes('information_schema.columns')) return [Object.entries(TASK_TEMPLATE_COLUMNS).map(([name, [type, nullable]]) => ({ name, type, nullable }))];
    if (sql.includes('statistics')) return [[{ name: 'PRIMARY', columnName: 'id', nonUnique: 0 }, ...['organization_id', 'workspace_id', 'status'].map(columnName => ({ name: 'idx_task_templates_scope_status', columnName, nonUnique: 1 }))]];
    return [[...['organization', 'workspace', 'creator', 'updater'].map((suffix, i) => ({ name: `fk_task_template_${suffix}`, columnName: ['organization_id', 'workspace_id', 'created_by_user_id', 'updated_by_user_id'][i], targetTable: ['organizations', 'workspaces', 'users', 'users'][i], targetColumn: 'id' }))]];
  } };
  assert.deepEqual(await validateTaskTemplateSchema(c), []); missing = true; assert.ok((await validateTaskTemplateSchema(c)).length >= 19);
});
test('React template page exposes scoped management, public readonly templates and explicit execution limitation', async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { TemplateLibrary, TemplateEditor } = await vite.ssrLoadModule('/src/react/task-templates.jsx');
    const props = { data: { templates: [{ ...input, id: 'x', version: 1 }], builtins: builtinTaskTemplates, canManage: true }, tab: 'custom', search: '' };
    const html = renderToStaticMarkup(React.createElement(TemplateLibrary, props));
    for (const label of ['Template Tugas', 'Buat template', 'Edit', 'Arsipkan', 'Gunakan template', 'Tugas → Buat tugas']) assert.ok(html.includes(label));
    assert.match(html,/href="\/dashboard\/jobs\?template=x"/);
    const readonly = renderToStaticMarkup(React.createElement(TemplateLibrary, { ...props, data: { ...props.data, canManage: false } })); assert.ok(!readonly.includes('>Edit<')); assert.ok(!readonly.includes('+ Buat template'));
    const builtins = renderToStaticMarkup(React.createElement(TemplateLibrary, { ...props, tab: 'builtin' })); assert.ok(builtins.includes('Salin struktur')); assert.ok(!builtins.includes('>Edit<'));
    const socialOnly=renderToStaticMarkup(React.createElement(TemplateLibrary,{...props,tab:'builtin',divisionFilter:divisionId,data:{...props.data,divisions:[{id:divisionId,name:'Social Media',templateId:'social'}]}}));
    assert(socialOnly.includes('Buat carousel'));assert(!socialOnly.includes('Copy Meta Ads'));
    const editor = renderToStaticMarkup(React.createElement(TemplateEditor, { value: input })); assert.ok(editor.includes('Instruksi tugas')); assert.ok(editor.includes('Tambah kolom'));
    assert(editor.includes('Tersedia untuk divisi'));assert(editor.includes('Umum · semua divisi'));
    const navigated = [];
    const navigation = dashboardNavigation({ baseGroups: [], section: 'templates', onNavigate: path => navigated.push(path), setView() {} });
    const templateLink = navigation.flatMap(group => group.items).find(item => item.id === 'templates');
    assert.equal(templateLink.label, 'Template tugas');
    assert.equal(templateLink.current, 'page');
    templateLink.go();
    assert.deepEqual(navigated, ['/dashboard/templates']);
  } finally { await vite.close(); }
});
