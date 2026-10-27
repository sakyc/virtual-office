import { normalizeEmail } from './auth-validation.js';
export const memberError = (message, status = 400) => Object.assign(new Error(message), { status });
export const isManager = role => ['owner', 'admin'].includes(role);
export const memberRoles = ['admin', 'member', 'viewer'];
export const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function exactMemberKeys(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !keys.includes(key))) throw memberError('Data anggota tidak valid.');
}
export function memberInput(body, invite = false) {
  exactMemberKeys(body, ['role', 'divisionIds', 'agentIds', ...(invite ? ['email'] : ['version'])]);
  if (!memberRoles.includes(body.role)) throw memberError('Role tidak valid.');
  const result = { role: body.role };
  for (const field of ['divisionIds', 'agentIds']) {
    const list = body[field];
    if (!Array.isArray(list) || list.length > 32 || list.some(id => !uuid(id)) || new Set(list).size !== list.length) throw memberError('Penugasan divisi atau agen tidak valid.');
    result[field] = list;
  }
  if (body.role !== 'member' && (result.divisionIds.length || result.agentIds.length)) throw memberError('Penugasan khusus hanya untuk role member. Admin menangani seluruh workspace; viewer hanya membaca.');
  if (invite) {
    result.email = normalizeEmail(body.email);
    if (!result.email) throw memberError('Format email undangan tidak valid.');
  } else {
    if (!Number.isSafeInteger(body.version) || body.version < 1) throw memberError('Versi anggota wajib disertakan.');
    result.version = body.version;
  }
  return result;
}
