import { agentById } from '../shared/roster.js';
import { buildSystemPrompt } from './prompts.js';
import { SPEC } from './jobSpecs.js';

const KINDS = new Set(['text', 'list', 'code', 'checklist']);
const userErr = (m) => Object.assign(new Error(m), { user: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RULES = `Sekarang kamu mengerjakan JOB terstruktur, bukan chat. Serahkan hasil HANYA dengan memanggil tool submit_items tepat satu kali, tanpa teks lain di luar tool.
Format tiap item: title (singkat dan jelas) dan fields berisi {label, kind, value}. kind: "text" (value = string), "list" (value = array string), "code" (value = string kode), "checklist" (value = array string, tiap butir = satu pengecekan yang bisa dicentang).
Kamu tidak bisa bertanya balik di sini. Kalau info kurang, buat asumsi wajar dan tulis asumsinya di salah satu field. Isi hanya yang berguna, tanpa basa-basi, dan patuhi semua batas jumlah dan panjang pada tugas.`;

const tool = (many) => ({
  name: 'submit_items',
  description: 'Kirim hasil kerja ke board.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        minItems: 1,
        ...(many ? {} : { maxItems: 1 }),
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            fields: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  kind: { type: 'string', enum: ['text', 'list', 'code', 'checklist'] },
                  value: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
                },
                required: ['label', 'kind', 'value'],
              },
            },
          },
          required: ['title', 'fields'],
        },
      },
    },
    required: ['items'],
  },
});

export function sanitizeItem(raw) {
  const title = String(raw?.title || '').trim().slice(0, 255) || 'Tanpa judul';
  const fields = (Array.isArray(raw?.fields) ? raw.fields : [])
    .slice(0, 40)
    .map((f) => {
      const kind = KINDS.has(f?.kind) ? f.kind : 'text';
      const label = String(f?.label || '').trim().slice(0, 120);
      const isList = kind === 'list' || kind === 'checklist';
      let value = f?.value;
      if (isList) {
        value = (Array.isArray(value) ? value : String(value ?? '').split('\n'))
          .map((x) => String(x).replace(/^\s*[-*•]\s+/, '').trim())
          .filter(Boolean)
          .slice(0, 80);
        if (!value.length) return null;
      } else {
        value = (Array.isArray(value) ? value.join('\n') : String(value ?? '')).slice(0, 20000);
        if (!value.trim()) return null;
      }
      if (!label) return null;
      return { label, kind, value, ...(kind === 'checklist' ? { checked: value.map(() => false) } : {}) };
    })
    .filter(Boolean);
  return { title, content: { fields } };
}

export function itemToText(item) {
  const body = item.content.fields
    .map((f) => `${f.label}:${Array.isArray(f.value) ? f.value.map((x) => `\n  - ${x}`).join('') : ` ${f.value}`}`)
    .join('\n');
  return `${item.title}\n${body}`;
}

function describeParams(def, params) {
  return def.fields
    .filter((f) => f.type !== 'item' && params[f.name] != null && params[f.name] !== '')
    .map((f) => `- ${f.label}: ${[].concat(params[f.name]).join(', ')}`)
    .join('\n');
}

function context(def, params, clientRow, parent) {
  const parts = [];
  if (clientRow) parts.push(`KLIEN: ${clientRow.name}\n${clientRow.brief || '(brief klien belum diisi)'}`);
  if (parent) parts.push(`BAHAN DASAR (item board jenis ${parent.type}):\n${itemToText(parent)}`);
  parts.push(`PERMINTAAN:\n${describeParams(def, params)}`);
  return parts;
}

async function callTool({ apiClient, model, system, user, maxTokens, many }, retry = true) {
  const res = await apiClient.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    tools: [tool(many)],
    // Sonnet 5.5 / Opus 5.5 menolak tool_choice "tool" dan "any" (HTTP 400), jadi pakai auto + instruksi di prompt.
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: user }],
  });
  const block = res.content.find((b) => b.type === 'tool_use');
  const u = res.usage || {};
  const usage = { in: u.input_tokens || 0, out: u.output_tokens || 0 };
  if (!block && retry && res.stop_reason !== 'max_tokens') {
    const again = await callTool({ apiClient, model, system, maxTokens, many, user: `${user}\n\nWAJIB: serahkan hasil dengan memanggil tool submit_items sekarang, tanpa teks lain.` }, false);
    again.usage = { in: usage.in + again.usage.in, out: usage.out + again.usage.out };
    return again;
  }
  const items = Array.isArray(block?.input?.items) ? block.input.items : [];
  return { items, model: res.model, usage, truncated: res.stop_reason === 'max_tokens' };
}

