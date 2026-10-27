import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { pageTitle } from '../src/react/page-title.js';

test('browser titles identify Karyora on public, customer and admin routes', () => {
  assert.equal(pageTitle('/'), 'Karyora — Kantor AI untuk Tim Anda');
  assert.equal(pageTitle('/login'), 'Masuk | Karyora');
  assert.equal(pageTitle('/dashboard/office'), 'Kantor 3D | Karyora');
  assert.equal(pageTitle('/admin/models'), 'Kelola model AI | Karyora');
  assert.equal(pageTitle('/unknown'), 'Halaman tidak ditemukan | Karyora');
});

test('both HTML entries use the shipped Karyora favicon without touching scene entry points', async () => {
  for (const path of ['index.html', 'office.html']) {
    const html = await readFile(new URL('../' + path, import.meta.url), 'utf8');
    assert.match(html, /<title>[^<]*Karyora[^<]*<\/title>/);
    assert.match(html, /href="\/branding\/karyora-mark.svg"/);
    assert.doesNotMatch(html, /Virtual Office|data:image/);
    assert.match(html, path === 'index.html' ? /src="\/src\/react\/main.jsx"/ : /src="\/src\/main.js"/);
  }
  const svg = await readFile(new URL('../public/branding/karyora-mark.svg', import.meta.url), 'utf8');
  assert.match(svg, /viewBox="0 0 32 32"/);
  assert.match(svg, /#6254F4/);
  assert.doesNotMatch(svg, /<script|<foreignObject|https?:\/\/(?!www.w3.org)/);
});

test('landing, onboarding and dashboard splash render the same decorative Karyora mark', async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    for (const [file, name] of [['landing', 'LandingSplash'], ['onboarding', 'OnboardingSplash'], ['dashboard', 'DashboardSplash']]) {
      const module = await vite.ssrLoadModule('/src/react/reference/' + file + '.jsx');
      const html = renderToStaticMarkup(React.createElement(module[name], { vals: { splashOn: true, splashClass: 'splash' } }));
      assert.match(html, /Karyora/);
      assert.match(html, /src="\/branding\/karyora-mark.svg"/);
      assert.match(html, /alt="" aria-hidden="true"/);
      assert.doesNotMatch(html, /Virtual Office/);
    }
    for (const file of ['auth-pages.jsx', 'admin-billing.jsx', 'reference/landing.jsx', 'reference/onboarding.jsx', 'reference/dashboard.jsx']) {
      const source = await readFile(new URL('../src/react/' + file, import.meta.url), 'utf8');
      assert.match(source, /<BrandMark/);
      assert.doesNotMatch(source, /Virtual Office/);
    }
  } finally { await vite.close(); }
});
