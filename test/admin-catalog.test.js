import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { installCatalogRoutes, validatePlanUpdate, readCatalog } from '../server/billing-catalog.js';
import { hashSessionToken } from '../server/auth/sessions.js';
import { publicBillingPlans } from '../shared/billing-plans.js';
import { inspectMigrationDirectory } from '../server/migrations/status.js';
import { BILLING_CONTRACT, ADMIN_CATALOG_CONTRACT, validateBillingSchema } from '../server/migrations/billing-contract.js';
import { loadPublicPlans, adminCatalogRequest } from '../src/react/catalog-data.js';

const token = (id) => `catalog-session-${id}-` + 'a'.repeat(40);
const input = (overrides = {}) => ({ expectedVersion: 1, name: 'Starter baru', monthlyPriceIdr: '179000', includedCreditIdr: '65000', maxDivisions: 2, maxMembers: 4, whatsapp: false, isPublic: true, reason: 'Penyesuaian harga paket', ...overrides });
function fixture(env = { AUTH_PROVIDER: 'native', APP_ORIGIN: 'http://localhost:5173' }) {
  let state = { plans: publicBillingPlans.map((p) => ({ monthlyPriceIdr: null, includedCreditIdr: null, maxDivisions: null, maxMembers: null, ...p, version: 1, isPublic: 1, whatsapp: p.whatsapp ? 1 : 0, quoteRequired: p.quoteRequired ? 1 : 0 })), audit: [] };
  const grants = new Set([1]), sessions = new Map([1,2,3,4].map((id) => [hashSessionToken(token(id)).toString('hex'), { id, user_id: id, user_status: 'active', active_workspace_id: null, idle_expires_at: new Date(Date.now() + 3600000), absolute_expires_at: new Date(Date.now() + 3600000) }]));
  let queue = Promise.resolve(), failAudit = false;
  const calls = [];
  const pool = { async getConnection() {
    let snapshot, unlock;
    return {
      async beginTransaction() { const previous = queue; queue = new Promise((resolve) => { unlock = resolve; }); await previous; snapshot = structuredClone(state); },
      async commit() { snapshot = null; }, async rollback() { if (snapshot) state = snapshot; }, release() { unlock?.(); },
      async execute(sql, values = []) {
        calls.push({ sql, values });
        if (sql.includes('FROM sessions s')) return [[sessions.get(values[0].toString('hex'))].filter(Boolean)];
        if (sql.startsWith('UPDATE sessions')) return [{ affectedRows: 1 }];
        if (sql.includes('FROM platform_admins')) return [grants.has(values[0]) ? [{ user_id: values[0] }] : []];
        if (sql.includes('FROM billing_plans')) return [structuredClone(state.plans.filter((p) => sql.includes('WHERE code = ?') ? p.code === values[0] : !sql.includes('WHERE is_public = 1') || p.isPublic))];
        if (sql.startsWith('UPDATE billing_plans')) {
          const p = state.plans.find((p) => p.code === values[8] && p.version === values[9]);
          if (!p) return [{ affectedRows: 0 }];
          Object.assign(p, { name: values[0], version: values[1], monthlyPriceIdr: values[2], includedCreditIdr: values[3], maxDivisions: values[4], maxMembers: values[5], whatsapp: values[6], isPublic: values[7] });
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('INSERT INTO billing_catalog_audit')) {
          if (failAudit) throw Error('private database failure');
          state.audit.push({ id: values[0], actorUserId: values[1], planCode: values[2], planVersion: values[3], beforeSnapshot: values[4], afterSnapshot: values[5], reason: values[6] }); return [{}];
        }
        if (sql.includes('FROM billing_catalog_audit')) return [structuredClone(state.audit)];
        throw Error('Unexpected SQL: ' + sql);
      },
    };
  } };
  const app = express(); app.use(express.json()); installCatalogRoutes(app, { getPool: () => pool, env });
  return { app, pool, state: () => state, calls, grants, sessions, failAudit: (value) => { failAudit = value; } };
}
async function serve(t, f) {
  const server = f.app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  t.after(() => new Promise((r) => { server.close(r); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  return (path, id = 1, options = {}) => fetch(url + path, { ...options, headers: { ...(id ? { Cookie: `vo_session=${token(id)}` } : {}), ...options.headers } });
}
const put = (body, origin = 'http://localhost:5173') => ({ method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('only live server-resolved platform grants can administer catalog; tenant roles and forged claims cannot', async (t) => {
  const f = fixture(), request = await serve(t, f);
  for (const path of ['/api/admin/billing/plans','/api/platform/me']) {
    assert.equal((await request(path, null)).status, 401);
    for (const id of [2,3,4]) assert.equal((await request(path, id, { headers: { 'x-role': 'platform_admin', 'x-user-id': '1', 'x-access-code': 'secret' } })).status, 403);
  }
  assert.equal((await request('/api/platform/me')).status, 200);
  f.grants.delete(1);
  assert.equal((await request('/api/admin/billing/plans')).status, 403);
  f.grants.add(1); f.sessions.get(hashSessionToken(token(1)).toString('hex')).revoked_at = new Date();
  assert.equal((await request('/api/admin/billing/plans')).status, 401);
  assert.equal(f.state().audit.length, 0);
});

test('catalog publication is dynamic for public and owner reads, audit captures exact snapshots and server actor', async (t) => {
  const f = fixture(), request = await serve(t, f);
  const updated = await request('/api/admin/billing/plans/starter', 1, put(input()));
  assert.equal(updated.status, 200); assert.equal((await updated.json()).plan.version, 2);
  const response = await request('/api/plans', null); assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json(), p = data.plans.find((p) => p.code === 'starter');
  assert.equal(p.monthlyPriceIdr, '179000'); assert.equal(p.includedCreditIdr, '65000'); assert.equal(p.maxDivisions, 2);
  const c = await f.pool.getConnection(); assert.deepEqual(await readCatalog(c), data.plans);
  const audit = f.state().audit[0]; assert.equal(audit.actorUserId, 1);
  assert.equal(JSON.parse(audit.beforeSnapshot).monthlyPriceIdr, '149000');
  assert.equal(JSON.parse(audit.afterSnapshot).monthlyPriceIdr, '179000');
  assert.equal((await request('/api/admin/billing/plans/starter', 1, put(input({ expectedVersion: 2, isPublic: false })))).status, 200);
  assert.ok(!(await (await request('/api/plans', null)).json()).plans.some((p) => p.code === 'starter'));
  assert.equal((await (await request('/api/admin/billing/plans')).json()).plans.length, 4);
  assert.ok(!JSON.stringify(data).includes('actorUserId'));
  assert.ok(!f.calls.some((c) => /UPDATE billing_subscriptions|INSERT INTO billing_credit_grants|FROM (items|jobs|clients|revisions)/.test(c.sql)));
});

test('concurrent edits cannot overwrite each other; stale versions and invalid requests create no audit', async (t) => {
  const f = fixture(), request = await serve(t, f);
  const results = await Promise.all([input(),input({ monthlyPriceIdr: '199000' })].map((body) => request('/api/admin/billing/plans/starter', 1, put(body))));
  assert.deepEqual(results.map((r) => r.status).sort(), [200,409]); assert.equal(f.state().audit.length, 1);
  const bad = [input({ userId: 1 }), input({ role: 'platform_admin' }), input({ maxDivisions: 9 }), input({ monthlyPriceIdr: '1.5' }), input({ monthlyPriceIdr: '0' }), input({ includedCreditIdr: '-1' }), input({ reason: 'a' }), input({ agentsPerDivision: 9 })];
  for (const body of bad) assert.equal((await request('/api/admin/billing/plans/starter', 1, put(body))).status, 400);
  assert.equal((await request('/api/admin/billing/plans/starter', 2, put(input()))).status, 403);
  for (const origin of ['https://evil.invalid','']) assert.equal((await request('/api/admin/billing/plans/starter', 1, put(input(), origin))).status, 403);
  assert.equal((await request('/api/admin/billing/plans?userId=1')).status, 400);
  assert.equal((await request('/api/admin/billing/plans/starter', 1, { method: 'PUT', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'text/plain' }, body: '{}' })).status, 403);
  assert.equal(f.state().audit.length, 1);
});

test('audit failure rolls back catalog edits and sanitizes errors; disabled authentication never grants access', async (t) => {
  const f = fixture(), request = await serve(t, f), before = structuredClone(f.state()); f.failAudit(true);
  const response = await request('/api/admin/billing/plans/starter', 1, put(input()));
  assert.equal(response.status, 503); assert.ok(!(await response.text()).includes('private database')); assert.deepEqual(f.state(), before);
  const disabled = await serve(t, fixture({ AUTH_PROVIDER: 'auth0', AUTH0_ENABLED: '0' }));
  assert.equal((await disabled('/api/admin/billing/plans')).status, 503);
  assert.equal((await disabled('/api/plans', null)).status, 200);
});

test('Custom remains explicitly negotiated; no unlimited capacity or public quote can be injected', () => {
  const quote = input({ monthlyPriceIdr: null, includedCreditIdr: null, maxDivisions: null, maxMembers: null, whatsapp: false });
  assert.equal(validatePlanUpdate('custom', quote).maxDivisions, null);
  for (const override of [{ maxDivisions: 8 }, { monthlyPriceIdr: '100000' }, { whatsapp: true }]) assert.throws(() => validatePlanUpdate('custom', { ...quote, ...override }));
});

test('009 is registered, adds only admin catalog structures, grants no admin and validates constraints', async () => {
  const report = await inspectMigrationDirectory(fileURLToPath(new URL('../migrations', import.meta.url)));
  assert.deepEqual(report.diagnostics, []);
  const m = report.migrations.find((m) => m.id === '009_admin_catalog'); assert.match(m.checksum, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(m.source, /^\s*(?:DROP|DELETE|INSERT|TRUNCATE)\b/im);
  const contract = { ...BILLING_CONTRACT, ...ADMIN_CATALOG_CONTRACT,
    billing_plans: { ...BILLING_CONTRACT.billing_plans, columns: [...BILLING_CONTRACT.billing_plans.columns, 'is_public'], checks: [...BILLING_CONTRACT.billing_plans.checks, 'ck_billing_plan_public'] } };
  const connection = { execute: async (sql, [table]) => {
    const spec = contract[table];
    if (sql.includes('information_schema.columns')) return [spec.columns.map((name) => ({ name, nullable: (spec.nullable || []).includes(name) ? 'YES' : 'NO', type: spec.enums?.[name] || (name.endsWith('_idr') || name === 'organization_id' ? 'bigint unsigned' : 'varchar(191)') }))];
    if (sql.includes('information_schema.statistics')) return [Object.entries(spec.indexes).flatMap(([name, columns]) => columns.map((columnName) => ({ name, columnName, nonUnique: name === 'PRIMARY' || name.startsWith('uq_') ? 0 : 1 })))];
    if (sql.includes('information_schema.table_constraints')) return [(spec.checks || []).map((name) => ({ name }))];
    return [Object.entries(spec.keys).map(([name,[columnName,targetTable,targetColumn]]) => ({ name,columnName,targetTable,targetColumn }))];
  } };
  assert.deepEqual(await validateBillingSchema(connection, { adminCatalog: true }), []);
  const missing = await validateBillingSchema({ execute: async () => [[]] }, { adminCatalog: true });
  assert.ok(missing.some((d) => d.table === 'platform_admins')); assert.ok(missing.some((d) => d.constraint === 'ck_billing_plan_public'));
  const bootstrap = await readFile(new URL('../scripts/platform-admin.mjs', import.meta.url), 'utf8');
  assert.match(bootstrap, /connectApprovedNonProduction/); assert.match(bootstrap, /ACTIVE_USER_REQUIRED/);
});

test('public and admin clients use server catalog without tenant identity claims or hardcoded fallback', async () => {
  const controller = new AbortController();
  const plans = [{ code: 'starter', monthlyPriceIdr: '178000' }];
  assert.deepEqual(await loadPublicPlans(controller.signal, async (url, options) => {
    assert.equal(url, '/api/plans'); assert.equal(options.cache, 'no-store'); assert.equal(options.signal, controller.signal);
    return { ok: true, json: async () => ({ currency: 'IDR', plans }) };
  }), plans);
  await assert.rejects(loadPublicPlans(null, async () => ({ ok: false })), /belum dapat/);
  for (const status of [401,403,409,503]) await assert.rejects(adminCatalogRequest({}, async () => ({ ok: false, status })), (e) => e.status === status);
  const body = input();
  await adminCatalogRequest({ code: 'starter', body }, async (url, options) => {
    assert.equal(url, '/api/admin/billing/plans/starter'); assert.equal(options.method, 'PUT');
    assert.deepEqual(JSON.parse(options.body), body); assert.equal(options.credentials, 'same-origin');
    return { ok: true, json: async () => ({}) };
  });
});
