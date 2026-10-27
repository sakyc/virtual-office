import { JOBS, TYPE_LABEL } from './jobs.js';

export const templateError = (message, status = 400) => Object.assign(new Error(message), { status });
export function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw templateError('Kolom permintaan tidak valid.');
}
function text(value, max, required = true) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw templateError('Lengkapi teks sesuai batas panjang yang tersedia.');
  return value.trim();
}
export function templateInput(body, editing = false) {
  exactKeys(body, ['name', 'description', 'instructions', 'outputFormat', 'fields', ...(editing ? ['version'] : [])]);
  if (editing && (!Number.isSafeInteger(body.version) || body.version < 1)) throw templateError('Versi template tidak valid.');
  if (!Array.isArray(body.fields) || body.fields.length > 12) throw templateError('Maksimal 12 kolom input.');
  const fields = body.fields.map(field => {
    exactKeys(field, ['name', 'label', 'type', 'required']);
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(field.name) || !['text', 'textarea', 'number'].includes(field.type) || typeof field.required !== 'boolean') throw templateError('Definisi kolom input tidak valid.');
    return { name: field.name, label: text(field.label, 100), type: field.type, required: field.required };
  });
  if (new Set(fields.map(f => f.name)).size !== fields.length) throw templateError('Kunci kolom input harus unik.');
  return { name: text(body.name, 150), description: text(body.description, 500, false), instructions: text(body.instructions, 8000), outputFormat: text(body.outputFormat, 100), fields };
}

// Public form definitions only. Private executor prompts remain on the server.
export const builtinTaskTemplates = JOBS.map(job => ({ id: job.id, name: job.label, description: job.desc, outputFormat: TYPE_LABEL[job.type] || job.type, fields: job.fields, readOnly: true }));

export function draftFromBuiltin(template) {
  return { name: `${template.name} (salinan)`, description: template.description, instructions: '', outputFormat: template.outputFormat,
    fields: template.fields.slice(0, 12).map(field => ({ name: field.name, label: field.label, type: ['text', 'textarea', 'number'].includes(field.type) ? field.type : 'text', required: !!field.required })) };
}
