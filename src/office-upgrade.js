import { h } from './dom.js';
import './office-upgrade.css';

export function createOfficeUpgradeDialog({ capacity, document: doc = document, window: win = window } = {}) {
  const close = () => dialog.close();
  const upgrade = h('a', { href: '/dashboard/billing', class: 'office-upgrade-primary' }, 'Lihat paket & upgrade');
  const dialog = h('dialog', { class: 'office-upgrade', 'aria-labelledby': 'office-upgrade-title', 'aria-describedby': 'office-upgrade-description' },
    h('div', { class: 'office-upgrade-symbol', 'aria-hidden': 'true' }, '🔒'),
    h('p', { class: 'office-upgrade-eyebrow' }, 'KAPASITAS KANTOR'),
    h('h2', { id: 'office-upgrade-title' }, 'Buka ruang untuk tim yang lebih besar'),
    h('p', { id: 'office-upgrade-description' }, capacity > 0
      ? `Kapasitas paket yang tersedia untuk workspace ini adalah ${capacity} divisi. Ruangan ini belum termasuk dalam kapasitas tersebut.`
      : 'Belum ada kapasitas divisi yang tersedia untuk workspace ini. Aktifkan paket atau periksa alokasi divisi organisasi Anda.'),
    h('p', { class: 'office-upgrade-note' }, 'Pilih paket dengan kapasitas lebih besar melalui pemilik organisasi. Upgrade tidak membuat divisi atau agen secara otomatis.'),
    h('div', { class: 'office-upgrade-actions' }, h('button', { type: 'button', onclick: close }, 'Kembali ke kantor'), upgrade));
  doc.body.append(dialog);
  const navigate = event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || win.parent === win) return;
    event.preventDefault();
    close();
    win.parent.postMessage({ type: 'virtual-office:navigate', path: '/dashboard/billing' }, win.location.origin);
  };
  const backdrop = event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
  };
  upgrade.addEventListener('click', navigate);
  dialog.addEventListener('click', backdrop);
  return {
    open() { if (!dialog.open) dialog.showModal(); },
    dispose() { if (dialog.open) close(); upgrade.removeEventListener('click', navigate); dialog.removeEventListener('click', backdrop); dialog.remove(); },
  };
}
