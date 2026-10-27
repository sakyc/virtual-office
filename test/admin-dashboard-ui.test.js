import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { publicBillingPlans } from '../shared/billing-plans.js';

test('admin sidebar groups every existing route once, preserves native links and groups mobile options', async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { AdminSidebar } = await vite.ssrLoadModule('/src/react/admin-billing.jsx');
    const routes = { overview: '/admin', users: '/admin/users', organizations: '/admin/organizations', subscriptions: '/admin/subscriptions', billing: '/admin/billing', models: '/admin/models', audit: '/admin/audit' };
    for (const [section, path] of Object.entries(routes)) {
      const html = renderToStaticMarkup(React.createElement(AdminSidebar, { section, onNavigate() {} }));
      for (const group of ['Utama', 'Pelanggan', 'Produk &amp; AI', 'Audit']) {
        assert.ok(html.includes(`role="group" aria-label="${group}"`));
        assert.ok(html.includes(`<optgroup label="${group}">`));
      }
      const nav = html.split('<nav aria-label="Navigasi admin">')[1].split('</nav>')[0];
      assert.equal((nav.match(/aria-current="page"/g) || []).length, 1);
      assert.ok(nav.includes(`href="${path}" aria-current="page"`));
      for (const route of Object.values(routes)) assert.equal(nav.split(`href="${route}"`).length - 1, 1);
      assert.doesNotMatch(nav, /Workflow|Segera|WORKSPACE/);
    }
    const navigated = [];
    const tree = AdminSidebar({ section: 'users', onNavigate: path => navigated.push(path) });
    function flatten(element) { return !element || typeof element !== 'object' ? [] : [element, ...React.Children.toArray(element.props?.children).flatMap(flatten)]; }
    const elements = flatten(tree);
    const link = elements.find(e => e.type === 'a' && e.props.href === '/admin/users');
    let prevented = 0;
    link.props.onClick({ button: 0, preventDefault() { prevented++; } });
    assert.equal(prevented, 1); assert.deepEqual(navigated, ['/admin/users']);
    link.props.onClick({ button: 0, ctrlKey: true, preventDefault() { assert.fail('Modified links must remain native'); } });
    assert.equal(navigated.length, 1);
    elements.find(e => e.type === 'select').props.onChange({ target: { value: 'models' } });
    assert.deepEqual(navigated, ['/admin/users', '/admin/models']);
    elements.find(e => e.type === 'button').props.onClick();
    assert.equal(navigated.at(-1), '/dashboard');
  } finally { await vite.close(); }
});

test('admin pages stay gated before server verification, with separate navigation and active page semantics', async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { AdminBilling } = await vite.ssrLoadModule('/src/react/admin-billing.jsx');
    for (const [section, path] of [['overview', '/admin'], ['users', '/admin/users'], ['organizations', '/admin/organizations'], ['subscriptions', '/admin/subscriptions'], ['billing', '/admin/billing'], ['models', '/admin/models'], ['audit', '/admin/audit']]) {
      const html = renderToStaticMarkup(React.createElement(AdminBilling, { section, onNavigate() {} }));
      assert.ok(html.includes('Memeriksa akses Admin Platform'));
      assert.ok(html.includes('aria-label="Navigasi admin"'));
      assert.ok(html.includes(`href="${path}" aria-current="page"`));
      assert.ok(!html.includes('<form'));
      assert.ok(!html.includes('admin-metrics'));
      assert.ok(!html.includes('Riwayat perubahan katalog'));
    }
  } finally { await vite.close(); }
});

test('admin overview uses supplied catalog only, distinguishes hidden/custom plans and does not invent business metrics', async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { AdminOverview, CatalogAudit } = await vite.ssrLoadModule('/src/react/admin-billing.jsx');
    const plans = publicBillingPlans.map((p, i) => ({ ...p, name: i === 0 ? 'Paket baru' : p.name, monthlyPriceIdr: i === 0 ? '178321' : p.monthlyPriceIdr, isPublic: i !== 0 }));
    const html = renderToStaticMarkup(React.createElement(AdminOverview, { data: { plans, audit: [] }, onNavigate() {} }));
    for (const text of ['Paket baru', '178.321', 'Tersembunyi', 'Custom', 'Buka pengelolaan', 'Maksimal 50', 'tidak otomatis membuka chat']) assert.ok(html.includes(text), text);
    assert.ok(!html.includes('149.000'));
    assert.ok(!/Pendapatan|Pengguna aktif|Tanpa batas/.test(html));
    assert.equal((html.match(/Buka pengelolaan/g) || []).length, 3);
    const empty = renderToStaticMarkup(React.createElement(AdminOverview, { data: { plans: [], audit: [] }, onNavigate() {} }));
    assert.ok(empty.includes('Belum ada paket di katalog.'));
    const audit = renderToStaticMarkup(React.createElement(CatalogAudit, { audit: [] }));
    assert.ok(audit.includes('Belum ada perubahan katalog.'));
    const escaped = renderToStaticMarkup(React.createElement(CatalogAudit, { audit: [{ id: '1', planCode: 'pro', planVersion: 2, actorUserId: 1, reason: '<script>alert(1)</script>', createdAt: '2026-10-25T00:00:00Z', beforeSnapshot: '{}', afterSnapshot: '{}' }] }));
    assert.ok(!escaped.includes('<script>'));
    assert.ok(escaped.includes('&lt;script&gt;'));
  } finally { await vite.close(); }
});

