import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { publicBillingPlans, approvedPlans } from '../shared/billing-plans.js';
import { billingBalances, formatIdr, loadBilling } from '../src/react/billing-data.js';

test('public package catalog matches approved billing terms and never treats Custom as unlimited', () => {
  assert.equal(publicBillingPlans.length, 4);
  for (const plan of publicBillingPlans.filter((p) => !p.quoteRequired)) {
    assert.equal(plan.monthlyPriceIdr, approvedPlans[plan.code].price);
    assert.equal(plan.includedCreditIdr, approvedPlans[plan.code].credit);
    assert.equal(plan.maxDivisions, approvedPlans[plan.code].divisions);
    assert.equal(plan.maxMembers, approvedPlans[plan.code].members);
    assert.equal(plan.agentsPerDivision, 4);
  }
  const custom = publicBillingPlans.find((p) => p.code === 'custom');
  assert.equal(custom.quoteRequired, true);
  assert.equal(custom.maxDivisions, undefined);
  assert.equal(custom.monthlyPriceIdr, undefined);
});

test('balances use server available funds only, never expired or reserved funds, with precise rupiah formatting', () => {
  assert.deepEqual(billingBalances([]), { package: 0n, topup: 0n, adjustment: 0n, reserved: 0n, available: 0n });
  assert.deepEqual(billingBalances([
    { source: 'package', availableIdr: '12000', reservedIdr: '3000', expiredIdr: '50000' },
    { source: 'topup', availableIdr: '7000', reservedIdr: '0' },
    { source: 'adjustment', availableIdr: '1000', reservedIdr: '0' },
  ]), { package: 12000n, topup: 7000n, adjustment: 1000n, reserved: 3000n, available: 20000n });
  assert.match(formatIdr('9007199254740993'), /9\.007\.199\.254\.740\.993/);
  assert.equal(formatIdr(null), '—');
  assert.throws(() => billingBalances([{ source: 'fake', availableIdr: '10', reservedIdr: '0' }]));
  assert.throws(() => billingBalances([{ source: 'package', availableIdr: '-1', reservedIdr: '0' }]));
});

test('billing request has no client tenant selectors, is same-origin/no-store and supports cancellation', async () => {
  const controller = new AbortController();
  const data = { currency: 'IDR', plans: [], grants: [], ledger: [], subscription: null, entitlements: { active: false } };
  assert.equal(await loadBilling(controller.signal, async (url, options) => {
    assert.equal(url, '/api/billing');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.signal, controller.signal);
    return { ok: true, json: async () => data };
  }), data);
  for (const status of [401, 403, 503]) {
    await assert.rejects(loadBilling(undefined, async () => ({ ok: false, status })), status === 403 ? /pemilik organisasi/ : status === 401 ? /login/ : /belum dapat dimuat/);
  }
  await assert.rejects(loadBilling(undefined, async () => ({ ok: true, json: async () => ({}) })), /tidak valid/);
});

