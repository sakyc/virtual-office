// Destinations are fixed local routes; URL parameters never establish identity or membership.
export function destinationForProfile(profile) {
  if (!profile?.user || !Array.isArray(profile.workspaces)) throw new Error('Profil sesi tidak valid.');
  if (profile.activeWorkspace?.id) return '/dashboard';
  return profile.workspaces.length ? null : '/onboarding';
}

export function redirectForProtectedPath(profile, path) {
  if (!profile) return '/login';
  const destination = destinationForProfile(profile);
  if (destination === null) return '/login/complete';
  if (path === '/onboarding') return destination === '/dashboard' ? '/dashboard' : null;
  return destination === '/onboarding' ? '/onboarding' : null;
}

export async function loadAuthProfile(signal) {
  const response = await fetch('/auth/me', { credentials: 'same-origin', signal });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Layanan masuk belum tersedia. Coba lagi sebentar.');
  const profile = await response.json();
  destinationForProfile(profile);
  return profile;
}

export async function logoutSession() {
  try {
    const response = await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error();
  } catch { throw new Error('Logout belum berhasil. Coba lagi sebentar.'); }
}