test('admin routes are explicit, reuse the existing protected catalog API, and do not depend on customer workspace onboarding', async () => {
  const router = await readFile(new URL('../src/react/main.jsx', import.meta.url), 'utf8');
  for (const path of ['/admin', '/admin/billing', '/admin/models', '/admin/audit', '/admin/users', '/admin/organizations', '/admin/subscriptions']) assert.ok(router.includes(`path === '${path}'`));
  const source = await readFile(new URL('../src/react/admin-billing.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('adminCatalogRequest({ signal: controller.signal })'));
  assert.ok(source.includes('return () => controller.abort()'));
  assert.ok(source.includes('onDenied={(error) => setState({ error })}'));
});

test('management tables distinguish user identity from membership, protect admins and show stored subscription terms without checkout controls', async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { AdminDirectoryTable, AdminDirectory, AdminActivity } = await vite.ssrLoadModule('/src/react/admin-management.jsx');
    const render = (section, rows) => renderToStaticMarkup(React.createElement(AdminDirectoryTable, { section, rows, onOrganization() {}, onAction() {} }));
    const users = render('users', [{ id: 1, email: 'admin@example.test', displayName: '<script>bad</script>', status: 'active', platformAdmin: 1, activeSessions: 2 }, { id: 2, email: 'member@example.test', status: 'suspended' }]);
    assert.ok(users.includes('Akun dilindungi')); assert.ok(users.includes('Aktifkan')); assert.ok(users.includes('Cabut sesi'));
    assert.ok(!users.includes('<script>'));
    const members = render('members', [{ userId: 2, email: 'member@example.test', scope: 'organization', role: 'owner', userStatus: 'active' }, { userId: 2, email: 'member@example.test', scope: 'workspace', workspaceId: 10, workspaceName: 'Studio', workspaceStatus: 'active', role: 'viewer', userStatus: 'active' }]);
    for (const text of ['owner','viewer','Studio','Organisasi']) assert.ok(members.includes(text));
    assert.ok(!members.includes('<button'));
    const subscriptions = render('subscriptions', [{ id: 4, organizationName: 'Studio', organizationStatus: 'active', subscriptionId: 'abc', planCode: 'pro', planVersion: 2, effectiveStatus: 'expired', monthlyPriceIdr: '321000', includedCreditIdr: '80000', maxDivisions: 3, maxMembers: 6 }]);
    assert.ok(subscriptions.includes('321.000')); assert.ok(subscriptions.includes('Berakhir')); assert.ok(!subscriptions.includes('<button'));
    assert.ok(render('users', []).includes('Tidak ada data'));
    const loading = renderToStaticMarkup(React.createElement(AdminDirectory, { section: 'users', onDenied() {} }));
    assert.ok(loading.includes('Memuat data admin')); assert.ok(!loading.includes('member@example.test'));
    const activity = renderToStaticMarkup(React.createElement(AdminActivity, { onDenied() {} }));
    assert.ok(activity.includes('Memuat log admin'));
  } finally { await vite.close(); }
});

test('billing forms distinguish manual activation from payment and never invent provider prices or auto-confirm approval',async()=>{
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  try {
    const {SubscriptionActivation,TariffEditor,DefaultModelPrices}=await vite.ssrLoadModule('/src/react/admin-billing-operations.jsx');
    const defaults=renderToStaticMarkup(React.createElement(DefaultModelPrices));
    for(const text of ['Tidak perlu diinput ulang','Sonnet 5','Haiku 4.5','Opus 4.8','Fable 5','Cache read','$0.20','2026-11-24'])assert(defaults.includes(text));
    assert(!defaults.includes('<input'), 'owner-supplied prices require no duplicate form entry');
    const plans=publicBillingPlans.map(p=>({...p,version:1,isPublic:1}));
    const activation=renderToStaticMarkup(React.createElement(SubscriptionActivation,{organization:{id:3,organizationName:'<script>bad</script>'},plans,onClose(){},onSaved(){},onDenied(){}}));
    for(const text of ['BUKAN CHECKOUT','Referensi pembayaran','Konfirmasi aktivasi','50.000','UTC'])assert(activation.includes(text));
    assert(!activation.includes('<script>'));assert(!activation.includes('checked=""'));
    const tariff=renderToStaticMarkup(React.createElement(TariffEditor,{onSaved(){},onDenied(){}}));
    for(const text of ['USD per 1 juta token','Markup tetap 2','URL sumber harga','batas konteks penuh','bukan memverifikasi harga otomatis'])assert(tariff.includes(text));
    assert(!tariff.includes('checked=""'));assert(!tariff.includes('value="2"'));
    const {AdminDirectoryTable}=await vite.ssrLoadModule('/src/react/admin-management.jsx');
    const rows=[{id:3,organizationName:'Empty',organizationStatus:'active',subscriptionId:null,effectiveStatus:'none'}];
    const html=renderToStaticMarkup(React.createElement(AdminDirectoryTable,{section:'subscriptions',rows,onActivate(){}}));
    assert(html.includes('Aktifkan paket'));
  }finally{await vite.close();}
});
