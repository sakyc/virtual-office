import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { dashboardLinkDestination } from '../src/react/spa-navigation.js';

const location = { href: 'http://localhost:5173/dashboard/usage', origin: 'http://localhost:5173', pathname: '/dashboard/usage', search: '' };
function click(href, options = {}, linkOptions = {}) {
  return { button: 0, target: { closest: () => ({ href, target: '', hasAttribute: () => false, ...linkOptions }) }, ...options };
}
test('dashboard links navigate in-document, retain query/hash and canonicalize old app links', () => {
  assert.equal(dashboardLinkDestination(click('/dashboard/billing'), location), '/dashboard/billing');
  assert.equal(dashboardLinkDestination(click('/app/board?filter=draft#items'), location), '/dashboard/board?filter=draft#items');
  assert.equal(dashboardLinkDestination(click('/admin/models'), location), '/admin/models');
  for (const event of [click('/dashboard/jobs', { ctrlKey: true }), click('/dashboard/jobs', { metaKey: true }),
    click('/dashboard/jobs', { shiftKey: true }), click('/dashboard/jobs', { altKey: true }), click('/dashboard/jobs', { button: 1 }),
    click('/dashboard/jobs', { defaultPrevented: true }), click('/dashboard/jobs', {}, { target: '_blank' }),
    click('/dashboard/jobs', {}, { target: '_top' }), click('/dashboard/jobs', {}, { hasAttribute: () => true }),
    click('https://other.example/dashboard'), click('javascript:alert(1)'), click('/api/export'), click('/dashboard/usage#usage-request-logs'),
    { button: 0, target: {} }]) assert.equal(dashboardLinkDestination(event, location), null);
});

test('pending dashboard navigation renders persistent shell and skeleton, never previous page content', async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  const profile = { user: { id: 1, displayName: 'Tester', email: 'tester@example.test' }, activeWorkspace: { id: 2, name: 'Workspace valid', role: 'owner', organization: { id: 3, name: 'Organization' } }, workspaces: [] };
  try {
    const { DashboardPage } = await vite.ssrLoadModule('/src/react/design-pages.jsx');
    for (const section of ['overview', 'usage', 'settings', 'team', 'billing', 'board']) {
      const html = renderToStaticMarkup(React.createElement(DashboardPage, { section, verifiedProfile: profile, sessionPending: true, onNavigate() {} }));
      assert.match(html, /Navigasi dashboard/);
      assert.match(html, /Workspace valid/);
      assert.match(html, /dashboard-route-loading/);
      assert.match(html, /Memuat halaman/);
      assert.doesNotMatch(html, /usage-request-logs|auth-password|work-item-detail/);
    }
    const { SessionBoundary } = await vite.ssrLoadModule('/src/react/session-boundary.jsx');
    const blocked = renderToStaticMarkup(React.createElement(SessionBoundary, { path: '/dashboard', preserveShell: true, onNavigate() {} }, React.createElement('p', {}, 'SECRET CONTENT')));
    assert.match(blocked, /Memeriksa sesi dan workspace/);
    assert.doesNotMatch(blocked, /SECRET CONTENT/);
  } finally { await vite.close(); }
});
