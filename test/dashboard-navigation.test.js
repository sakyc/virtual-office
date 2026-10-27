import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardNavigation } from '../src/react/dashboard-navigation.js';

const make = (options = {}) => dashboardNavigation({ baseGroups: [{ title: 'Old', items: [{ id: 'workflows', label: 'Workflow', soon: true }, { id: 'overview', icon: 'home' }] }], section: 'overview', onNavigate() {}, setView() {}, ...options });
test('customer sidebar has coherent groups, hides workflow and prototype badges, and separates tasks from approval', () => {
  const groups = make();
  assert.deepEqual(groups.map(g => g.title), ['Utama','Pekerjaan','Organisasi','Pengaturan']);
  const items = groups.flatMap(g => g.items);
  assert.ok(!items.some(i => i.id === 'workflows' || i.soon || i.badge));
  assert.equal(items.filter(i => i.id === 'members').length, 1);
  assert.ok(items.some(i => i.label === 'Tugas')); assert.ok(items.some(i => i.label === 'Board & persetujuan'));
  assert.ok(!items.some(i => i.id === 'catalogAdmin'));
  assert.equal(make({ platformAdmin: true }).at(-1).title, 'Platform');
});
test('each route highlights only its own entry and links remain independent of prior dashboard view', () => {
  for (const [section,id,path] of [['jobs','tasks','/dashboard/jobs'],['board','jobs','/dashboard/board'],['team','agents','/dashboard/team'],['members','members','/dashboard/members'],['usage','usage','/dashboard/usage'],['models','keys','/dashboard/models']]) {
    const navigated = [], views = [];
    const entries = make({ section, onNavigate: p => navigated.push(p), setView: v => views.push(v) }).flatMap(g => g.items);
    const active = entries.filter(i => i.current === 'page');
    assert.equal(active.length, 1); assert.equal(active[0].id, id);
    active[0].go(); assert.deepEqual(navigated, [path]); assert.deepEqual(views, ['overview']);
  }
});
