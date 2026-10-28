import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createWorkLifecycle } from '../server/work-lifecycle.js';

function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
const turn = () => new Promise(resolve => setImmediate(resolve));
const closedServer = { close: callback => callback() };

test('shutdown waits for admitted work and child jobs before closing resources exactly once', async () => {
  const life = createWorkLifecycle(), parent = deferred(), child = deferred();
  let calls = 0, resources = 0, childWork;
  const work = life.track(async () => {
    await parent.promise;
    childWork = life.track(async () => { calls++; await child.promise; });
  });
  const shutdown = life.stop({ server: closedServer, closeResources: async () => { resources++; }, timeoutMs: 1000 });
  assert.equal(life.stopping, true);
  assert.equal(life.stop({ server: closedServer, closeResources: () => assert.fail() }), shutdown);
  assert.equal(resources, 0);
  parent.resolve(); await work;
  assert.equal(life.active, 1);
  assert.equal(resources, 0);
  child.resolve(); await childWork;
  assert.deepEqual(await shutdown, { drained: true, active: 0 });
  assert.equal(calls, 1);
  assert.equal(resources, 1);
});

test('timeout never replays work, refunds money, or closes resources beneath active work', async () => {
  const life = createWorkLifecycle(), gate = deferred();
  let calls = 0, resources = 0;
  const work = life.track(async () => { calls++; await gate.promise; });
  const result = await life.stop({ server: closedServer, closeResources: async () => { resources++; }, timeoutMs: 10 });
  assert.deepEqual(result, { drained: false, active: 1 });
  assert.equal(calls, 1);
  assert.equal(resources, 0);
  gate.resolve(); await work; await turn();
  assert.equal(resources, 0);
});

test('rejected work releases its lease and preserves the original error for caller handling', async () => {
  const life = createWorkLifecycle();
  await assert.rejects(life.track(() => { throw Error('fixture'); }), /fixture/);
  assert.equal(life.active, 0);
  assert.equal((await life.stop({ server: closedServer, closeResources: async () => {} })).drained, true);
});

async function fixture(t) {
  const life = createWorkLifecycle();
  const app = express(); app.use(life.middleware);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { life, app, server, url: `http://127.0.0.1:${server.address().port}` };
}

test('HTTP 202 can finish while a detached paid-job stand-in remains tracked until completion', async t => {
  const { life, app, server, url } = await fixture(t);
  const gate = deferred(); let calls = 0, closed = false, background;
  app.post('/job', life.handler(async (_req, res) => {
    background = life.track(async () => { calls++; await gate.promise; });
    res.status(202).json({ accepted: true });
  }));
  assert.equal((await fetch(`${url}/job`, { method: 'POST' })).status, 202);
  const stopping = life.stop({ server, closeResources: async () => { closed = true; }, timeoutMs: 1000 });
  assert.equal(closed, false);
  gate.resolve(); await background;
  assert.equal((await stopping).drained, true);
  assert.equal(calls, 1);
  assert.equal(closed, true);
});

test('disconnect during admission does not lose a late scheduled job during shutdown', async t => {
  const { life, app, server, url } = await fixture(t);
  const admitted = deferred(), gate = deferred(), finished = deferred();
  let calls = 0, resources = false;
  app.post('/job', life.handler(async (req, res) => {
    res.once('close', admitted.resolve);
    res.writeHead(200, { 'Content-Type': 'text/plain' }); res.write('admitted');
    await gate.promise; // Simulates DB reservation finishing after disconnect.
    void life.track(async () => { calls++; await finished.promise; }).catch(() => {});
    res.end();
  }));
  // A non-pooling client ensures no unrelated speculative reconnect socket.
  await new Promise((resolve, reject) => {
    const req = request(`${url}/job`, { method: 'POST', agent: false }, res => {
      res.once('data', () => { req.destroy(); resolve(); });
    });
    req.on('error', error => error.code === 'ECONNRESET' ? resolve() : reject(error));
    req.end();
  });
  await admitted.promise;
  const stopping = life.stop({ server, closeResources: async () => { resources = true; }, timeoutMs: 1000 });
  assert.equal(resources, false);
  gate.resolve(); await turn(); await turn();
  assert.equal(calls, 1);
  assert.equal(resources, false);
  finished.resolve(); assert.equal((await stopping).drained, true);
});

test('draining middleware rejects new requests with retry guidance before downstream work', async t => {
  const { life, app, server, url } = await fixture(t);
  let calls = 0;
  app.get('/probe', (_req, res) => { calls++; res.end(); });
  // Keep socket open to simulate an already connected proxy while draining.
  const gate = deferred(); const work = life.track(() => gate.promise);
  const stopping = life.stop({ server: closedServer, closeResources: async () => {}, timeoutMs: 1000 });
  const response = await fetch(`${url}/probe`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'SERVER_DRAINING');
  assert.equal(response.headers.get('retry-after'), '30');
  assert.equal(response.headers.get('connection'), 'close');
  assert.equal(calls, 0);
  gate.resolve(); await work; await stopping;
});

test('active SSE and post-response settlement finish before resource shutdown', async t => {
  const { life, app, server, url } = await fixture(t);
  const output = deferred(), settlement = deferred(), responseSent = deferred();
  let closed = false;
  app.get('/stream', life.handler(async (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: first\n\n');
    await output.promise;
    res.end('data: done\n\n');
    responseSent.resolve();
    await settlement.promise;
  }));
  const response = await fetch(`${url}/stream`);
  const reader = response.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /first/);
  const stopping = life.stop({ server, closeResources: async () => { closed = true; }, timeoutMs: 1000 });
  assert.equal(closed, false);
  output.resolve(); await responseSent.promise;
  assert.match(new TextDecoder().decode((await reader.read()).value), /done/);
  assert.equal(closed, false);
  settlement.resolve(); assert.equal((await stopping).drained, true);
  assert.equal(closed, true);
});

test('production wires background jobs, chat handlers, signals and a longer PM2 kill deadline', async () => {
  const index = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const dashboard = await readFile(new URL('../server/dashboard-routes.js', import.meta.url), 'utf8');
  const pm2 = await readFile(new URL('../deploy/ecosystem.config.cjs', import.meta.url), 'utf8');
  assert.match(index, /process.on\('SIGTERM', shutdown\)/);
  assert.match(index, /process.on\('SIGINT', shutdown\)/);
  assert.match(index, /timeoutMs: 300000/);
  assert.match(index, /await pool\?\.end\(\)/);
  assert.match(index, /trackHandler: lifecycle.handler, runBackground: lifecycle.track/g);
  assert.match(dashboard, /runBackground\(async \(\) => \{\s*try \{ await runTenantRevision/);
  assert.match(dashboard, /runBackground\(\(\) => runTenantJob/);
  assert.match(pm2, /kill_timeout: 330000/);
});
