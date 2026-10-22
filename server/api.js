import { Router } from 'express';
import { pool, dbState, parse } from './db.js';
import { AGENTS, agentById } from '../shared/roster.js';
import { jobById } from '../shared/jobs.js';
import { SPEC } from './jobSpecs.js';
import { generate, revise } from './runner.js';

const badReq = (m, s = 400) => Object.assign(new Error(m), { status: s });

const ah = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    if (e.status && e.status < 500) return res.status(e.status).json({ error: e.message });
    console.error('[api error]', e?.message || e);
    res.status(500).json({ error: 'Terjadi kesalahan di server.' });
  });

function errMsg(e) {
  if (e?.user) return e.message;
  const s = e?.status;
  const m = String(e?.message || '');
  if (/credit balance/i.test(m)) return 'Saldo kredit API Anthropic habis. Isi saldo di Console Anthropic.';
  if (s === 401) return 'API key Anthropic ditolak. Cek ANTHROPIC_API_KEY di server.';
  if (s === 402 || s === 403) return 'Akun API tidak punya akses atau saldo. Cek Console Anthropic.';
  if (s === 404) return 'Model tidak ditemukan. Cek MODEL_LEADER dan MODEL_TEAM di .env.';
  if (s === 429) return 'Kena rate limit dari Anthropic. Coba lagi sebentar lagi.';
  if (s === 529 || s >= 500) return 'Server Claude lagi sibuk. Coba lagi sebentar lagi.';
  if (s) return `Claude menolak permintaan (${s}): ${m.slice(0, 150)}`;
  return `Gagal membuat hasil: ${m.slice(0, 150)}`;
}

// ---------- validasi form ----------
function cleanParams(def, raw = {}) {
  const out = {};
  for (const f of def.fields) {
    let v = raw[f.name];
    if (f.type === 'multi') {
      v = (Array.isArray(v) ? v : []).filter((x) => f.options.includes(x));
      if (!v.length && f.default) v = f.default;
    } else if (f.type === 'number') {
      v = Math.round(Number(v));
      if (!Number.isFinite(v)) v = f.default ?? f.min ?? 1;
      v = Math.min(f.max ?? 100, Math.max(f.min ?? 1, v));
    } else if (f.type === 'select') {
      if (!f.options.includes(v)) v = f.default ?? f.options[0];
    } else if (f.type === 'month') {
      v = /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : '';
    } else if (f.type === 'item') {
      v = Number(v) > 0 ? Number(v) : null;
    } else {
      v = String(v ?? '').trim().slice(0, f.type === 'textarea' ? f.limit || 8000 : 300);
    }
    if (f.required && (v === '' || v == null || (Array.isArray(v) && !v.length))) throw badReq(`${f.label} wajib diisi.`);
    out[f.name] = v;
  }
  if (def.anyOf && !def.anyOf.some((n) => out[n])) {
    throw badReq(`Isi salah satu: ${def.anyOf.map((n) => def.fields.find((f) => f.name === n).label).join(' / ')}.`);
  }
  return out;
}

// ---------- bentuk data ----------
const ITEM_SQL = 'SELECT i.*, c.name AS client_name FROM items i LEFT JOIN clients c ON c.id = i.client_id';

