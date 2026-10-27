export const THEME_KEY = 'karyora.theme';

export function preferredDark({ storage, media, fallback = false } = {}) {
  try {
    const saved = storage?.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved === 'dark';
  } catch { /* Private browsing may deny storage. */ }
  try { return media ? Boolean(media('(prefers-color-scheme: dark)').matches) : fallback; }
  catch { return fallback; }
}

export function saveTheme(dark, storage) {
  try { storage?.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* Theme remains usable without storage. */ }
}
