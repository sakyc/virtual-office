import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { applyOfficeWorkloads, normalizeWorkerLoads, startOfficeWorkloadSync, WORKLOAD_MESSAGE } from '../src/office-workloads.js';

test('office bridge verifies parent source and exact origin; resets absent and unavailable agents', () => {
  const parentWindow = {}, currentWindow = {}, calls = [];
  const context = { origin: 'http://localhost:5173', parentWindow, currentWindow, agentIds: ['roy', 'rina'], setStatus: (...args) => calls.push(args) };
  const event = { source: parentWindow, origin: context.origin, data: { type: WORKLOAD_MESSAGE, available: true, workers: [{ agentId: 'roy', activeJobs: 1, totalJobs: 2 }] } };
  for (const forged of [{ ...event, source: {} }, { ...event, origin: 'https://attacker.invalid' }]) assert.equal(applyOfficeWorkloads(forged, context), false);
  assert.equal(calls.length, 0);
  assert.equal(applyOfficeWorkloads(event, context), true);
  assert.deepEqual(calls.splice(0), [['roy', 'working'], ['rina', 'idle']]);
  assert.equal(applyOfficeWorkloads({ ...event, data: { ...event.data, workers: [] } }, context), true);
  assert.deepEqual(calls.splice(0), [['roy', 'idle'], ['rina', 'idle']]);
  assert.equal(applyOfficeWorkloads({ ...event, data: { ...event.data, available: false, workers: [] } }, context), true);
  assert.deepEqual(calls.splice(0), [['roy', 'unknown'], ['rina', 'unknown']]);
  assert.equal(applyOfficeWorkloads(event, { ...context, parentWindow: currentWindow }), false);
});

test('workload validation rejects malformed/negative/duplicate counts and strips non-summary content', () => {
  for (const value of [null, [{ agentId: 'roy', activeJobs: -1, totalJobs: 1 }], [{ agentId: 'roy', activeJobs: 2, totalJobs: 1 }], [{ agentId: 'roy', activeJobs: '1', totalJobs: 1 }], [{ agentId: 'roy', activeJobs: 1, totalJobs: 1 }, { agentId: 'roy', activeJobs: 0, totalJobs: 0 }]]) assert.throws(() => normalizeWorkerLoads(value));
  assert.deepEqual(normalizeWorkerLoads([{ agentId: 'roy', activeJobs: 1, totalJobs: 2, secret: 'not forwarded', content: 'private' }]), [{ agentId: 'roy', activeJobs: 1, totalJobs: 2 }]);
});

test('office polling uses scoped session API, does not overlap, and aborts/cleans up on unmount', async () => {
  let finish, scheduled, cancelled, signal;
  const messages = [], states = [];
  const sync = startOfficeWorkloadSync({
    send: (message) => messages.push(message), onState: (state) => states.push(state),
    fetchImpl: async (url, options) => { assert.equal(url, '/api/dashboard/workers'); assert.equal(options.credentials, 'same-origin'); signal = options.signal; return new Promise((resolve) => { finish = resolve; }); },
    schedule: (callback, ms) => { scheduled = callback; assert.equal(ms, 20000); return 3; }, cancel: (id) => { cancelled = id; },
  });
  await scheduled();
  finish({ ok: true, json: async () => ({ workers: [] }) });
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(messages, [{ type: WORKLOAD_MESSAGE, available: true, workers: [] }]);
  assert.equal(states[0].activeJobs, 0);
  sync.stop(); assert.equal(signal.aborted, true); assert.equal(cancelled, 3);
  await sync.refresh(); assert.equal(messages.length, 1);
});

test('failed office polling clears stale statuses and late responses cannot update an unmounted office', async () => {
  const messages = [], states = [];
  let finish;
  const sync = startOfficeWorkloadSync({ send: (value) => messages.push(value), onState: (value) => states.push(value), fetchImpl: async () => ({ ok: false, status: 401 }), schedule: () => 1, cancel() {} });
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(messages, [{ type: WORKLOAD_MESSAGE, available: false, workers: [] }]); assert.equal(states[0].status, 'unavailable'); sync.stop();
  const pending = startOfficeWorkloadSync({ send: (value) => messages.push(value), onState() { throw new Error('must not update'); }, fetchImpl: async () => new Promise((resolve) => { finish = resolve; }), schedule: () => 1, cancel() {} });
  pending.stop(); finish({ ok: true, json: async () => ({ workers: [] }) });
  await new Promise((done) => setImmediate(done)); assert.equal(messages.length, 1);
});

test('React office uses lifecycle cleanup and tenant mode never persists or loads shared legacy chat history', () => {
  const host = readFileSync(new URL('../src/react/office-page.jsx', import.meta.url), 'utf8');
  const chat = readFileSync(new URL('../src/chat.js', import.meta.url), 'utf8');
  assert.match(host, /runner\.stop\(\)/); assert.match(host, /onLoad=/); assert.match(host, /postMessage\(message, location\.origin\)/);
  assert.match(host, /office.html\?tenant=1/);
  assert.match(chat, /histories = tenantOffice \? \{\}/); assert.match(chat, /if \(!tenantOffice\) safe.set/);
  assert.match(chat, /if \(tenantOffice\) throw new Error/);
});