const shape = (r) => ({
  id: r.id,
  jobId: r.job_id,
  parentId: r.parent_id,
  clientId: r.client_id,
  clientName: r.client_name ?? null,
  agentId: r.agent_id,
  type: r.type,
  title: r.title,
  tag: r.tag,
  status: r.status,
  version: r.version,
  rejectReason: r.reject_reason,
  lastError: r.last_error,
  content: parse(r.content),
  approvedAt: r.approved_at,
  deleted: Boolean(r.deleted_at),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

async function loadItem(id) {
  const [rows] = await pool.query(`${ITEM_SQL} WHERE i.id = ?`, [id]);
  return rows[0] ? shape(rows[0]) : null;
}

export function createApiRouter({ client, DEMO, requireAccess, rateLimit, dailyCap, models, customerAuth }) {
  const router = Router();
  const ctx = { apiClient: client, DEMO, models };

  router.use(customerAuth || requireAccess);
  router.use((req, res, next) => {
    if (dbState.ready) return next();
    res.status(503).json({ error: `Database belum tersambung${dbState.error ? `: ${dbState.error}` : ''}. Cek DB_* di .env lalu restart server.` });
  });

  // ---------- klien ----------
  router.get('/clients', ah(async (req, res) => {
    const [rows] = await pool.query('SELECT id, name, brief FROM clients ORDER BY name');
    res.json(rows);
  }));

  router.post('/clients', ah(async (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 150);
    const brief = String(req.body?.brief || '').trim().slice(0, 4000);
    if (!name) throw badReq('Nama klien wajib diisi.');
    const [r] = await pool.query('INSERT INTO clients (name, brief) VALUES (?, ?)', [name, brief || null]);
    res.status(201).json({ id: r.insertId, name, brief });
  }));

  // ---------- job ----------
  async function processJob(jobId) {
    const [[job]] = await pool.query('SELECT * FROM jobs WHERE id = ?', [jobId]);
    try {
      const def = jobById(job.job_type);
      const params = parse(job.params);
      const clientRow = job.client_id ? (await pool.query('SELECT name, brief FROM clients WHERE id = ?', [job.client_id]))[0][0] : null;
      const parent = job.parent_item_id ? await loadItem(job.parent_item_id) : null;
      const out = await generate({ ...ctx, def, params, clientRow, parent });
      const tag = SPEC[def.id].tag?.(params)?.slice(0, 120) ?? null;

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const it of out.items) {
          await conn.query(
            'INSERT INTO items (job_id, parent_id, client_id, agent_id, type, title, tag, content) VALUES (?,?,?,?,?,?,?,?)',
            [jobId, job.parent_item_id, job.client_id, def.agent, def.type, it.title, tag, JSON.stringify(it.content)],
          );
        }
        await conn.query("UPDATE jobs SET status='done', model=?, tokens_in=?, tokens_out=?, finished_at=NOW() WHERE id=?", [out.model, out.usage.in, out.usage.out, jobId]);
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
      console.log(`[job] #${jobId} ${def.id} model=${out.model} in=${out.usage.in} out=${out.usage.out} items=${out.items.length}`);
    } catch (e) {
      console.error('[job error]', jobId, e?.status || '', e?.message || e);
      await pool.query("UPDATE jobs SET status='failed', error=?, finished_at=NOW() WHERE id=?", [errMsg(e).slice(0, 255), jobId]).catch(() => {});
    }
  }

  router.post('/jobs', rateLimit, dailyCap, ah(async (req, res) => {
    const def = jobById(req.body?.jobType);
    if (!def) throw badReq('Jenis perintah tidak dikenal.');
    const params = cleanParams(def, req.body?.params);

    let clientId = Number(req.body?.clientId) || null;
    if (clientId) {
      const [c] = await pool.query('SELECT id FROM clients WHERE id = ?', [clientId]);
      if (!c.length) clientId = null;
    }
    const itemField = def.fields.find((f) => f.type === 'item');
    const parentId = itemField ? params[itemField.name] : null;
    if (parentId) {
      const parent = await loadItem(parentId);
      if (!parent || parent.deleted) throw badReq('Item bahan dasar tidak ditemukan.');
    }

    const [r] = await pool.query('INSERT INTO jobs (agent_id, job_type, client_id, parent_item_id, params) VALUES (?,?,?,?,?)', [def.agent, def.id, clientId, parentId, JSON.stringify(params)]);
    res.status(202).json({ jobId: r.insertId });
    processJob(r.insertId);
  }));

  const jobRow = (j) => ({
    id: j.id,
    agentId: j.agent_id,
    jobType: j.job_type,
    status: j.status,
    error: j.error,
    createdAt: j.created_at,
    itemCount: Number(j.item_count || 0),
    firstItemId: j.first_item || null,
  });
  const JOB_SQL = `SELECT j.*, (SELECT COUNT(*) FROM items i WHERE i.job_id = j.id AND i.deleted_at IS NULL) AS item_count,
    (SELECT MIN(i2.id) FROM items i2 WHERE i2.job_id = j.id AND i2.deleted_at IS NULL) AS first_item FROM jobs j`;

  router.get('/jobs', ah(async (req, res) => {
    const agent = String(req.query.agent || '');
    if (!agentById(agent)) throw badReq('Agent tidak dikenal.');
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 8));
    const [rows] = await pool.query(`${JOB_SQL} WHERE j.agent_id = ? ORDER BY j.id DESC LIMIT ?`, [agent, limit]);
    res.json(rows.map(jobRow));
  }));

  router.get('/jobs/:id', ah(async (req, res) => {
    const [rows] = await pool.query(`${JOB_SQL} WHERE j.id = ?`, [Number(req.params.id)]);
    if (!rows[0]) throw badReq('Perintah tidak ditemukan.', 404);
    res.json(jobRow(rows[0]));
  }));

  // ---------- board ----------
  router.get('/items/counts', ah(async (req, res) => {
    const [rows] = await pool.query("SELECT agent_id, COUNT(*) AS n FROM items WHERE deleted_at IS NULL AND status IN ('draft','revising') GROUP BY agent_id");
    const byAgent = Object.fromEntries(rows.map((r) => [r.agent_id, Number(r.n)]));
    res.json({ byAgent, draft: Object.values(byAgent).reduce((a, b) => a + b, 0) });
  }));

  router.get('/items', ah(async (req, res) => {
    const where = [];
    const args = [];
    const st = String(req.query.status || 'draft');
    if (st === 'trash') where.push('i.deleted_at IS NOT NULL');
    else {
      where.push('i.deleted_at IS NULL');
      if (st === 'draft') where.push("i.status IN ('draft','revising')");
      else if (st === 'active') where.push("i.status IN ('draft','approved','revising')");
      else if (st === 'approved' || st === 'rejected') { where.push('i.status = ?'); args.push(st); }
    }
    const known = new Set(AGENTS.map((a) => a.id));
    const agents = String(req.query.agent || '').split(',').filter((a) => known.has(a));
    if (agents.length) { where.push('i.agent_id IN (?)'); args.push(agents); }
    if (req.query.type) { where.push('i.type = ?'); args.push(String(req.query.type)); }
    if (req.query.job) { where.push('i.job_id = ?'); args.push(Number(req.query.job) || 0); }
    if (req.query.q) {
      const like = `%${String(req.query.q).slice(0, 80).replace(/[%_]/g, '')}%`;
      where.push('(i.title LIKE ? OR CAST(i.content AS CHAR) LIKE ?)');
      args.push(like, like);
    }
    const limit = Math.min(300, Math.max(1, Number(req.query.limit) || 100));
    const [rows] = await pool.query(`${ITEM_SQL} WHERE ${where.join(' AND ')} ORDER BY i.created_at DESC, i.id ASC LIMIT ?`, [...args, limit]);
    res.json(rows.map(shape));
  }));

  router.get('/items/:id', ah(async (req, res) => {
    const item = await loadItem(Number(req.params.id));
    if (!item) throw badReq('Item tidak ditemukan.', 404);
    const [revisions] = await pool.query('SELECT version, reason, created_at AS createdAt FROM revisions WHERE item_id = ? ORDER BY id DESC', [item.id]);
    const [children] = await pool.query('SELECT id, type, title, status, agent_id AS agentId FROM items WHERE parent_id = ? AND deleted_at IS NULL ORDER BY id', [item.id]);
    const [parents] = item.parentId ? await pool.query('SELECT id, type, title FROM items WHERE id = ?', [item.parentId]) : [[]];
    res.json({ ...item, revisions, children, parent: parents[0] || null });
  }));

  async function reviseItem(item, reason) {
    try {
      const [[job]] = await pool.query('SELECT * FROM jobs WHERE id = ?', [item.jobId]);
      const def = jobById(job.job_type);
      const clientRow = job.client_id ? (await pool.query('SELECT name, brief FROM clients WHERE id = ?', [job.client_id]))[0][0] : null;
      const out = await revise({ ...ctx, def, params: parse(job.params), clientRow, item, reason });
      const next = out.items[0];

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('INSERT INTO revisions (item_id, version, reason, title_before, content_before) VALUES (?,?,?,?,?)', [item.id, item.version, reason, item.title, JSON.stringify(item.content)]);
        await conn.query("UPDATE items SET title=?, content=?, version=version+1, status='draft', reject_reason=NULL, approved_at=NULL, last_error=NULL WHERE id=?", [next.title, JSON.stringify(next.content), item.id]);
        await conn.query('UPDATE jobs SET tokens_in = COALESCE(tokens_in,0)+?, tokens_out = COALESCE(tokens_out,0)+? WHERE id=?', [out.usage.in, out.usage.out, item.jobId]);
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    } catch (e) {
      console.error('[revise error]', item.id, e?.status || '', e?.message || e);
      await pool.query('UPDATE items SET status=?, last_error=? WHERE id=?', [item.status, errMsg(e).slice(0, 255), item.id]).catch(() => {});
    }
  }

  const loadLive = async (req) => {
    const item = await loadItem(Number(req.params.id));
    if (!item) throw badReq('Item tidak ditemukan.', 404);
    return item;
  };

  router.post('/items/:id/revise', rateLimit, dailyCap, ah(async (req, res) => {
    const reason = String(req.body?.reason || '').trim().slice(0, 2000);
    if (reason.length < 3) throw badReq('Tulis alasan revisi.');
    const item = await loadLive(req);
    if (item.deleted) throw badReq('Item ada di Sampah. Pulihkan dulu.');
    if (item.status === 'revising') throw badReq('Item ini sedang direvisi.', 409);
    await pool.query("UPDATE items SET status='revising', last_error=NULL WHERE id=?", [item.id]);
    res.status(202).json({ ok: true });
    reviseItem(item, reason);
  }));

  router.post('/items/:id/approve', ah(async (req, res) => {
    const item = await loadLive(req);
    if (item.status === 'revising') throw badReq('Tunggu revisi selesai.', 409);
    await pool.query("UPDATE items SET status='approved', approved_at=NOW(), reject_reason=NULL WHERE id=?", [item.id]);
    res.json({ ok: true });
  }));

  router.post('/items/:id/reject', ah(async (req, res) => {
    const item = await loadLive(req);
    if (item.status === 'revising') throw badReq('Tunggu revisi selesai.', 409);
    const reason = String(req.body?.reason || '').trim().slice(0, 500) || null;
    await pool.query("UPDATE items SET status='rejected', reject_reason=?, approved_at=NULL WHERE id=?", [reason, item.id]);
    res.json({ ok: true });
  }));

  router.post('/items/:id/check', ah(async (req, res) => {
    const item = await loadLive(req);
    const { f, i, on } = req.body || {};
    const field = item.content.fields[f];
    if (!field || field.kind !== 'checklist' || !(i >= 0 && i < field.value.length)) throw badReq('Butir checklist tidak valid.');
    field.checked = field.value.map((_, k) => (k === i ? Boolean(on) : Boolean(field.checked?.[k])));
    await pool.query('UPDATE items SET content=? WHERE id=?', [JSON.stringify(item.content), item.id]);
    res.json({ ok: true });
  }));

  router.delete('/items/:id', ah(async (req, res) => {
    const item = await loadLive(req);
    if (req.query.permanent) {
      if (!item.deleted) throw badReq('Pindahkan ke Sampah dulu sebelum hapus permanen.');
      await pool.query('DELETE FROM items WHERE id = ?', [item.id]);
    } else {
      await pool.query('UPDATE items SET deleted_at = NOW() WHERE id = ?', [item.id]);
    }
    res.json({ ok: true });
  }));

  router.post('/items/:id/restore', ah(async (req, res) => {
    const item = await loadLive(req);
    await pool.query('UPDATE items SET deleted_at = NULL WHERE id = ?', [item.id]);
    res.json({ ok: true });
  }));

  return router;
}
