import { MAX_DIVISIONS } from './workspace-team.js';

export const OFFICE_ROOM_COUNT = 9;

// Presentation only. This never grants permissions or enforces subscription access.
// null means no subscription entitlement has been configured, NOT a paid plan.
export function officeRoomLayout(divisions, divisionCapacity = null) {
  if (!Array.isArray(divisions) || (divisionCapacity !== null &&
      (!Number.isInteger(divisionCapacity) || divisionCapacity < 0 || divisionCapacity > MAX_DIVISIONS))) {
    throw new Error('Kapasitas ruangan tidak valid.');
  }
  const occupied = new Map();
  for (const division of divisions) {
    const slot = division.row * 3 + division.col;
    if (!Number.isInteger(division.row) || !Number.isInteger(division.col) || division.col < 0 || division.col > 2 ||
        slot < 0 || slot >= MAX_DIVISIONS || occupied.has(slot)) throw new Error('Posisi ruangan tidak valid.');
    occupied.set(slot, division);
  }
  let vacancies = divisionCapacity === null ? OFFICE_ROOM_COUNT : Math.max(0, divisionCapacity - occupied.size);
  return Array.from({ length: OFFICE_ROOM_COUNT }, (_, slot) => {
    const division = occupied.get(slot);
    // Existing divisions are never hidden/evicted by a presentation capacity change.
    // Downgrade and entitlement enforcement require a separate server policy.
    if (division) return { ...division, roomState: 'occupied' };
    const locked = vacancies <= 0;
    if (!locked) vacancies--;
    return { id: `office-room:${slot}`, name: locked ? 'Terkunci' : 'Ruangan kosong',
      color: locked ? '#94a3b8' : '#b6c4d7', row: Math.floor(slot / 3), col: slot % 3,
      roomState: locked ? 'locked' : 'empty' };
  });
}
