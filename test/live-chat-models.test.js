import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createLiveChatModelCatalog } from '../server/live-chat-models.js';
import { installOfficeChatRoutes } from '../server/office-chat.js';
import { installConversationRoutes } from '../server/chat-history.js';

const initialTime = Date.parse('2026-10-25T00:00:00Z');
const tariff = (input = '1', output = '5') => ({ inputUsdPerMillion: input, outputUsdPerMillion: output,
  cacheReadUsdPerMillion: '0.1', maxInputTokens: 200000, maxOutputTokens: 8000,
  approvalReference: 'test:approved', verifiedAt: '2026-10-24T00:00:00Z', validUntil: '2026-10-26T00:00:00Z' });
function fixture(overrides = {}) {
  const state = { time: initialTime, calls: [], rows: [
    { model: 'test-haiku', enabled: 1, tariff: tariff() },
    { model: 'test-sonnet', enabled: 1, tariff: tariff('3', '15') },
    { model: 'test-opus', enabled: 1, tariff: tariff('5', '25') },
  ], fail: false };
  const catalog = createLiveChatModelCatalog({ models: { team: 'test-haiku', leader: 'test-sonnet' },
    now: () => state.time, readTariffs: async () => { if (state.fail) throw new Error('private SQL'); return state.rows; },
    client: { models: { list: async (params, options) => {
      state.calls.push({ params, options });
      return { data: [
        { id: 'test-haiku', display_name: 'Test Haiku', line: 'haiku' },
        { id: 'test-sonnet', display_name: 'Test Sonnet', line: 'sonnet' },
        { id: 'test-opus', display_name: 'Test Opus', line: 'opus' },
        { id: 'unpriced-model', display_name: 'Unpriced' },
      ], has_more: false };
    } } }, ...overrides });
  return { state, catalog };
}

test('provider catalog exposes more than two real metadata IDs with cost and task guidance', async () => {
  const { catalog, state } = fixture(); await catalog.refresh();
  const list = catalog.list(); assert.equal(list.length, 4);
  assert.deepEqual(list.slice(0, 3).map(m => [m.costLabel, m.selectable]), [['Hemat', true], ['Seimbang', true], ['Premium', true]]);
  assert.match(list[2].description, /penalaran mendalam/);
  assert.match(list[2].description, /jumlah token yang sama/);
  assert.equal(list[3].selectable, false); assert.equal(list[3].costLabel, 'Belum aktif');
  assert.equal(catalog.resolve('test-opus', {}), 'test-opus');
  assert.equal(catalog.resolve(null, { modelTier: 'leader' }), 'test-sonnet');
  assert.equal(catalog.validate(null), null);
  for (const id of ['forged-model', 'unpriced-model']) assert.throws(() => catalog.validate(id), { status: 409 });
  list[0].selectable = false; assert.equal(catalog.validate('test-haiku'), 'test-haiku');
  assert.deepEqual(state.calls[0].options, { timeout: 3000, maxRetries: 0 });
  await catalog.refresh(); assert.equal(state.calls.length, 1, 'metadata is cached');
});

test('disabled, expired, future, malformed and incompatible tariffs cannot select or send', async () => {
  const { catalog, state } = fixture(); await catalog.refresh();
  for (const update of [
    { enabled: 0 }, { tariff: { ...tariff(), validUntil: '2026-10-24T01:00:00Z' } },
    { tariff: { ...tariff(), verifiedAt: '2026-10-25T01:00:00Z' } },
    { tariff: '{bad json' }, { tariff: { ...tariff(), maxOutputTokens: 100 } },
  ]) {
    state.rows[0] = { model: 'test-haiku', enabled: 1, tariff: tariff(), ...update };
    await catalog.refresh(); assert.equal(catalog.list()[0].selectable, false);
    assert.throws(() => catalog.resolve(null, { modelTier: 'team' }), { status: 409 });
  }
  state.rows[0] = { model: 'test-haiku', enabled: 1, tariff: tariff() }; await catalog.refresh();
  state.time = Date.parse(tariff().validUntil);
  assert.throws(() => catalog.validate('test-haiku'), { status: 409 }, 'expiry also checked between refreshes');
});

test('tariff read failures fail closed without disclosing SQL and can recover', async () => {
  const { catalog, state } = fixture(); await catalog.refresh(); state.fail = true;
  await assert.rejects(catalog.refresh(), error => error.status === 409 && !error.message.includes('SQL'));
  assert.throws(() => catalog.validate('test-opus'), { status: 409 });
  state.fail = false; await catalog.refresh(); assert.equal(catalog.validate('test-opus'), 'test-opus');
});

