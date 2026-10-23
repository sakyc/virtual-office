import test from 'node:test';
import assert from 'node:assert/strict';

async function clientFixture(t) {
  const descriptors = new Map(['location', 'localStorage', 'addEventListener', 'fetch'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const state = { scope: 'a'.repeat(64), status: 200, output: 'data: {"t":"Halo"}\n\ndata: {"done":true}\n\n', requests: [], events: [] };
  Object.defineProperty(globalThis, 'location', { value: { search: '?tenant=1' }, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem() { throw new Error('must not read legacy storage'); }, setItem() { throw new Error('must not write legacy storage'); } }, configurable: true });
  globalThis.addEventListener = (event, fn) => state.events.push({ event, fn });
  globalThis.fetch = async (url, options) => {
    state.requests.push({ url, options });
    if (url.endsWith('/context')) return Response.json({ scope: state.scope, available: true });
    return state.status === 200 ? new Response(state.output) : Response.json({ error: 'Rejected' }, { status: state.status });
  };
  const chat = await import(`../src/chat.js?test=${Math.random()}`);
  return { state, chat };
}

test('embedded chat uses same-origin session endpoint, strips old history, and parses SSE', async (t) => {
  const { state, chat } = await clientFixture(t);
  assert.deepEqual(chat.getHistory('roy'), []);
  await chat.prepareChat();
  const messages = Array.from({ length: 23 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `Pesan ${i}` }));
  let text;
  assert.equal(await chat.streamChat('roy', messages, { onText: (_, full) => text = full }), 'Halo');
  assert.equal(text, 'Halo');
  const request = state.requests.at(-1); assert.equal(request.url, '/api/office/chat'); assert.equal(request.options.credentials, 'same-origin');
  assert.equal(request.options.headers['x-access-code'], undefined);
  const payload = JSON.parse(request.options.body); assert.equal(payload.messages.length, 19); assert.equal(payload.messages[0].role, 'user'); assert.equal(payload.scope, state.scope);
  chat.setHistory('roy', messages); assert.equal(chat.getHistory('roy').length, 23);
  state.events.find(({ event }) => event === 'pagehide').fn(); assert.deepEqual(chat.getHistory('roy'), []);
});

test('workspace change refuses to send prior conversation and cannot restore old scoped history', async (t) => {
  const { state, chat } = await clientFixture(t);
  await chat.prepareChat(); const oldScope = chat.getChatScope();
  const messages = [{ role: 'user', content: 'Private old workspace' }]; chat.setHistory('roy', messages, oldScope);
  state.scope = 'b'.repeat(64);
  await assert.rejects(chat.streamChat('roy', messages, { onText() {} }), { resetHistory: true });
  assert.ok(state.requests.every(({ url }) => url.endsWith('/context')));
  assert.deepEqual(chat.getHistory('roy'), []);
  chat.setHistory('roy', messages, oldScope); assert.deepEqual(chat.getHistory('roy'), []);
});

test('revocation clears history; interrupted and failed streams never save successful replies', async (t) => {
  const { state, chat } = await clientFixture(t);
  await chat.prepareChat(); const messages = [{ role: 'user', content: 'Hello' }]; chat.setHistory('roy', messages);
  state.status = 401; await assert.rejects(chat.streamChat('roy', messages, { onText() {} }), { code: 401, resetHistory: true });
  assert.deepEqual(chat.getHistory('roy'), []);
  state.status = 200; await chat.prepareChat(); state.output = 'data: {"t":"Partial"}\n\n';
  await assert.rejects(chat.streamChat('roy', messages, { onText() {} }), /terputus/);
  state.output = 'data: {"error":"Service unavailable"}\n\n';
  await assert.rejects(chat.streamChat('roy', messages, { onText() {} }), /Service unavailable/);
});
