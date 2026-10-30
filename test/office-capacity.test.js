import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadOfficeDivisionCapacity } from '../server/workspace-team.js';
import { sceneRoster } from '../shared/workspace-team.js';
import { officeRoomLayout } from '../shared/office-layout.js';

test('office capacity comes from active server subscription and subtracts sibling workspace divisions', async () => {
  const tenant = { organizationId: 3, workspaceId: 8 };
  for (const [row, capacity] of [[{ maxDivisions: 1, otherDivisions: 0 }, 1], [{ maxDivisions: 3, otherDivisions: 0 }, 3],
    [{ maxDivisions: 3, otherDivisions: 2 }, 1], [{ maxDivisions: 3, otherDivisions: 5 }, 0], [{ maxDivisions: 50, otherDivisions: 0 }, 8], [null, 0]]) {
    const connection = { async execute(sql, values) {
      if(sql.includes('FROM managed_demo_accounts'))return [[]];
      assert.deepEqual(values, [8, 3]);
      assert.match(sql, /s.status='active'/);
      assert.match(sql, /s.period_end>UTC_TIMESTAMP/);
      assert.match(sql, /w.status='active'/);
      return [row ? [row] : []];
    } };
    assert.equal(await loadOfficeDivisionCapacity(connection, tenant), capacity);
  }
  await assert.rejects(loadOfficeDivisionCapacity({ execute: async () => [[{ maxDivisions: 'bad', otherDivisions: 0 }]] }, tenant), { status: 503 });
});

test('scene retains validated capacity: one or three open rooms leave eight or six locked', () => {
  for (const [capacity, locked] of [[0, 9], [1, 8], [3, 6], [8, 1]]) {
    const roster = sceneRoster({ divisions: [], agents: [], divisionCapacity: capacity });
    assert.equal(roster.divisionCapacity, capacity);
    assert.equal(officeRoomLayout(roster.divisions, roster.divisionCapacity).filter(room => room.roomState === 'locked').length, locked);
  }
  for (const value of [-1, 9, '3', null, NaN]) assert.throws(() => sceneRoster({ divisions: [], agents: [], divisionCapacity: value }));
});

test('locked room clicks and chips open upgrade; iframe billing navigation stays source/origin checked', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /divisionCapacity: body.divisionCapacity \?\? 0/);
  assert.match(main, /rooms.get\(id\)\?\.state === 'locked'\) \{ upgrade.open\(\); return; \}/);
  assert.match(main, /rooms.get\(id\)\?\.state === 'locked'\) upgrade.open\(\)/);
  const bridge = await readFile(new URL('../src/react/office-page.jsx', import.meta.url), 'utf8');
  assert.match(bridge, /event.source === frame.contentWindow && event.origin === location.origin/);
  assert.match(bridge, /'\/dashboard\/billing'/);
});
