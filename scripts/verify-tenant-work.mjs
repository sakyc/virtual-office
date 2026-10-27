// Browser integration with in-memory HTTP fixtures only. No DB, Auth0 or AI provider is contacted.
// Run: node --experimental-websocket scripts/verify-tenant-work.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const output = mkdtempSync(join(tmpdir(), 'virtual-office-work-qa-'));
const qaPort = Number(process.env.WORK_QA_PORT || 5187);
const calls = [], checks = [], errors = [];
const state = { role: 'owner', revoked: false, unavailable: false, approvalDenied: false, authDisabled: false, revisionFailure: false, reviewConflict: false, jobs: [], items: [], revisions: [{ id: 2, version: 1, reason: 'Umpan balik fixture', createdAt: '2026-10-23T09:05:00Z' }] };
const profile = () => ({ user: { id: 9, displayName: 'Pengguna Fixture', email: 'fixture@example.test' }, activeWorkspace: { id: 8, name: 'Workspace Fixture', role: state.role, organization: { id: 3, name: 'Organisasi Fixture' } } });
const server = await createServer({ server: { host: '127.0.0.1', port: qaPort, strictPort: true }, plugins: [{ name: 'mock-tenant-work', configureServer(app) {
  app.middlewares.use((req, res, next) => {
    if (!/^\/(api|auth)\//.test(req.url)) return next();
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      calls.push({ path: req.url, method: req.method, body: raw ? JSON.parse(raw) : null });
      res.setHeader('Content-Type', 'application/json');
      const json = (body, status = 200) => { res.statusCode = status; res.end(JSON.stringify(body)); };
      if (state.revoked) return json({ error: 'Session revoked' }, 401);
      if (req.url === '/auth/me') return state.authDisabled ? json({ code: 'AUTHENTICATION_DISABLED' }, 503) : json(profile());
      if (req.url === '/auth/logout') { state.revoked = true; return json({}); }
      if (state.unavailable) return json({ error: 'mysql://must-never-be-rendered' }, 503);
      if (req.url === '/api/dashboard/jobs' && req.method === 'GET') return json({ jobs: state.jobs });
      if (req.url === '/api/dashboard/task-options') return json({ canCreate: ['owner','admin'].includes(state.role), agents: [{ id: '10000000-0000-4000-8000-000000000001', name: 'Agen Fixture', role: 'Penulis' }], templates: [], builtins: [], clients: [], models: [{ id: 'fixture-model', label: 'Fixture', costLabel: 'Hemat' }] });
      if (req.url === '/api/dashboard/jobs' && req.method === 'POST') {
        if (!['owner', 'admin'].includes(state.role)) return json({ error: 'Permission denied' }, 403);
        state.jobs = [{ id: 45, jobType: 'brief_analysis', agentId: 'bagas', status: 'done', createdAt: '2026-10-23T09:00:00Z', clientName: 'Client Fixture' }];
        state.items = [{ id: 11, type: 'brief', title: 'Hasil fixture', status: 'draft', agentId: 'bagas', version: 2, updatedAt: '2026-10-23T09:10:00Z' }];
        return json({ jobId: 45, jobType: 'brief_analysis' }, 202);
      }
      if (req.url === '/api/dashboard/clients') return json({ clients: [{ id: 6, name: 'Client Fixture' }] });
      if (req.url === '/api/dashboard/items') return json({ items: state.items });
      if (req.url === '/api/dashboard/items/11/revisions') return json({ revisions: state.revisions });
      if (req.url === '/api/dashboard/items/11' && req.method === 'GET') return json({ item: { ...state.items[0], agentId: 'bagas', updatedAt: '2026-10-23T09:10:00Z', content: { fields: [{ label: 'Ringkasan', kind: 'text', value: '<img src=x onerror=alert(1)> Konten fixture' }, { label: 'Poin', kind: 'list', value: ['Satu', 'Dua'] }, { label: 'Kode', kind: 'code', value: 'const fixture = true;' }] } } });
      if (['/api/dashboard/items/11/reject', '/api/dashboard/items/11/revise'].includes(req.url) && req.method === 'POST') {
        if (state.role === 'viewer') return json({ error: 'Permission denied' }, 403);
        const body = JSON.parse(raw); const item = state.items[0];
        if (state.reviewConflict || body.version !== item.version || item.status === 'revising') return json({ error: 'Versi item telah berubah. Muat ulang sebelum meninjau kembali.' }, 409);
        if (req.url.endsWith('/reject')) { item.status = 'rejected'; item.rejectReason = body.reason; res.statusCode = 204; return res.end(); }
        item.status = 'revising'; item.lastError = null;
        // Simulate the asynchronous provider completion, without any provider/network call.
        setTimeout(() => {
          if (state.revisionFailure) { item.status = 'draft'; item.lastError = 'Revisi gagal. Konten sebelumnya tetap tersimpan. Muat ulang lalu coba lagi secara manual.'; }
          else { state.revisions.unshift({ id: 3, version: item.version, reason: body.reason, createdAt: '2026-10-23T09:20:00Z' }); item.version++; item.status = 'draft'; item.rejectReason = null; }
        }, 1000);
        return json({ itemId: 11, status: 'revising' }, 202);
      }
      if (req.url === '/api/dashboard/items/11/approve' && req.method === 'POST') {
        if (state.approvalDenied || state.role === 'viewer') return json({ error: 'Permission denied' }, 403);
        state.items[0].status = 'approved'; res.statusCode = 204; return res.end();
      }
      if (req.url === '/api/dashboard/overview') return json({ metrics: { totalJobs: state.jobs.length, activeJobs: 0, approvedItems: 0, totalClients: 1 }, recentJobs: [] });
      return json({ error: 'Unexpected fixture endpoint' }, 404);
    });
  });
} }] });