test('provider outage does not invent models or prices; approved manual IDs still work', async () => {
  let calls = 0;
  const { catalog, state } = fixture({ client: { models: { list: async () => { calls++; throw new Error('secret provider error'); } } } });
  await Promise.all([catalog.refresh(), catalog.refresh()]);
  assert.equal(calls, 1); assert.equal(catalog.list().length, 3);
  assert.equal(catalog.validate('test-opus'), 'test-opus');
  assert.doesNotMatch(JSON.stringify(catalog.list()), /secret/);
  await catalog.refresh(); assert.equal(calls, 1);
  state.time += 60001; await catalog.refresh(); assert.equal(calls, 2);
});

test('discovery follows bounded pagination, rejects invalid IDs and respects retired/output limits', async () => {
  const calls = [];
  const { catalog } = fixture({ client: { models: { list: async params => {
    calls.push(params);
    return params.after_id ? { data: [{ id: 'test-opus', lifecycle: 'retired' }, { id: '../forged' }, { id: 'test-sonnet', max_tokens: 100 }], has_more: false }
      : { data: [{ id: 'test-haiku' }], has_more: true, last_id: 'test-haiku' };
  } } } });
  await catalog.refresh(); assert.equal(calls.length, 2); assert.equal(calls[1].after_id, 'test-haiku');
  assert.equal(catalog.list().length, 3);
  for (const id of ['test-opus', 'test-sonnet']) assert.throws(() => catalog.validate(id), { status: 409 });
  let loops = 0;
  const { catalog: malformed } = fixture({ client: { models: { list: async () => ({ data: [], has_more: true, last_id: `page-${++loops}` }) } } });
  await malformed.refresh(); assert.equal(loops, 10);
});

test('HTTP context publishes expanded catalog and disabling a tariff denies before any AI call', async t => {
  const { catalog, state } = fixture(); let providerCalls = 0;
  const app = express(); app.use(express.json());
  installOfficeChatRoutes(app, { modelCatalog: catalog,
    requireTenant(req, res, next) { req.authPrincipal = { userId: 1, sessionId: 2 }; req.tenantContext = { organizationId: 3, workspaceId: 4, role: 'member' }; next(); },
    client: { messages: { stream() { providerCalls++; throw new Error('Must not dispatch'); } } },
    appOrigin: 'http://localhost:5173', models: { team: 'test-haiku', leader: 'test-sonnet' },
    resolveAgent: async () => ({ id: 'test-agent', modelTier: 'team' }), rateLimit: (req, res, next) => next(), dailyCap: (req, res, next) => next(),
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/office/chat`;
  const response = await fetch(`${url}/context`), context = await response.json();
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(context.models.length, 3);
  assert(!context.models.some(model => model.id === 'unpriced-model'));
  state.rows[0].enabled = 0;
  const hidden = await (await fetch(`${url}/context`)).json();
  assert(!hidden.models.some(model => model.id === 'test-haiku'));
  assert(!Object.hasOwn(hidden.defaultModels, 'team'));
  assert((await catalog.adminList()).some(model => model.model === 'test-haiku' && model.enabled === false), 'admin can still find and re-enable the hidden model');
  const send = await fetch(url, { method: 'POST', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: 'test-agent', scope: context.scope, messages: [{ role: 'user', content: 'test' }] }) });
  assert.equal(send.status, 409); assert.match((await send.json()).error, /tarif aktif/); assert.equal(providerCalls, 0);
  state.rows[0].enabled = 1;
  assert((await (await fetch(`${url}/context`)).json()).models.some(model => model.id === 'test-haiku'));
});

test('conversation writes refresh the same catalog; history and rename remain readable without tariffs', async t => {
  const { catalog, state } = fixture(); const writes = [];
  const agentId = '11111111-1111-4111-8111-111111111111';
  const app = express(); app.use(express.json());
  installConversationRoutes(app, { modelCatalog: catalog, appOrigin: 'http://localhost:5173',
    requireTenant(req, res, next) { req.authPrincipal = { userId: 1 }; req.tenantContext = { organizationId: 2, workspaceId: 3 }; next(); },
    permitted: (req, res, next) => next(), store: {
      async create(context, agentId, modelId) { writes.push(modelId); return { modelId }; },
      async update(context, id, change) { writes.push(change); return { updated: true }; },
      async read() { return { messages: [{ content: 'Saved history' }] }; },
    },
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/office/conversations`;
  const request = (path, method, body) => fetch(url + path, { method,
    headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const created = await request('', 'POST', { agentId, modelId: 'test-opus' });
  assert.equal(created.status, 200); assert.equal((await created.json()).modelId, 'test-opus');
  state.rows[2].enabled = 0;
  for (const modelId of ['test-opus', 'forged-client-model']) {
    assert.equal((await request('/saved', 'PATCH', { modelId })).status, 409);
  }
  assert.equal(writes.length, 1);
  state.fail = true;
  assert.equal((await request('/saved', 'PATCH', { title: 'Rename still works' })).status, 200);
  assert.equal((await fetch(url + '/saved')).status, 200);
});
