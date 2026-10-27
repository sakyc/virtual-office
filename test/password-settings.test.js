import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { passwordChangeErrors, changePassword } from '../src/react/password-change.js';

const values = { currentPassword: 'Lentera!9Kantor', newPassword: 'Mentari!7Ruang', confirmation: 'Mentari!7Ruang' };
test('password change validates individual fields without changing input values', async () => {
  assert.deepEqual(passwordChangeErrors(values), {});
  assert.ok(passwordChangeErrors({ ...values, currentPassword: '' }).currentPassword);
  assert.ok(passwordChangeErrors({ ...values, confirmation: 'different' }).confirmation);
  assert.ok(passwordChangeErrors({ ...values, newPassword: values.currentPassword }).newPassword);
  assert.ok(passwordChangeErrors({ ...values, newPassword: 'weak' }).newPassword);
  assert.ok(passwordChangeErrors({ ...values, newPassword: 'Mentari!7' + '界'.repeat(90) }).newPassword);
  await assert.rejects(changePassword({ ...values, confirmation: 'different' }, () => assert.fail('invalid input must not send')));
});
test('password transport sends only old/new secrets and preserves inputs on all failures', async () => {
  const snapshot = { ...values };
  for (const status of [400, 401, 403, 429, 503]) {
    await assert.rejects(changePassword(values, async (url, options) => {
      assert.equal(url, '/api/account/password');
      assert.equal(options.credentials, 'same-origin');
      assert.deepEqual(JSON.parse(options.body), { currentPassword: values.currentPassword, newPassword: values.newPassword });
      return { ok: false, status, json: async () => ({ error: 'private database internals must not render' }) };
    }), error => !error.message.includes('private database'));
    assert.deepEqual(values, snapshot);
  }
  await assert.rejects(changePassword(values, async () => { throw new TypeError('network secret'); }), /Koneksi terputus/);
  assert.deepEqual(values, snapshot);
  await assert.rejects(changePassword(values, async () => ({ ok: false, status: 400, json: async () => ({ code: 'CURRENT_PASSWORD_INCORRECT' }) })), error => Boolean(error.fields.currentPassword));
});
test('only explicit JSON success is treated as a completed password change', async () => {
  await changePassword(values, async () => ({ ok: true, json: async () => ({ next: '/login' }) }));
  await assert.rejects(changePassword(values, async () => ({ ok: true, json: async () => { throw Error('HTML'); } })), /Respons layanan tidak valid/);
});
test('password settings render three accessible eye buttons and inline-error associations', async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { PasswordSettings } = await vite.ssrLoadModule('/src/react/password-settings.jsx');
    const html = renderToStaticMarkup(React.createElement(PasswordSettings));
    assert.equal((html.match(/class="password-eye"/g) || []).length, 3);
    assert.equal((html.match(/type="password"/g) || []).length, 3);
    assert.match(html, /Tampilkan kata sandi lama/);
    assert.match(html, /Tampilkan kata sandi baru/);
    assert.match(html, /Tampilkan konfirmasi kata sandi baru/);
    assert.match(html, /aria-controls=/);
    assert.match(html, /noValidate=""/i);
  } finally { await vite.close(); }
});
