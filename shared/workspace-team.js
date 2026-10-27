import { AGENTS, DIVISIONS } from './roster.js';

// Rendering capacity, not subscription entitlements. Keep positions inside the existing office.
export const MAX_DIVISIONS = 8;
export const MAX_AGENTS = 4;
export const teamTemplates = DIVISIONS.map((division) => ({ ...division,
  agents: AGENTS.filter((agent) => agent.division === division.id),
}));
export function teamError(message, status = 400) { return Object.assign(new Error(message), { status }); }
function text(value, label, max, optional = false) {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw teamError(`${label} wajib diisi, maksimal ${max} karakter.`);
  return value.trim();
}
export function divisionInput(body) {
  if (!body || Object.keys(body).some((key) => !['name', 'templateId'].includes(key))) throw teamError('Data divisi tidak valid.');
  if (body.templateId !== undefined && !teamTemplates.some((d) => d.id === body.templateId)) throw teamError('Template divisi tidak tersedia.');
  const template = teamTemplates.find((d) => d.id === body.templateId);
  return { name: text(body.name ?? template?.name, 'Nama divisi', 100), templateId: template?.id || null };
}
export function agentInput(body) {
  if (!body || Object.keys(body).some((key) => !['name', 'role', 'instructions', 'modelTier'].includes(key))) throw teamError('Data agen tidak valid.');
  if (!['leader', 'team'].includes(body.modelTier)) throw teamError('Pilihan model tidak tersedia.');
  return { name: text(body.name, 'Nama agen', 100), role: text(body.role, 'Peran', 150),
    instructions: text(body.instructions, 'Instruksi tugas', 4000), modelTier: body.modelTier };
}
export function initialTeamInput(body) {
  if (body === undefined) return { mode: 'empty' };
  if (!body || !['empty', 'template', 'custom'].includes(body.mode)) throw teamError('Pilihan awal kantor tidak valid.');
  const allowed = { empty: ['mode'], template: ['mode', 'templateId'], custom: ['mode', 'division', 'agent'] }[body.mode];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw teamError('Pilihan awal kantor tidak valid.');
  if (body.mode === 'template') {
    if (!body.templateId) throw teamError('Pilih template divisi.');
    return { mode: 'template', ...divisionInput({ templateId: body.templateId }) };
  }
  if (body.mode === 'custom') return { mode: 'custom', division: divisionInput({ name: body.division }), agent: agentInput(body.agent) };
  return { mode: 'empty' };
}

// Public scene data deliberately excludes custom instructions and other customer content.
export function sceneRoster({ divisions, agents, divisionCapacity }) {
  if (!Array.isArray(divisions) || !Array.isArray(agents) || divisions.length > MAX_DIVISIONS || agents.length > MAX_DIVISIONS * MAX_AGENTS) throw new Error('Data kantor tidak valid.');
  const seen = new Set();
  const rooms = divisions.map((d) => {
    if (typeof d.id !== 'string' || seen.has(d.id) || typeof d.name !== 'string' || !Number.isInteger(d.slot) || d.slot < 0 || d.slot >= MAX_DIVISIONS || seen.has(`slot:${d.slot}`)) throw new Error('Data divisi tidak valid.');
    seen.add(d.id); seen.add(`slot:${d.slot}`);
    const template = DIVISIONS.find((t) => t.id === d.templateId);
    return { id: d.id, name: d.name, color: template?.color || '#4f7cff', row: Math.floor(d.slot / 3), col: d.slot % 3, templateId: d.templateId };
  });
  const ids = new Set(), counts = new Map();
  const members = agents.map((a) => {
    if (typeof a.id !== 'string' || ids.has(a.id) || !rooms.some((d) => d.id === a.divisionId) || typeof a.name !== 'string' || typeof a.role !== 'string') throw new Error('Data agen tidak valid.');
    ids.add(a.id); counts.set(a.divisionId, (counts.get(a.divisionId) || 0) + 1);
    if (counts.get(a.divisionId) > MAX_AGENTS) throw new Error('Kapasitas agen tidak valid.');
    const template = AGENTS.find((t) => t.id === a.templateId);
    return { id: a.id, division: a.divisionId, name: a.name, role: a.role, focus: a.role,
      leader: Boolean(template?.leader), look: template?.look || { skin: 1, hair: '#2b1d16', style: 'short' },
      quick: template?.quick || ['Jelaskan bagaimana kamu bisa membantu saya'], gender: template?.gender || 'M' };
  });
  for (const room of rooms) {
    const team = members.filter((a) => a.division === room.id);
    if (team.length > 1 && !team.some((a) => a.leader)) team[0].leader = true;
  }
  if (divisionCapacity !== undefined && (!Number.isInteger(divisionCapacity) || divisionCapacity < 0 || divisionCapacity > MAX_DIVISIONS)) throw new Error('Kapasitas kantor tidak valid.');
  return { divisions: rooms, agents: members, ...(divisionCapacity === undefined ? {} : { divisionCapacity }) };
}