test('landing renders all four real packages and dashboard cards cannot perform purchases', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { LandingPricing, LandingSecurity, LandingDesign } = await server.ssrLoadModule('/src/react/reference/landing.jsx');
    const { DashboardApiKeys } = await server.ssrLoadModule('/src/react/reference/dashboard.jsx');
    const { PricingCards } = await server.ssrLoadModule('/src/react/pricing-cards.jsx');
    const { BillingContent } = await server.ssrLoadModule('/src/react/billing-page.jsx');
    const { PlanEditor, AdminBilling } = await server.ssrLoadModule('/src/react/admin-billing.jsx');
    const shell = renderToStaticMarkup(React.createElement(LandingPricing));
    assert.ok(shell.includes('Memuat harga paket terbaru'));
    assert.ok(!shell.includes('149.000')); // no stale hardcoded price while public catalog loads
    const landing = renderToStaticMarkup(React.createElement(PricingCards, { plans: publicBillingPlans }));
    for (const name of ['Starter', 'Pro', 'Business', 'Custom']) assert.ok(landing.includes(name));
    for (const amount of ['149.000', '399.000', '899.000', '50.000', '150.000', '350.000']) assert.ok(landing.includes(amount));
    assert.equal((landing.match(/href="\/dashboard\/billing"/g) || []).length, 4);
    assert.ok(landing.includes('belum aktif'));
    assert.ok(!landing.includes('placeholder'));
    assert.ok(!landing.includes('Workflow builder'));
    const dashboard = renderToStaticMarkup(React.createElement(PricingCards, { plans: publicBillingPlans, dashboard: true }));
    assert.equal((dashboard.match(/disabled=""/g) || []).length, 4);
    assert.ok(!dashboard.includes('href='));
    const empty = renderToStaticMarkup(React.createElement(BillingContent, { data: {
      plans: publicBillingPlans, subscription: null, entitlements: { active: false }, grants: [], ledger: [],
    } }));
    assert.ok(empty.includes('Belum berlangganan'));
    assert.ok(empty.includes('Belum ada aktivitas saldo.'));
    assert.ok(!empty.includes('Paket saat ini'));
    const subscribed = renderToStaticMarkup(React.createElement(BillingContent, { data: {
      plans: publicBillingPlans, subscription: { plan_code: 'pro', period_end: '2026-12-01T00:00:00Z' },
      entitlements: { active: true }, grants: [{ source: 'topup', availableIdr: '12345', reservedIdr: '1000' }],
      ledger: [{ id: 'event-1', kind: 'reserve', amountIdr: '1000', createdAt: '2026-11-01T00:00:00Z' }],
    } }));
    assert.ok(subscribed.includes('12.345'));
    assert.ok(subscribed.includes('Paket saat ini'));
    assert.ok(subscribed.includes('Reservasi saldo'));
    const values = new LandingDesign({}).renderVals();
    const security = renderToStaticMarkup(React.createElement(LandingSecurity, { vals: values }));
    const provider = renderToStaticMarkup(React.createElement(DashboardApiKeys, { vals: { v: { keys: true } } }));
    for (const markup of [security, provider]) {
      assert.ok(markup.includes('Karyora'));
      assert.ok(!/BYOK|Hybrid|sk-ant-|<input/.test(markup));
    }
    assert.ok(values.faqs.some((faq) => faq.q === 'Apakah perlu API key sendiri?' && faq.a.startsWith('Tidak.')));
    const editedCatalog = [{ ...publicBillingPlans[0], version: 3, isPublic: 1, monthlyPriceIdr: '178321', name: 'Paket baru' }];
    const dynamic = renderToStaticMarkup(React.createElement(PricingCards, { plans: editedCatalog }));
    assert.ok(dynamic.includes('178.321')); assert.ok(dynamic.includes('Paket baru')); assert.ok(!dynamic.includes('149.000'));
    const editor = renderToStaticMarkup(React.createElement(PlanEditor, { plan: editedCatalog[0], onSaved() {}, onDenied() {} }));
    assert.ok(editor.includes('value="178321"')); assert.ok(editor.includes('Alasan perubahan')); assert.ok(editor.includes('Simpan versi baru'));
    assert.ok(!editor.includes('role="admin"'));
    const locked = renderToStaticMarkup(React.createElement(AdminBilling, { onNavigate() {} }));
    assert.ok(locked.includes('Memeriksa akses Admin Platform')); assert.ok(!locked.includes('<form'));
  } finally { await server.close(); }
});

test('Trial appears as a subscription, keeps expiry visible and never masks an active paid plan', async () => {
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
  try {
    const {BillingContent}=await vite.ssrLoadModule('/src/react/billing-page.jsx');
    const {BillingBalanceHighlight}=await vite.ssrLoadModule('/src/react/billing-balance.jsx');
    const data={plans:publicBillingPlans,subscription:null,entitlements:{active:true},grants:[],ledger:[],
      demo:{active:true,status:'trial',credit_idr:'3000',expiresAt:new Date(Date.now()+6.5*86400000).toISOString()}};
    const render=d=>renderToStaticMarkup(React.createElement(BillingContent,{data:d}));
    const active=render(data);
    assert(active.includes('<h3>Trial</h3>'));assert(active.includes('7 hari tersisa'));assert(active.includes('WIB'));
    assert(!active.includes('Belum berlangganan'));assert(active.includes('bukan diperbarui setiap hari'));
    const oldPaid=render({...data,subscription:{plan_code:'pro',status:'expired',period_end:new Date(Date.now()-1000).toISOString()}});
    assert(oldPaid.includes('<span>Langganan</span><h3>Trial</h3>'));
    assert(!oldPaid.includes('<span>Langganan</span><h3>Pro</h3>'));
    const highlight=renderToStaticMarkup(React.createElement(BillingBalanceHighlight,{state:{data},onNavigate(){}}));
    assert(highlight.includes('Trial · 7 hari tersisa'));assert(highlight.includes('WIB'));assert(!highlight.includes('3 hari'));
    const expired={...data,entitlements:{active:false},demo:{...data.demo,active:false,status:'expired',expiresAt:new Date(Date.now()-1000).toISOString()}};
    const ended=render(expired);
    assert(ended.includes('<h3>Trial berakhir</h3>'));assert(ended.includes('Penggunaan AI terkunci'));
    assert(ended.includes('Akun dan riwayat tetap tersimpan'));assert(!ended.includes('Belum berlangganan'));
    const paid=render({...data,demo:null,subscription:{plan_code:'pro',period_end:new Date(Date.now()+86400000).toISOString()}});
    assert(paid.includes('<h3>Pro</h3>'));assert(!paid.includes('<h3>Trial</h3>'));
  }finally{await vite.close();}
});

