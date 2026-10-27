import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { modelStatus, modelStatusUpdate, modelTariffRecord } from '../src/react/admin-models-data.js';
import { billingOperationRequest } from '../src/react/billing-operations-data.js';

const model = { model: 'fixture-model', label: 'Example Model', version: 0, enabled: true, selectable: true, source: 'default', costClass: 'balanced', discovered: true,
  tariff: { inputUsdPerMillion: '2', outputUsdPerMillion: '10', cacheReadUsdPerMillion: '0.20', maxInputTokens: 200000, maxOutputTokens: 8000,
    verifiedAt: '2026-10-25T00:00:00Z', validUntil: '2026-11-24T00:00:00Z' } };

test('model status payload preserves the displayed tariff/version and requires reason plus explicit confirmation', () => {
  const data = modelStatusUpdate(model, { reason: '  Operator maintenance  ', requestId: 'fixture-request', confirmed: true });
  assert.equal(data.expectedVersion, 0); assert.equal(data.enabled, false); assert.equal(data.reason, 'Operator maintenance');
  assert.deepEqual(data.tariff, model.tariff); assert.equal(model.enabled, true);
  assert(!Object.hasOwn(data, 'userId')); assert(!Object.hasOwn(data, 'organizationId'));
  for (const change of [{ confirmed: false }, { reason: '' }]) assert.throws(() => modelStatusUpdate(model, { reason: 'Maintenance', requestId: 'fixture', confirmed: true, ...change }));
  assert.throws(() => modelStatusUpdate({ ...model, tariff: null }, { reason: 'Maintenance', requestId: 'fixture', confirmed: true }));
});

test('model edit seeds provider limits but never invents missing prices; status distinguishes disabled from incomplete pricing', () => {
  const unpriced = { ...model, enabled: false, selectable: false, tariff: null, maxInputTokens: 200000, maxOutputTokens: 8000 };
  const record = modelTariffRecord(unpriced, Date.parse('2026-10-25T00:00:00Z'));
  assert.equal(record.tariff.inputUsdPerMillion, ''); assert.equal(record.tariff.maxInputTokens, 200000);
  assert.equal(record.model, model.model); assert.equal(record.version, 0); assert.equal(record.enabled, false);
  assert.equal(modelStatus(model), 'Aktif'); assert.equal(modelStatus(unpriced), 'Belum ada tarif');
  assert.equal(modelStatus({ ...model, enabled: false, selectable: false }), 'Dinonaktifkan');
  assert.equal(modelStatus({ ...model, selectable: false }), 'Tarif perlu diperiksa');
});

test('admin model browser transport is bounded to same-origin existing endpoints and does not allow deletes or external URLs', async () => {
  let calls = 0;
  await billingOperationRequest('/api/admin/models', {}, async (path, options) => {
    calls++; assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store'); assert.equal(options.method, 'GET'); return Response.json({ models: [] });
  });
  assert.equal(calls, 1);
  for (const [path, method] of [['https://evil.invalid/api/admin/models','GET'], ['/api/admin/models','DELETE'], ['/api/admin/models?role=platform_admin','GET']]) {
    await assert.rejects(billingOperationRequest(path, { method }, async () => { throw new Error('Must not dispatch'); }));
  }
});

test('model page renders safe labels, read-only IDs, explicit status confirmation, and no destructive delete control', async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { ModelTable, ModelStatusDialog, AdminModels } = await vite.ssrLoadModule('/src/react/admin-models.jsx');
    const table = renderToStaticMarkup(React.createElement(ModelTable, { models: [
      { ...model, label: '<script>bad</script>' }, { ...model, model: 'missing', enabled: false, selectable: false, tariff: null },
    ], onEdit() {}, onToggle() {} }));
    for (const label of ['&lt;script&gt;', 'Tarif awal tersimpan', 'Input $2', 'Nonaktifkan', 'Konfigurasi tarif', 'Belum ada tarif']) assert(table.includes(label), label);
    assert(!table.includes('<script>')); assert(table.includes('disabled=""')); assert(!table.includes('Hapus'));
    const confirm = renderToStaticMarkup(React.createElement(ModelStatusDialog, { model, onClose() {}, onSaved() {}, onDenied() {} }));
    for (const label of ['Nonaktifkan Example Model', 'Alasan perubahan', 'Chat lama tetap', 'Tidak ada harga yang diubah', 'type="checkbox"']) assert(confirm.includes(label), label);
    assert(!confirm.includes('checked=""'));
    const { TariffEditor } = await vite.ssrLoadModule('/src/react/admin-billing-operations.jsx');
    const editor = renderToStaticMarkup(React.createElement(TariffEditor, { record: modelTariffRecord(model), onSaved() {}, onDenied() {} }));
    assert(editor.includes('readOnly=""')); assert(editor.includes('value="fixture-model"')); assert(editor.includes('value="0.20"'));
    const loading = renderToStaticMarkup(React.createElement(AdminModels, { onDenied() {} }));
    assert(loading.includes('Memuat katalog model')); assert(!loading.includes('fixture-model'));
  } finally { await vite.close(); }
});
