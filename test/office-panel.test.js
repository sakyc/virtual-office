import test from 'node:test';
import assert from 'node:assert/strict';

// Small DOM double for the real panel module; no browser/provider/database needed.
class Element {
  constructor() {
    this.children = []; this.events = new Map(); this.style = { setProperty() {} };
    this.dataset = {}; this.value = ''; this.scrollHeight = 100; this.scrollTop = 0; this.clientHeight = 100;
    this.classList = { add: (value) => { this.className = `${this.className || ''} ${value}`; } };
  }
  set innerHTML(value) { this.children = []; this.html = value; this.text = ''; }
  get innerHTML() { return this.html || ''; }
  set textContent(value) { this.children = []; this.text = value; this.html = ''; }
  get textContent() { return (this.text || '') + this.children.map((child) => child.textContent).join(''); }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, listener) { this.events.set(name, [...(this.events.get(name) || []), listener]); }
  async emit(name, event = {}) { for (const listener of this.events.get(name) || []) await listener({ preventDefault() {}, ...event }); }
  querySelector(selector) {
    return this.children.find((child) => (child.className || '').split(' ').includes(selector.slice(1)))
      || this.children.map((child) => child.querySelector(selector)).find(Boolean) || null;
  }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
  focus() {}
}

let activeFetch;
async function fixture(t, fetchImpl) {
  const globals = ['location', 'localStorage', 'document', 'addEventListener', 'matchMedia', 'fetch', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const saved = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const elements = new Map();
  const get = (id) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  Object.defineProperty(globalThis, 'location', { value: { search: '?tenant=1' }, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem() { throw new Error('Legacy storage forbidden'); }, setItem() { throw new Error('Legacy storage forbidden'); } }, configurable: true });
  globalThis.document = { getElementById: get, createElement: () => new Element(), querySelectorAll: () => [], body: new Element() };
  globalThis.addEventListener = () => {};
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame = clearTimeout;
  activeFetch = fetchImpl;
  globalThis.fetch = (...args) => activeFetch(...args);
  const { createPanel } = await import('../src/panel.js');
  const chat = await import('../src/chat.js');
  const agents = [];
  const panel = createPanel({ onSelect() {}, onClose() {}, onStatus() {}, onNeedCode() { throw new Error('No shared access fallback'); }, isDemo: () => false, jobs: { setAgent: (id) => agents.push(id) } });
  t.after(() => panel.close());
  return { panel, get, agents, chat };
}
const context = (available = true, scope = 'a'.repeat(64)) => Response.json({ scope, available });

test('first selection always renders agent identity even when AI is unavailable; switching never retains the prior header', async (t) => {
  let requests = 0;
  const f = await fixture(t, async () => { requests++; return context(false); });
  const opening = f.panel.open('melati');
  assert.equal(f.get('who-name').textContent, 'Melati Handayani');
  assert.equal(f.get('avatar').textContent, 'MH');
  assert.match(f.get('messages').textContent, /Memeriksa/);
  await opening;
  assert.match(f.get('messages').textContent, /belum dikonfigurasi/);
  assert.equal(f.get('btn-send').disabled, true);
  await f.panel.open('kirana');
  assert.equal(f.get('who-name').textContent, 'Kirana Dewanti');
  assert.equal(f.get('avatar').textContent, 'KD');
  assert.match(f.get('who-role').textContent, /Reporting/);
  assert.deepEqual(f.agents, ['melati', 'kirana']);
  assert.equal(requests, 2);
});

test('typing and reset cannot bypass failed availability checks; reset retries and recovers if service becomes ready', async (t) => {
  let available = false, requests = 0;
  const f = await fixture(t, async () => { requests++; return context(available); });
  await f.panel.open('kirana');
  f.get('input').value = 'Hello'; await f.get('input').emit('input');
  assert.equal(f.get('btn-send').disabled, true); assert.equal(f.get('input').disabled, true);
  await f.get('composer').emit('submit'); assert.equal(requests, 1);
  await f.get('btn-reset').emit('click'); assert.equal(requests, 2);
  assert.match(f.get('messages').textContent, /belum dikonfigurasi/);
  assert.equal(f.get('who-name').textContent, 'Kirana Dewanti');
  available = true; await f.get('btn-reset').emit('click');
  assert.equal(requests, 3); assert.equal(f.get('input').disabled, false);
  assert.doesNotMatch(f.get('messages').textContent, /belum dikonfigurasi/);
});

test('late selection response and close cannot overwrite the most recently selected agent', async (t) => {
  const responses = [];
  const f = await fixture(t, () => new Promise((resolve) => responses.push(resolve)));
  const first = f.panel.open('melati'); const second = f.panel.open('kirana');
  responses[1](context()); await second;
  assert.equal(f.panel.current, 'kirana'); assert.equal(f.get('who-name').textContent, 'Kirana Dewanti');
  responses[0](Response.json({ error: 'Rejected' }, { status: 403 })); await first;
  assert.equal(f.get('who-name').textContent, 'Kirana Dewanti');
  assert.doesNotMatch(f.get('messages').textContent, /tidak memiliki izin/);
  const third = f.panel.open('melati'); f.panel.close();
  responses[2](context()); await third;
  assert.equal(f.panel.current, null);
});

test('success keeps histories per agent; changing scope never paints the previous workspace history', async (t) => {
  let scope = 'b'.repeat(64);
  const f = await fixture(t, async () => context(true, scope));
  await f.panel.open('melati');
  f.chat.setHistory('melati', [{ role: 'user', content: 'Only Melati history' }]);
  await f.panel.open('melati'); assert.match(f.get('messages').textContent, /Only Melati history/);
  await f.panel.open('kirana'); assert.doesNotMatch(f.get('messages').textContent, /Only Melati history/);
  scope = 'c'.repeat(64);
  const changed = f.panel.open('melati');
  assert.match(f.get('messages').textContent, /Memeriksa/);
  assert.doesNotMatch(f.get('messages').textContent, /Only Melati history/);
  await changed; assert.doesNotMatch(f.get('messages').textContent, /Only Melati history/);
});

test('switching agents cancels an unfinished send without leaving a dangling user message in history', async (t) => {
  let sending = false, aborted = false;
  const f = await fixture(t, (url, options) => {
    if (url.endsWith('/context')) return Promise.resolve(context());
    sending = true;
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => {
      aborted = true; reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' }));
    }, { once: true }));
  });
  await f.panel.open('melati');
  const completed = [{ role: 'user', content: 'Earlier question' }, { role: 'assistant', content: 'Earlier answer' }];
  f.chat.setHistory('melati', completed);
  f.get('input').value = 'Unfinished new question';
  const submit = f.get('composer').emit('submit');
  await new Promise((done) => setImmediate(done)); assert.equal(sending, true);
  await f.panel.open('kirana'); await submit;
  assert.equal(aborted, true); assert.deepEqual(f.chat.getHistory('melati'), completed);
  assert.equal(f.get('who-name').textContent, 'Kirana Dewanti');
  assert.doesNotMatch(f.get('messages').textContent, /Unfinished new question/);
});