// +3000: ruang untuk thinking adaptif pada model baru (max_tokens mencakup thinking + hasil)
const tokensOf = (spec, p) => Math.min(16000, (typeof spec.tokens === 'function' ? spec.tokens(p) : spec.tokens || 3500) + 3000);

function finish(items, spec, params) {
  if (spec.post) items.forEach((it) => spec.post(it, params));
  return items;
}

async function demo(def, spec, params) {
  await sleep(1200);
  const n = spec.many ? Number(params.jumlah) || 5 : 1;
  const items = Array.from({ length: n }, (_, i) => {
    const fields = [
      { label: 'Catatan', kind: 'text', value: 'Mode demo: server belum punya ANTHROPIC_API_KEY, jadi ini isi contoh supaya board bisa dites.' },
      { label: 'Contoh daftar', kind: 'list', value: ['Poin pertama', 'Poin kedua', 'Poin ketiga'] },
    ];
    if (def.type === 'checklist') fields.push({ label: 'Contoh checklist', kind: 'checklist', value: ['Cek pertama', 'Cek kedua', 'Cek ketiga'] });
    if (def.type === 'code') fields.push({ label: 'Kode', kind: 'code', value: 'console.log("halo");' });
    return sanitizeItem({ title: `[Demo] ${def.label}${n > 1 ? ` #${i + 1}` : ''}`, fields });
  });
  return { items: finish(items, spec, params), model: 'demo', usage: { in: 0, out: 0 } };
}

export async function generate({ apiClient, DEMO, models, def, params, clientRow, parent }) {
  const spec = SPEC[def.id];
  if (DEMO) return demo(def, spec, params);

  const agent = agentById(def.agent);
  const system = `${buildSystemPrompt(agent)}\n\n${RULES}`;
  const base = [...context(def, params, clientRow, parent), `TUGAS:\n${spec.instr(params)}`].join('\n\n');
  const model = spec.heavy ? models.leader : models.team;
  const usage = { in: 0, out: 0 };
  let items = [];
  let extra = '';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const r = await callTool({ apiClient, model, system, user: base + extra, maxTokens: tokensOf(spec, params), many: spec.many });
    usage.in += r.usage.in;
    usage.out += r.usage.out;
    items = r.items.map(sanitizeItem).filter((i) => i.content.fields.length);
    if (!items.length) throw userErr(r.truncated ? 'Hasil terpotong karena terlalu panjang. Kurangi jumlah lalu coba lagi.' : 'Agent tidak mengembalikan hasil. Coba lagi.');
    const errs = spec.validate ? items.flatMap(spec.validate) : [];
    if (!errs.length) break;
    if (attempt === 1) items.forEach((i) => spec.fix?.(i));
    extra = `\n\nPERBAIKI. Hasil sebelumnya melanggar batas:\n- ${errs.slice(0, 20).join('\n- ')}`;
  }
  return { items: finish(items, spec, params), model, usage };
}

export async function revise({ apiClient, DEMO, models, def, params, clientRow, item, reason }) {
  const spec = SPEC[def.id];
  if (DEMO) {
    await sleep(900);
    const next = sanitizeItem({ title: item.title, fields: [...item.content.fields, { label: `Revisi (demo)`, kind: 'text', value: `Alasan: ${reason}` }] });
    return { items: finish([next], spec, params), model: 'demo', usage: { in: 0, out: 0 } };
  }
  const agent = agentById(def.agent);
  const system = `${buildSystemPrompt(agent)}\n\n${RULES}`;
  const user = [
    ...context(def, params, clientRow, null),
    `ITEM SAAT INI (versi ${item.version}):\n${itemToText(item)}`,
    `ALASAN REVISI dari manusia:\n${reason}`,
    `TUGAS: tulis ulang item ini sebagai SATU item baru yang menjawab alasan revisi. Pertahankan bagian yang tidak dipersoalkan, jangan mengubah angka yang dihitung sistem. Aturan awal: ${(spec.rule || spec.instr)(params)}`,
  ].join('\n\n');
  const model = spec.heavy ? models.leader : models.team;
  const r = await callTool({ apiClient, model, system, user, maxTokens: Math.min(16000, tokensOf(spec, { ...params, jumlah: 1 })), many: false });
  const items = r.items.slice(0, 1).map(sanitizeItem).filter((i) => i.content.fields.length);
  if (!items.length) throw userErr('Agent tidak mengembalikan revisi. Coba lagi.');
  items.forEach((i) => spec.fix?.(i));
  return { items: finish(items, spec, params), model, usage: r.usage };
}
