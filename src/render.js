// Menggambar slide (carousel / storyboard video) ke canvas. Tidak memakai DOM di level modul,
// jadi fungsi gambar bisa dites di Node dengan canvas apa pun yang punya API 2D standar.
// Semua koordinat memakai ruang 1080 px lebar; thumbnail cukup memakai ctx.scale().

export const SIZES = { post: [1080, 1350], story: [1080, 1920] };

export const THEMES = [
  { id: 'biru', name: 'Biru kantor', bg1: '#f6f9ff', bg2: '#dbe6ff', ink: '#1d2433', accent: '#4f7cff' },
  { id: 'gelap', name: 'Gelap', bg1: '#1a2238', bg2: '#0b0f1c', ink: '#f3f6ff', accent: '#7aa2ff' },
  { id: 'hangat', name: 'Hangat', bg1: '#fff7ee', bg2: '#ffe0c2', ink: '#3a2417', accent: '#ff8a3d' },
  { id: 'hijau', name: 'Hijau segar', bg1: '#f0faf4', bg2: '#cdeedb', ink: '#12311f', accent: '#2fbf71' },
  { id: 'mono', name: 'Mono', bg1: '#ffffff', bg2: '#e9edf3', ink: '#111827', accent: '#111827' },
];

const FONT = '"Plus Jakarta Sans", system-ui, "Segoe UI", Arial, sans-serif';

export async function loadFonts() {
  try {
    await Promise.all(['800 80px', '700 30px', '500 40px'].map((f) => document.fonts.load(`${f} "Plus Jakarta Sans"`)));
  } catch { /* pakai font cadangan */ }
}

// ---------- warna ----------
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a) => { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a})`; };
const lum = (h) => {
  const [r, g, b] = rgb(h).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const onColor = (h) => (lum(h) > 0.45 ? '#111827' : '#ffffff');
const shade = (h, k) => `#${rgb(h).map((v) => Math.max(0, Math.min(255, Math.round(v * (1 + k)))).toString(16).padStart(2, '0')).join('')}`;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- teks ----------
function wrap(ctx, text, maxW) {
  const lines = [];
  let cur = '';
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const test = cur ? `${cur} ${w}` : w;
    if (cur && ctx.measureText(test).width > maxW) { lines.push(cur); cur = w; } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Cari ukuran font terbesar yang masih muat; kalau tetap tidak muat, potong dengan "…".
function fit(ctx, text, { weight, maxW, maxH, max, min, lh }) {
  let size = max;
  let lines = [];
  for (; size >= min; size -= 4) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    lines = wrap(ctx, text, maxW);
    if (lines.length * size * lh <= maxH) return { size, lines, h: lines.length * size * lh };
  }
  size = min;
  ctx.font = `${weight} ${size}px ${FONT}`;
  lines = wrap(ctx, text, maxW);
  const maxLines = Math.max(1, Math.floor(maxH / (size * lh)));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[\s.,;:!?-]+$/, '')}…`;
  }
  return { size, lines, h: lines.length * size * lh };
}

// ---------- gambar satu slide ----------
// slide: { kicker?, title, body? }   st: tema + { accent, handle }   meta: { i, n, logo?, cta? }
export function drawSlide(ctx, W, H, slide, st, meta = {}) {
  const { i = 0, n = 1, logo = null, cta = false } = meta;
  const pad = 96;
  const accent = st.accent || '#4f7cff';
  const c = cta
    ? { bg1: accent, bg2: shade(accent, -0.25), ink: onColor(accent), accent: onColor(accent), pillText: accent }
    : { bg1: st.bg1, bg2: st.bg2, ink: st.ink, accent, pillText: onColor(accent) };

  // latar
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, c.bg1);
  g.addColorStop(1, c.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = rgba(c.accent, cta ? 0.14 : 0.1);
  ctx.beginPath();
  ctx.arc(W - 90, 250, 340, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(c.accent, cta ? 0.1 : 0.07);
  ctx.beginPath();
  ctx.arc(110, H - 170, 210, 0, Math.PI * 2);
  ctx.fill();

  // baris atas: pill kecil + logo
  const kicker = String(slide.kicker || `${i + 1}/${n}`);
  ctx.font = `700 30px ${FONT}`;
  const pw = ctx.measureText(kicker).width + 56;
  ctx.fillStyle = c.accent;
  rr(ctx, pad, 84, pw, 64, 32);
  ctx.fill();
  ctx.fillStyle = c.pillText;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(kicker, pad + 28, 117);
  if (logo && logo.width) {
    const k = Math.min(240 / logo.width, 72 / logo.height);
    const lw = logo.width * k;
    const lh = logo.height * k;
    ctx.drawImage(logo, W - pad - lw, 116 - lh / 2, lw, lh);
  }

  // isi: judul + isi, diletakkan di tengah area konten
  const top = 230;
  const area = H - 210 - top;
  const isCover = i === 0 && !slide.kicker;
  const maxW = W - pad * 2;
  const title = fit(ctx, slide.title || '', { weight: 800, maxW, maxH: slide.body ? area * 0.6 : area * 0.9, max: isCover ? 124 : 96, min: 52, lh: 1.14 });
  const body = slide.body ? fit(ctx, slide.body, { weight: 500, maxW, maxH: Math.max(120, area - title.h - 110), max: 48, min: 30, lh: 1.42 }) : null;
  const total = 14 + 40 + title.h + (body ? 56 + body.h : 0);
  let y = top + Math.max(0, (area - total) / 2) - 16;

  ctx.fillStyle = c.accent;
  rr(ctx, pad, y, 120, 14, 7);
  ctx.fill();
  y += 14 + 40;
  ctx.textBaseline = 'top';
  ctx.fillStyle = c.ink;
  ctx.font = `800 ${title.size}px ${FONT}`;
  title.lines.forEach((line, k) => ctx.fillText(line, pad, y + k * title.size * 1.14));
  if (body) {
    y += title.h + 56;
    ctx.fillStyle = rgba(c.ink, 0.8);
    ctx.font = `500 ${body.size}px ${FONT}`;
    body.lines.forEach((line, k) => ctx.fillText(line, pad, y + k * body.size * 1.42));
  }

  // baris bawah: handle + penanda posisi
  ctx.textBaseline = 'middle';
  if (st.handle) {
    ctx.font = `700 30px ${FONT}`;
    ctx.fillStyle = rgba(c.ink, 0.65);
    ctx.fillText(st.handle, pad, H - 110);
  }
  if (n > 1 && n <= 12) {
    let x = W - pad;
    for (let k = n - 1; k >= 0; k -= 1) {
      const w = k === i ? 44 : 14;
      x -= w;
      ctx.fillStyle = k === i ? c.accent : rgba(c.ink, 0.22);
      rr(ctx, x, H - 117, w, 14, 7);
      ctx.fill();
      x -= 14;
    }
  }
}

// ---------- baca slide dari item board ----------
const clean = (s) => String(s || '').replace(/[*_`#]+/g, '').replace(/\s+/g, ' ').trim();

