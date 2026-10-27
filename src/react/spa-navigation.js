import { canonicalCustomerPath } from './customer-routes.js';

// Keep native behavior for modified clicks, downloads, new tabs and same-page anchors.
export function dashboardLinkDestination(event, location) {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return null;
  const link = event.target?.closest?.('a[href]');
  if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return null;
  let url;
  try { url = new URL(link.href, location.href); } catch { return null; }
  if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) return null;
  const path = canonicalCustomerPath(url.pathname);
  if (!(path === '/dashboard' || path.startsWith('/dashboard/') || path === '/admin' || path.startsWith('/admin/'))) return null;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return null;
  return path + url.search + url.hash;
}
