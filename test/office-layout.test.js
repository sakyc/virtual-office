import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from 'three';
import { readFile } from 'node:fs/promises';
import { officeRoomLayout } from '../shared/office-layout.js';
import { buildOffice } from '../src/office.js';

test('all nine room shells stay visible, including the former lounge as an empty room', () => {
  const input = [];
  const rooms = officeRoomLayout(input);
  assert.equal(rooms.length, 9);
  assert.ok(rooms.every((room) => room.roomState === 'empty'));
  assert.equal(new Set(rooms.map((room) => `${room.row}:${room.col}`)).size, 9);
  assert.equal(rooms.find((room) => room.row === 2 && room.col === 2).roomState, 'empty');
  assert.deepEqual(input, []);
});

test('example capacities control empty versus locked rooms without defining real packages', () => {
  for (const capacity of [0, 1, 4, 8]) {
    const rooms = officeRoomLayout([], capacity);
    assert.equal(rooms.filter((room) => room.roomState === 'empty').length, capacity);
    assert.equal(rooms.filter((room) => room.roomState === 'locked').length, 9 - capacity);
  }
  for (const invalid of [-1, 9, 1.5, '4', NaN]) assert.throws(() => officeRoomLayout([], invalid));
});

test('existing rooms retain their names, location and content; capacity never deletes an existing division', () => {
  const division = { id: 'owned', name: 'Konten', color: '#4f7cff', row: 2, col: 1 };
  const rooms = officeRoomLayout([division], 1);
  assert.deepEqual(rooms[7], { ...division, roomState: 'occupied' });
  assert.deepEqual(division, { id: 'owned', name: 'Konten', color: '#4f7cff', row: 2, col: 1 });
  assert.throws(() => officeRoomLayout([division, division]));
  assert.throws(() => officeRoomLayout([{ ...division, col: 2 }]));
});

test('empty and locked geometry has walls but no employee pickables, including all-locked capacity', (t) => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) };
  t.after(() => { if (saved) Object.defineProperty(globalThis, 'document', saved); else delete globalThis.document; });
  for (const capacity of [null, 0, 1, 4, 8]) {
    const scene = new Scene();
    const office = buildOffice(scene, { divisions: [], agents: [], divisionCapacity: capacity });
    assert.equal(office.rooms.size, 9);
    // Nine identical room shells, excluding base/corridor meshes: no lounge props.
    assert.equal(scene.children.filter((object) => object.isGroup).length, 9);
    assert.equal(office.chars.length, 0);
    assert.equal(office.pickables.length, 0);
    assert.equal(office.byId.size, 0);
    assert.equal([...office.rooms.values()].filter((room) => room.state === 'locked').length, capacity === null ? 0 : 9 - capacity);
    assert.ok([...office.rooms.values()].every((room) => room.group.children[0].children.length >= 10));
    office.update(0.016, 1);
    scene.traverse((object) => { object.geometry?.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) { material?.map?.dispose(); material?.dispose(); } });
  }
});

test('office navigation and scene no longer contain a pantry entry or builder', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const office = await readFile(new URL('../src/office.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /pantry/i);
  assert.doesNotMatch(office, /pantry|buildLounge/i);
});
