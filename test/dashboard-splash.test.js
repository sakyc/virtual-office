import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';

test('dashboard splash runs once per document, not when navigation remounts the dashboard', async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { DashboardDesign } = await vite.ssrLoadModule('/src/react/reference/dashboard.jsx');
    let runs = 0;
    const initial = new DashboardDesign({ splashOnce: true });
    initial.runSplash = () => runs++;
    assert.equal(initial.state.sp, 'on'); initial.componentDidMount(); initial.componentWillUnmount();
    const nextPage = new DashboardDesign({ splashOnce: true });
    nextPage.runSplash = () => runs++;
    assert.equal(nextPage.state.sp, 'off'); nextPage.componentDidMount();
    assert.equal(runs, 1);
    const returnFromOffice = new DashboardDesign({ splashOnce: true });
    assert.equal(returnFromOffice.state.sp, 'off');
    // Explicit manual replay remains available, without changing navigation policy.
    returnFromOffice.setState = update => Object.assign(returnFromOffice.state, update);
    returnFromOffice.runSplash(); assert.equal(returnFromOffice.state.sp, 'on'); returnFromOffice.componentWillUnmount();
    assert.equal(new DashboardDesign({ splash: false, splashOnce: true }).state.sp, 'off');
    // Design previews can still opt into their existing independent splash.
    assert.equal(new DashboardDesign({}).state.sp, 'on');
    const live = await readFile(new URL('../src/react/design-pages.jsx', import.meta.url), 'utf8');
    assert.match(live, /<DashboardDesign decorate=\{decorate\} splashOnce/);
  } finally { await vite.close(); }
});