await server.listen();
const executable = process.env.CHROME_BIN || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
let browser, socket;
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
try {
  assert.ok(existsSync(executable), 'Chrome is required for local browser verification; set CHROME_BIN if needed');
  browser = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${join(output, 'browser')}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars'], { windowsHide: true, stdio: 'ignore' });
  const portFile = join(output, 'browser', 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await delay(100);
  const port = readFileSync(portFile, 'utf8').split('\n')[0];
  const target = await fetch(`http://127.0.0.1:${port}/json/new`, { method: 'PUT' }).then((response) => response.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.addEventListener('open', done); socket.addEventListener('error', reject); });
  let sequence = 0; const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) { const task = pending.get(message.id); pending.delete(message.id); message.error ? task.reject(message.error) : task.resolve(message.result); }
    else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Browser evaluation failed');
    return result.result.value;
  };
  const wait = async (expression) => {
    for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error(`Timed out waiting: ${expression}`);
  };
  const click = (text) => evaluate(`(()=>{const e=[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing control: '+${JSON.stringify(text)});e.click();return true})()`);
  const fill = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing field');const proto=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}));return true})()`);
  const open = async (path) => { await send('Page.navigate', { url: `http://127.0.0.1:${qaPort}${path}` }); await wait('!!document.querySelector(".reference-dashboard")'); await wait('!document.querySelector(".splash:not(.out)")'); };
  const check = (name) => { checks.push(name); console.log(`PASS ${name}`); };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

  await open('/dashboard/jobs'); await wait('document.body.textContent.includes("Belum ada perintah di tab ini.")');
  assert.equal(await evaluate('document.querySelectorAll(".sbar").length'), 1);
  assert.ok(!(await evaluate('document.body.textContent.includes("Q4 launch narrative")')));
  check('empty live jobs use original shell and no sample records');
  await click('Perintah baru'); await wait('!!document.querySelector(".work-dialog select")');
  await fill('.work-dialog select', '10000000-0000-4000-8000-000000000001');
  await fill('.work-dialog input', 'Tugas pengujian fixture');
  await fill('.work-dialog label:last-of-type select', 'fixture-model');
  await fill('.work-dialog textarea', 'Brief pengujian fixture');
  await evaluate(`(()=>{const e=[...document.querySelectorAll('.work-dialog button')].find(e=>e.textContent==='Kirim tugas');e.click();e.click();return true})()`);
  await wait('document.body.textContent.includes("Perintah #45 diterima") && !!document.querySelector(".work-job")');
  const submissions = calls.filter((call) => call.path === '/api/dashboard/jobs' && call.method === 'POST');
  assert.equal(submissions.length, 1); assert.equal(submissions[0].body.instructions, 'Brief pengujian fixture'); assert.equal(submissions[0].body.mode, 'workspace');
  assert.equal(submissions[0].body.workspaceId, undefined); assert.equal(submissions[0].body.userId, undefined);
  check('job composer submits once through tenant API and shows resulting job');

  await click('Lihat board'); await wait('document.body.textContent.includes("Umpan balik fixture")');
  assert.equal(await evaluate('location.pathname'), '/dashboard/board');
  assert.equal(await evaluate('document.querySelectorAll(".work-detail img").length'), 0);
  assert.ok(await evaluate('document.body.textContent.includes("<img src=x onerror=alert(1)>")'));
  assert.ok(await evaluate('document.body.textContent.includes("const fixture = true;")'));
  check('board loads real structured detail and revision history; HTML is escaped');
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(output, 'board-desktop.png'), Buffer.from(shot.data, 'base64'));
  await click('Setujui'); await wait('document.body.textContent.includes("Item berhasil disetujui.") && document.body.textContent.includes("Belum ada item di tab ini.")');
  assert.equal(calls.filter((call) => call.path === '/api/dashboard/items/11/approve' && call.method === 'POST').length, 1);
  await evaluate(`document.querySelectorAll('[role="tab"]')[1].click();true`);
  await wait('!!document.querySelector(".work-detail .work-content")');
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent==='Setujui').disabled`), true);
  check('approval uses correct URL, refreshes board, and disables repeat approval');

  await click('Tolak'); await wait('!!document.querySelector(".work-review-form textarea")');
  await fill('.work-review-form textarea', 'Belum sesuai brief fixture'); await click('Konfirmasi penolakan');
  await wait('document.body.textContent.includes("Item ditolak. Alasan tersimpan.")');
  await wait('document.querySelectorAll("[role=tab]").length === 4');
  await evaluate(`document.querySelectorAll('[role="tab"]')[2].click();true`);
  await wait('document.body.textContent.includes("Belum sesuai brief fixture") && !!document.querySelector(".work-detail .work-content")');
  assert.equal(calls.filter((call) => call.path.endsWith('/reject') && call.method === 'POST').length, 1);
  check('rejection form saves and displays the reason without deleting content');

  state.reviewConflict = true;
  await click('Minta revisi'); await fill('.work-review-form textarea', 'Perjelas ringkasan fixture'); await click('Kirim revisi');
  await wait('document.body.textContent.includes("Versi item telah berubah")');
  check('stale version displays conflict without automatic retry');
  state.reviewConflict = false;
  await click('Kirim revisi');
  await wait('document.body.textContent.includes("Permintaan revisi diterima") && !!document.querySelector("[role=tablist]")');
  await evaluate(`document.querySelectorAll('[role="tab"]')[0].click();true`);
  await wait('document.body.textContent.includes("Perjelas ringkasan fixture") && document.body.textContent.includes("Versi 3")');
  assert.equal(calls.filter((call) => call.path.endsWith('/revise')).length, 2);
  check('successful revision advances version and preserves the previous version in history');

  state.revisionFailure = true;
  await click('Minta revisi'); await fill('.work-review-form textarea', 'Revisi gagal fixture'); await click('Kirim revisi');
  await wait('document.body.textContent.includes("Revisi gagal. Konten sebelumnya tetap tersimpan")');
  assert.ok(await evaluate('document.body.textContent.includes("Versi 3")'));
  state.revisionFailure = false;
  check('revision failure leaves content/version intact and shows a recoverable error');

  state.role = 'viewer'; await open('/dashboard/jobs'); await wait('!!document.querySelector(".work-job")');
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(e=>e.textContent==='Perintah baru')`), false);
  await open('/dashboard/board'); await evaluate(`document.querySelectorAll('[role="tab"]')[3].click();true`);
  await wait('!!document.querySelector(".work-detail .work-content")');
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent==='Setujui').disabled`), true);
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent==='Minta revisi').disabled`), true);
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent==='Tolak').disabled`), true);
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(e=>e.textContent==='Hapus item')`), false);
  check('viewer sees results but cannot create, approve or delete');

  await evaluate(`document.querySelector('[aria-label="Ganti mode tampilan"]').click();true`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: false });
  const mobileShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(output, 'board-mobile-dark.png'), Buffer.from(mobileShot.data, 'base64'));
  assert.ok(await evaluate('document.querySelector(".reference-dashboard").classList.contains("dark")'));
  check('same dashboard supports dark mode and mobile viewport');

  state.role = 'owner'; state.items[0].status = 'draft'; state.approvalDenied = true;
  await open('/dashboard/board'); await wait('!!document.querySelector(".work-detail .work-content")');
  await click('Setujui'); await wait('document.body.textContent.includes("Anda tidak memiliki akses")');
  assert.equal(await evaluate('document.querySelectorAll(".work-detail").length'), 0);
  check('server permission denial removes actionable board content');
  state.approvalDenied = false;
  await open('/dashboard/jobs'); await wait('!!document.querySelector(".work-job")');
  state.revoked = true;
  await wait('document.body.textContent.includes("Sesi berakhir")');
  assert.equal(await evaluate('document.querySelectorAll(".work-job").length'), 0);
  check('revocation is detected on refresh; stale jobs are cleared and login is offered');

  state.revoked = false; state.unavailable = true;
  await open('/dashboard/jobs'); await wait('document.body.textContent.includes("Layanan workspace belum tersedia")');
  assert.ok(!(await evaluate('document.body.textContent.includes("mysql://")')));
  assert.equal(await evaluate('document.querySelectorAll(".work-job").length'), 0);
  state.unavailable = false;
  await click('Coba lagi'); await wait('!!document.querySelector(".work-job")');
  check('service failure has sanitized error, no sample fallback, and explicit retry');

  await click('Lihat board'); await wait('!!document.querySelector(".work-detail .work-content")');
  const before = calls.filter((call) => call.path === '/api/dashboard/jobs').length;
  await delay(8500);
  assert.equal(calls.filter((call) => call.path === '/api/dashboard/jobs').length, before);
  check('jobs polling stops after route unmount');
  state.authDisabled = true;
  await open('/dashboard/board'); await wait('document.body.textContent.includes("Login belum aktif di server lokal")');
  assert.ok(await evaluate('document.body.textContent.includes("AUTH0_ENABLED=1")'));
  assert.equal(await evaluate('document.querySelectorAll(".work-detail").length'), 0);
  check('disabled Auth0 explains the setup prerequisite instead of creating a fake session');
  state.authDisabled = false;
  await open('/dashboard/jobs'); await wait('!!document.querySelector(".work-job")');
  await evaluate(`document.querySelector('[aria-label="Keluar"]').click();true`);
  await wait('location.pathname === "/"');
  assert.ok(calls.some((call) => call.path === '/auth/logout' && call.method === 'POST'));
  check('existing POST logout flow remains intact');

  assert.ok(calls.every((call) => call.path.startsWith('/api/dashboard/') || call.path.startsWith('/auth/')), 'No legacy shared-access API requests');
  assert.deepEqual(errors, [], 'No browser runtime exceptions');
  writeFileSync(join(output, 'report.json'), JSON.stringify({ checks, errors, calls }, null, 2));
  console.log(JSON.stringify({ output, passed: checks.length, browserErrors: errors.length, databaseConnections: 0 }));
} finally { socket?.close(); browser?.kill(); await server.close(); }
