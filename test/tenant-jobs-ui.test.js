import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTenantJobsUI } from '../src/tenant-jobs-ui.js';
import { createWorkApi, WorkspaceApiError } from '../src/react/work-api.js';

class Element {
  constructor(tag) { this.tag = tag; this.nodeType = 1; this.children = []; this.events = {}; this.value = ''; this.hidden = false; this.disabled = false; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, listener) { this.events[name] = listener; }
  set textContent(value) { this.children = [String(value)]; }
  get textContent() { return this.children.map(c => typeof c === 'string' ? c : c.textContent).join(''); }
  async emit(name) { await this.events[name]?.({ preventDefault() {} }); }
}
function fixture(t, api) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: tag => new Element(tag) } });
  t.after(() => original ? Object.defineProperty(globalThis, 'document', original) : delete globalThis.document);
  const root = new Element('section'), ui = createTenantJobsUI({ root, api });
  t.after(() => ui.dispose());
  const all = (node = root) => [node, ...node.children.filter(c => typeof c !== 'string').flatMap(c => all(c))];
  const find = (tag, text) => all().find(n => n.tag === tag && (!text || n.textContent.includes(text)));
  return { root, ui, find, all };
}
test('office client save and history use only existing session-scoped dashboard endpoints', async t => {
  const calls = [];
  const api = createWorkApi(async (path, options) => {
    calls.push({ path, options });
    if (path === '/api/dashboard/clients' && options.method === 'POST') return Response.json({ id: 12, ...JSON.parse(options.body) }, { status: 201 });
    if (path === '/api/dashboard/clients') return Response.json({ clients: [{ id: 3, name: 'Existing' }] });
    if (path === '/api/dashboard/jobs') return Response.json({ jobs: [{ agentId: 'agent-a', jobType: 'My task', status: 'done' }, { agentId: 'agent-b', jobType: 'Other agent task', status: 'done' }] });
    throw Error('Legacy endpoint called');
  });
  const f = fixture(t, api); await f.ui.setAgent('agent-a');
  assert.match(f.root.textContent, /My task/); assert.doesNotMatch(f.root.textContent, /Other agent task/);
  f.find('input').value = 'Nuansua'; f.find('textarea').value = 'Konten aplikasi barista';
  await f.find('form').emit('submit');
  assert.match(f.root.textContent, /Klien “Nuansua” disimpan/);
  const save = calls.find(c => c.options.method === 'POST'); assert.deepEqual(JSON.parse(save.options.body), { name: 'Nuansua', brief: 'Konten aplikasi barista' });
  assert.equal(save.options.credentials, 'same-origin'); assert.equal(save.options.headers['x-access-code'], undefined);
  assert.ok(calls.every(c => c.path.startsWith('/api/dashboard/')));
  assert.equal(f.find('select').value, '12');
  assert.match(f.root.textContent, /Buat tugas untuk agen ini/);
  assert.ok(f.all().some(n => n.href === '/dashboard/templates' && n.target === '_top'));
});
test('office task history renders a safe reason for failed jobs and labels old failures as unknown', async t => {
  const f = fixture(t, { clients: async () => ({ clients: [] }), jobs: async () => ({ jobs: [
    { agentId: 'a', title: 'Carousel', status: 'failed', failure: { code: 'FX_UNAVAILABLE', message: 'Kurs USD ke rupiah belum tersedia.' } },
    { agentId: 'a', title: 'Old task', status: 'failed' },
  ] }) });
  await f.ui.setAgent('a');
  assert.match(f.root.textContent, /Kurs USD ke rupiah belum tersedia/);
  assert.match(f.root.textContent, /Penyebab rinci belum tercatat/);
});

test('session revocation clears visible data and prevents further client writes without permissive fallback', async t => {
  let writes = 0;
  const f = fixture(t, { clients: async () => ({ clients: [{ id: 3, name: 'Private client' }] }), jobs: async () => ({ jobs: [] }), createClient: async () => { writes++; throw new WorkspaceApiError('Sesi berakhir.', 401); } });
  await f.ui.setAgent('a'); f.find('input').value = 'New'; await f.find('form').emit('submit');
  assert.doesNotMatch(f.root.textContent, /Private client/); assert.match(f.root.textContent, /Sesi berakhir/); assert.equal(f.find('button', 'Simpan').disabled, true);
  await f.find('form').emit('submit'); assert.equal(writes, 1);
});
test('late selections and disposed panels cannot restore previous agent data', async t => {
  let resolveFirst, requests = 0;
  const f = fixture(t, { clients: async () => ({ clients: [] }), jobs: async () => {
    if (++requests === 1) return new Promise(resolve => { resolveFirst = resolve; });
    return { jobs: [{ agentId: 'b', jobType: 'Latest selection', status: 'done' }] };
  } });
  const first = f.ui.setAgent('a'); await f.ui.setAgent('b');
  resolveFirst({ jobs: [{ agentId: 'a', jobType: 'Stale selection', status: 'done' }] }); await first;
  assert.match(f.root.textContent, /Latest selection/); assert.doesNotMatch(f.root.textContent, /Stale selection/);
  f.ui.dispose(); const before = f.root.textContent; await f.ui.setAgent('a'); assert.equal(f.root.textContent, before);
});
test('office bootstrap selects tenant panel without changing fail-closed legacy API gate', async () => {
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /tenantOffice \? createTenantJobsUI : createJobsUI/);
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  assert.match(server, /const requireTenantApi = lifecycle\.handler\(createTenantGate\(\{ getPool: \(\) => pool \}\)\)/);
});
