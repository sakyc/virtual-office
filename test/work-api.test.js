import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkApi, workPermissions } from '../src/react/work-api.js';

test('approval uses the explicit tenant approval endpoint and no shared-access fallback', async () => {
  const calls = [];
  const api = createWorkApi(async (...args) => { calls.push(args); return new Response(null, { status: 204 }); });
  await api.approve(7);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/dashboard/items/7/approve');
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].credentials, 'same-origin');
  assert.equal(calls[0][1].body, undefined);
});

test('job submission whitelists job inputs without sending identity or tenant claims', async () => {
  let body;
  const api = createWorkApi(async (path, options) => {
    assert.equal(path, '/api/dashboard/jobs'); assert.equal(options.method, 'POST');
    body = JSON.parse(options.body); return Response.json({ jobId: 12 }, { status: 202 });
  });
  await api.createJob({ jobType: 'brief_analysis', clientId: null, params: { brief: 'Fixture' }, organizationId: 999, workspaceId: 999, userId: 999, role: 'owner' });
  assert.deepEqual(body, { jobType: 'brief_analysis', clientId: null, params: { brief: 'Fixture' } });
});

test('unauthenticated and forbidden responses fail closed without retrying or sample data', async () => {
  for (const status of [401, 403]) {
    let calls = 0;
    const api = createWorkApi(async () => { calls++; return Response.json({ error: 'private diagnostic' }, { status }); });
    await assert.rejects(api.jobs(), (error) => error.status === status && !error.message.includes('private'));
    assert.equal(calls, 1);
  }
});

test('provider/database errors and raw transport errors are not shown to the user', async () => {
  for (const fetcher of [async () => Response.json({ error: 'mysql://secret@host' }, { status: 503 }), async () => { throw new Error('mysql://secret@host'); }]) {
    await assert.rejects(createWorkApi(fetcher).items(), (error) => !/secret|mysql/.test(error.message));
  }
});

test('aborting a request preserves cancellation and never retries', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  const api = createWorkApi(async (path, options) => { calls++; assert.equal(options.signal, controller.signal); throw new DOMException('Aborted', 'AbortError'); });
  await assert.rejects(api.jobs(controller.signal), { name: 'AbortError' }); assert.equal(calls, 1);
});

test('detail, history and soft deletion use only tenant API and validated item IDs', async () => {
  const paths = [];
  const api = createWorkApi(async (path, options) => { paths.push([path, options.method]); return options.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({}); });
  await api.detail(5); await api.revisions(5); await api.remove(5);
  assert.deepEqual(paths, [['/api/dashboard/items/5', 'GET'], ['/api/dashboard/items/5/revisions', 'GET'], ['/api/dashboard/items/5', 'DELETE']]);
  for (const id of [0, -1, '1/../../auth', 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => api.detail(id), { status: 400 });
  assert.equal(paths.length, 3);
});

test('malformed successful response is an error, not a successful empty list', async () => {
  const api = createWorkApi(async () => new Response('not JSON', { status: 200 }));
  await assert.rejects(api.jobs(), { status: 502 });
});

test('UI permissions mirror existing server roles and grant nothing to platform admin', () => {
  assert.deepEqual(workPermissions('owner'), { create: true, approve: true, remove: true });
  assert.deepEqual(workPermissions('admin'), { create: true, approve: true, remove: true });
  assert.deepEqual(workPermissions('member'), { create: false, approve: true, remove: false });
  for (const role of ['viewer', 'platform_admin', undefined]) assert.deepEqual(workPermissions(role), { create: false, approve: false, remove: false });
});

test('revision and rejection send only version and reason, never client identity or role', async () => {
  const calls = [];
  const api = createWorkApi(async (path, options) => { calls.push({ path, options }); return path.endsWith('/revise') ? Response.json({ status: 'revising' }, { status: 202 }) : new Response(null, { status: 204 }); });
  const body = { reason: 'Feedback fixture', version: 3, workspaceId: 999, userId: 999, role: 'owner' };
  await api.revise(7, body); await api.reject(7, body);
  assert.deepEqual(calls.map((call) => call.path), ['/api/dashboard/items/7/revise', '/api/dashboard/items/7/reject']);
  for (const call of calls) assert.deepEqual(JSON.parse(call.options.body), { reason: 'Feedback fixture', version: 3 });
});

test('stale-version conflicts are displayed without automatically resubmitting', async () => {
  let calls = 0;
  const api = createWorkApi(async () => { calls++; return Response.json({ error: 'Versi item telah berubah.' }, { status: 409 }); });
  await assert.rejects(api.revise(7, { reason: 'Fixture', version: 1 }), { status: 409, message: 'Versi item telah berubah.' });
  assert.equal(calls, 1);
});
