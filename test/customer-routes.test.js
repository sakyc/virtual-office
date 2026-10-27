import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalCustomerPath } from '../src/react/customer-routes.js';
import { redirectForProtectedPath, destinationForProfile } from '../src/react/auth-flow.js';

test('legacy customer URLs resolve to dashboard, preserving subpaths/query/hash without touching admin or API routes', () => {
  for (const suffix of ['', '/', '/office', '/jobs', '/board', '/team', '/billing', '/clients', '/settings', '/workers', '/reference', '?tab=usage#prices']) {
    assert.equal(canonicalCustomerPath('/app' + suffix), '/dashboard' + suffix);
    assert.equal(canonicalCustomerPath('/dashboard' + suffix), '/dashboard' + suffix);
  }
  for (const path of ['/application', '/apple', '/api/dashboard', '/admin/billing', '/login', '/', 'https://example.invalid/app', '//example.invalid/app']) assert.equal(canonicalCustomerPath(path), path);
});

test('dashboard aliases do not bypass login, workspace selection or onboarding', () => {
  const fresh = { user: { id: 1 }, workspaces: [] };
  const ready = { ...fresh, activeWorkspace: { id: 3 }, workspaces: [{ id: 3 }] };
  assert.equal(destinationForProfile(ready), '/dashboard');
  for (const path of ['/app', '/app/office', '/dashboard', '/dashboard/office', '/dashboard/billing']) {
    assert.equal(redirectForProtectedPath(null, canonicalCustomerPath(path)), '/login');
    assert.equal(redirectForProtectedPath(fresh, canonicalCustomerPath(path)), '/onboarding');
    assert.equal(redirectForProtectedPath(ready, canonicalCustomerPath(path)), null);
  }
});

test('router replaces legacy history entries and retains query/hash; office navigation remains origin/source/path gated', async () => {
  const router = await readFile(new URL('../src/react/main.jsx', import.meta.url), 'utf8');
  assert.match(router, /history\.replaceState\(history\.state, '', canonical \+ location\.search \+ location\.hash\)/);
  assert.match(router, /path === '\/dashboard'/);
  assert.match(router, /path\.startsWith\('\/dashboard\/'\)/);
  assert.match(router, /path === '\/admin\/billing'/);
  const office = await readFile(new URL('../src/react/office-page.jsx', import.meta.url), 'utf8');
  assert.match(office, /event\.source === frame\.contentWindow && event\.origin === location\.origin/);
  assert.match(office, /\['\/dashboard\/board', '\/dashboard\/jobs', '\/dashboard\/billing'\]\.includes\(target\)/);
});
