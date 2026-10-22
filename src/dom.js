// Helper kecil untuk membangun DOM tanpa innerHTML (semua teks lewat textContent, aman dari XSS).
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  }
  return el;
}

export function toast(msg, { action, onAction, ms = 4500 } = {}) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = h('div', { id: 'toasts', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const t = h('div', { class: 'toast' }, h('span', {}, msg), action && h('button', { type: 'button', onclick: () => { onAction?.(); t.remove(); } }, action));
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

export async function copyText(text, btn) {
  const old = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Tersalin';
  } catch {
    btn.textContent = 'Gagal';
  }
  setTimeout(() => { btn.textContent = old; }, 1200);
}

export function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  if (s < 86400 * 14) return `${Math.floor(s / 86400)} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const debounce = (fn, ms) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};