test('balance highlights show real available funds, package progress and pending holds without double subtraction', async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' });
  try {
    const { BillingBalanceHighlight, BillingBalanceIndicator } = await vite.ssrLoadModule('/src/react/billing-balance.jsx');
    const { BillingContent } = await vite.ssrLoadModule('/src/react/billing-page.jsx');
    const { DashboardSidebar, DashboardTopbar } = await vite.ssrLoadModule('/src/react/reference/dashboard.jsx');
    const { LiveDashboardOverview } = await vite.ssrLoadModule('/src/react/dashboard-overview.jsx');
    const data = { plans: publicBillingPlans, subscription: {plan_code:'starter',included_credit_idr:'50000',period_end:'2026-12-01T00:00:00Z'},
      entitlements: {active:true}, grants:[{source:'package',availableIdr:'47552',reservedIdr:'2203'},{source:'topup',availableIdr:'10000',reservedIdr:'0'}],
      ledger:[{id:'hold',kind:'reserve',amountIdr:'2203',createdAt:'2026-10-26T00:00:00Z'},{id:'actual',kind:'settle',amountIdr:'245',createdAt:'2026-10-26T00:00:01Z'}] };
    const summary = React.createElement(BillingBalanceHighlight, {state:{data,refresh(){}},onNavigate(){},compact:true});
    const markup = renderToStaticMarkup(summary);
    for (const text of ['57.552','47.552','50.000','2.203','saldo bersama organisasi','sudah dikecualikan','aria-valuenow="95"']) assert(markup.includes(text),text);
    assert(!markup.includes('55.349'),'never subtract pending holds from the already net available value');
    const sidebar = renderToStaticMarkup(React.createElement(DashboardSidebar,{vals:{live:true,navGroups:[],balanceSummary:summary}}));
    assert(!sidebar.includes('57.552'),'large balance card must not consume sidebar navigation space');
    assert(sidebar.includes('sbar-live'));assert(!sidebar.includes('Lihat paket dan saldo organisasi Anda.'));
    const indicator=React.createElement(BillingBalanceIndicator,{state:{data},onNavigate(){}});
    const topbar=renderToStaticMarkup(React.createElement(DashboardTopbar,{vals:{live:true,balanceIndicator:indicator}}));
    assert(topbar.includes('57.552'));assert(!topbar.includes('progressbar'));assert(!topbar.includes('Ditahan sementara'));
    assert.equal(renderToStaticMarkup(React.createElement(BillingBalanceIndicator,{state:{restricted:true},onNavigate(){}})),'');
    const overview = renderToStaticMarkup(React.createElement(LiveDashboardOverview,{balanceSummary:summary,onNavigate(){}}));
    assert(overview.includes('57.552'));assert(!overview.includes('Langganan belum tersedia'));
    const billing = renderToStaticMarkup(React.createElement(BillingContent,{data}));
    for (const text of ['Reservasi bukan biaya tambahan','1.958','bukan Rp2.448','Sementara · bukan biaya','Sisa dari reservasi terkait otomatis kembali','bukan berarti dana itu masih ditahan']) assert(billing.includes(text),text);
    for (const state of [{loading:true},{error:'Private failure'},{restricted:true}]) {
      const safe = renderToStaticMarkup(React.createElement(BillingBalanceHighlight,{state,onNavigate(){}}));
      assert(!safe.includes('57.552'));assert(!safe.includes('progressbar'));assert(!safe.includes('Private failure'));
    }
    const noPackage = renderToStaticMarkup(React.createElement(BillingBalanceHighlight,{state:{data:{...data,subscription:null,entitlements:{active:false},grants:[]}},onNavigate(){}}));
    assert(noPackage.includes('Tidak ada paket aktif'));assert(!noPackage.includes('progressbar'));
  } finally { await vite.close(); }
});
