import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { preferredDark, saveTheme, THEME_KEY } from '../src/react/theme-preference.js';

test('saved light/dark choice overrides system preference and unavailable storage is safe', () => {
  const storage = value => ({ getItem: key => { assert.equal(key, THEME_KEY); return value; } });
  assert.equal(preferredDark({ storage: storage('light'), media: () => ({ matches: true }) }), false);
  assert.equal(preferredDark({ storage: storage('dark'), media: () => ({ matches: false }) }), true);
  assert.equal(preferredDark({ storage: storage('invalid'), media: () => ({ matches: true }) }), true);
  assert.equal(preferredDark({ storage: { getItem() { throw Error(); } }, media: () => ({ matches: true }) }), true);
  assert.equal(preferredDark({ media() { throw Error(); } }), false);
  let saved;
  saveTheme(true, { setItem: (key, value) => { saved = [key, value]; } });
  assert.deepEqual(saved, [THEME_KEY, 'dark']);
  saveTheme(false, { setItem() { throw Error(); } });
});

test('login and register include decorative ambient background and an accessible theme button without changing forms', async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { AuthPage } = await vite.ssrLoadModule('/src/react/auth-pages.jsx');
    for (const register of [false, true]) {
      const html = renderToStaticMarkup(React.createElement(AuthPage, { register, onNavigate() {} }));
      assert.match(html, /class="auth-page"/);
      assert.match(html, /class="auth-atmosphere" aria-hidden="true"/);
      assert.equal((html.match(/class="auth-orb auth-orb-/g) || []).length, 3);
      assert.match(html, /type="button" class="auth-theme-toggle" aria-label="Aktifkan mode gelap" aria-pressed="false"/);
      assert.match(html, /Memeriksa sesi/);
      assert.match(html, register ? /Mulai kantor virtualmu/ : /Selamat datang kembali/);
    }
    const { LandingDesign } = await vite.ssrLoadModule('/src/react/reference/landing.jsx');
    assert.equal(new LandingDesign({ dark: false }).state.dark, false);
    assert.equal(new LandingDesign({ dark: true }).state.dark, true);
    const css = await readFile(new URL('../src/react/auth-appearance.css', import.meta.url), 'utf8');
    assert.match(css, /\.auth-page\.dark/);
    assert.match(css, /prefers-reduced-motion/);
    assert.match(css, /pointer-events: none/);
  } finally { await vite.close(); }
});
