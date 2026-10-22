import { h, toast } from './dom.js';
import { THEMES, SIZES, drawSlide, loadFonts, slidesFromItem } from './render.js';
import { makeZip } from './zip.js';

const KEY = 'kantorai.studio';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const savePrefs = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* abaikan */ } };

const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'konten';

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const toBlob = (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png'));

// Rekam rangkaian slide jadi video (tanpa suara): crossfade + zoom pelan, memakai MediaRecorder bawaan browser.
async function recordVideo(frames, W, H, onProgress) {
  if (typeof MediaRecorder === 'undefined') throw new Error('Browser ini belum mendukung perekaman video. Pakai Chrome atau Edge terbaru.');
  const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error('Browser ini tidak punya format video yang didukung. Pakai Chrome atau Edge terbaru.');

  const out = h('canvas', { width: W, height: H });
  const ctx = out.getContext('2d');
  const rec = new MediaRecorder(out.captureStream(30), { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = r; });

  const FADE = 0.4;
  const total = frames.reduce((a, f) => a + f.secs, 0);
  const blit = (img, alpha, zoom) => {
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, -W / 2, -H / 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  rec.start(500);
  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = (now) => {
      const t = (now - t0) / 1000;
      if (t >= total) { resolve(); return; }
      let acc = 0;
      let i = 0;
      while (i < frames.length - 1 && t >= acc + frames[i].secs) { acc += frames[i].secs; i += 1; }
      const local = t - acc;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      const zoom = 1 + 0.035 * Math.min(1, local / frames[i].secs);
      if (i > 0 && local < FADE) {
        blit(frames[i - 1].canvas, 1, 1.035);
        blit(frames[i].canvas, local / FADE, zoom);
      } else blit(frames[i].canvas, 1, zoom);
      onProgress(t / total);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  await stopped;
  const type = mime.split(';')[0];
  return { blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm' };
}

// Bagian "Gambar & video" di detail kartu carousel / skenario video. Mengembalikan null kalau tidak ada slide terbaca.
export function studioSection(item) {
  const slides = slidesFromItem(item);
  if (!slides.length) return null;

  const isVideo = item.type === 'video_script';
  const [PW, PH] = isVideo ? SIZES.story : SIZES.post;
  const prefs = { theme: 'biru', accent: '', handle: '', secs: 3, logo: '', ...loadPrefs() };
  let logoImg = null;
  let videoUrl = null;
  let timer = null;
  const TW = 360;
  const TH = Math.round((TW * PH) / PW);
  const base = slug(item.title);

  const theme = () => THEMES.find((t) => t.id === prefs.theme) || THEMES[0];
  const style = () => ({ ...theme(), accent: prefs.accent || theme().accent, handle: prefs.handle.trim() });
  const meta = (i) => ({ i, n: slides.length, logo: logoImg, cta: !isVideo && slides.length > 1 && i === slides.length - 1 });
  const persist = () => savePrefs(prefs);

  // ---------- kontrol ----------
  const themeSel = h('select', { 'aria-label': 'Tema warna', onchange: () => { prefs.theme = themeSel.value; prefs.accent = ''; accentIn.value = theme().accent; persist(); repaint(); } },
    THEMES.map((t) => h('option', { value: t.id }, t.name)));
  themeSel.value = prefs.theme;
  const accentIn = h('input', { type: 'color', 'aria-label': 'Warna aksen', value: prefs.accent || theme().accent, oninput: () => { prefs.accent = accentIn.value; persist(); repaint(); } });
  const handleIn = h('input', { type: 'text', placeholder: '@namaakun', maxLength: 40, 'aria-label': 'Nama akun', value: prefs.handle, oninput: () => { prefs.handle = handleIn.value; persist(); repaint(); } });
  const logoIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', hidden: true, onchange: () => pickLogo(logoIn.files[0]) });
  const logoBtn = h('button', { type: 'button', class: 'btn sm', onclick: () => (prefs.logo ? clearLogo() : logoIn.click()) }, 'Unggah logo');
  const secsIn = h('input', { type: 'number', min: 2, max: 10, step: 0.5, value: prefs.secs, 'aria-label': 'Detik per slide', oninput: () => { prefs.secs = Math.min(10, Math.max(2, Number(secsIn.value) || 3)); persist(); } });
  const status = h('p', { class: 'muted' });
  const videoBox = h('div', { class: 'video-box' });
  const videoBtn = h('button', { type: 'button', class: 'btn primary', onclick: () => makeVideo() }, 'Buat video');
  const zipBtn = h('button', { type: 'button', class: 'btn', onclick: () => downloadZip() }, 'Unduh semua (ZIP)');

  function syncLogoBtn() { logoBtn.textContent = prefs.logo ? 'Hapus logo' : 'Unggah logo'; }
  function clearLogo() { prefs.logo = ''; logoImg = null; persist(); syncLogoBtn(); repaint(); }
  function pickLogo(file) {
    if (!file) return;
    if (file.size > 400 * 1024) { toast('Logo maksimal 400 KB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { prefs.logo = String(reader.result); persist(); applyLogo().then(repaint); syncLogoBtn(); };
    reader.readAsDataURL(file);
  }
  const applyLogo = () => new Promise((res) => {
    if (!prefs.logo) { logoImg = null; res(); return; }
    const im = new Image();
    im.onload = () => { logoImg = im; res(); };
    im.onerror = () => { logoImg = null; res(); };
    im.src = prefs.logo;
  });

  // ---------- pratinjau ----------
  const thumbs = slides.map(() => h('canvas', { class: 'thumb', width: TW, height: TH }));
  const figs = slides.map((s, i) => h('figure', {},
    thumbs[i],
    h('figcaption', {},
      h('span', {}, s.kicker || `Slide ${i + 1}`),
      isVideo && s.secs ? h('small', {}, ` ${Math.round(s.secs * 10) / 10} dtk`) : null,
      h('button', { type: 'button', class: 'btn sm', onclick: () => downloadOne(i) }, 'PNG'),
    ),
  ));

  async function repaint() {
    await loadFonts();
    const st = style();
    thumbs.forEach((cv, i) => {
      const ctx = cv.getContext('2d');
      ctx.save();
      ctx.scale(TW / PW, TW / PW);
      drawSlide(ctx, PW, PH, slides[i], st, meta(i));
      ctx.restore();
    });
  }
  const repaintSoon = () => { clearTimeout(timer); timer = setTimeout(repaint, 120); };

  function fullCanvas(i, W, H) {
    const cv = h('canvas', { width: W, height: H });
    drawSlide(cv.getContext('2d'), W, H, slides[i], style(), meta(i));
    return cv;
  }

  // ---------- unduh ----------
  async function downloadOne(i) {
    await loadFonts();
    download(await toBlob(fullCanvas(i, PW, PH)), `${base}-${String(i + 1).padStart(2, '0')}.png`);
  }

  async function downloadZip() {
    zipBtn.disabled = true;
    status.textContent = 'Menyiapkan gambar…';
    try {
      await loadFonts();
      const files = [];
      for (let i = 0; i < slides.length; i += 1) {
        const blob = await toBlob(fullCanvas(i, PW, PH));
        files.push({ name: `${base}-${String(i + 1).padStart(2, '0')}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      download(makeZip(files), `${base}.zip`);
      status.textContent = `${files.length} gambar diunduh.`;
    } catch (e) {
      status.textContent = `Gagal: ${e.message}`;
    } finally {
      zipBtn.disabled = false;
    }
  }

  async function makeVideo() {
    const [VW, VH] = SIZES.story;
    videoBtn.disabled = true;
    zipBtn.disabled = true;
    status.textContent = 'Merekam video… biarkan tab ini tetap terbuka.';
    try {
      await loadFonts();
      const frames = slides.map((s, i) => ({
        canvas: fullCanvas(i, VW, VH),
        secs: Math.min(12, Math.max(1.5, isVideo && s.secs ? s.secs : prefs.secs)),
      }));
      const { blob, ext } = await recordVideo(frames, VW, VH, (p) => { videoBtn.textContent = `Merekam ${Math.round(p * 100)}%`; });
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      videoUrl = URL.createObjectURL(blob);
      videoBox.replaceChildren(...[
        h('video', { src: videoUrl, controls: true, playsInline: true }),
        h('button', { type: 'button', class: 'btn sm', onclick: () => download(blob, `${base}.${ext}`) }, `Unduh video (${ext.toUpperCase()})`),
        ext === 'webm' ? h('p', { class: 'muted' }, 'Browser ini menghasilkan WebM. Chrome/Edge terbaru biasanya bisa MP4; atau konversi dengan HandBrake / CloudConvert sebelum diunggah ke Instagram atau TikTok.') : null,
      ].filter(Boolean));
      status.textContent = 'Video selesai (tanpa suara; tambahkan musik atau narasi di aplikasi editor).';
    } catch (e) {
      status.textContent = `Gagal membuat video: ${e.message}`;
    } finally {
      videoBtn.disabled = false;
      zipBtn.disabled = false;
      videoBtn.textContent = 'Buat video';
    }
  }

  const root = h('details', { class: 'f studio', open: true },
    h('summary', {}, isVideo ? 'Storyboard & video' : 'Gambar & video'),
    h('div', { class: 'studio-ctl' }, themeSel, accentIn, handleIn, logoBtn, logoIn),
    h('div', { class: 'studio-grid' }, figs),
    h('div', { class: 'row' },
      zipBtn,
      isVideo ? h('span', { class: 'muted' }, 'Durasi tiap scene mengikuti "Detik" di skenario.') : h('label', { class: 'secs' }, 'Detik per slide ', secsIn),
      videoBtn,
    ),
    status,
    videoBox,
  );

  syncLogoBtn();
  applyLogo().then(repaintSoon);
  repaintSoon();
  return root;
}