// "Judul: ...\nIsi: ..." -> { judul, isi }. Baris tanpa kunci disambung ke kunci sebelumnya.
function parseKV(text) {
  const out = {};
  let key = null;
  for (const line of String(text || '').split('\n')) {
    const m = /^\s*[-*•]?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ()/]{1,24}?)\s*:\s*(.*)$/.exec(line);
    if (m) {
      key = m[1].toLowerCase().replace(/\s*\(.*\)\s*/g, '').replace(/\s+/g, ' ').trim();
      out[key] = m[2];
    } else if (key && line.trim()) {
      out[key] = `${out[key]} ${line.trim()}`;
    }
  }
  return out;
}

function seconds(text) {
  const m = /(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)/.exec(String(text || ''));
  if (!m) return null;
  const d = Number(m[2].replace(',', '.')) - Number(m[1].replace(',', '.'));
  return d > 0 ? d : null;
}

export function slidesFromItem(item) {
  const fields = (item?.content?.fields || []).filter((f) => f.kind === 'text');

  if (item.type === 'carousel') {
    return fields
      .filter((f) => /^slide\s*\d+/i.test(f.label))
      .map((f) => {
        const kv = parseKV(f.value);
        if (kv.judul) return { title: clean(kv.judul), body: clean(kv.isi) };
        const [first, ...rest] = String(f.value).split('\n').filter((l) => l.trim());
        return { title: clean(first), body: clean(rest.join(' ')) };
      })
      .filter((s) => s.title);
  }

  if (item.type === 'video_script') {
    return fields
      .filter((f) => /^(hook|scene|cta)/i.test(f.label))
      .map((f) => {
        const kv = parseKV(f.value);
        const screen = clean(kv['teks layar'] || kv.teks);
        const voice = clean(kv.narasi);
        const title = screen || voice || clean(kv.visual) || clean(String(f.value).split('\n')[0]);
        return {
          kicker: clean(f.label.replace(/\(.*\)/, '')).slice(0, 18),
          title,
          body: screen ? voice : '',
          secs: seconds(kv.detik || f.value),
        };
      })
      .filter((s) => s.title);
  }
  return [];
}
