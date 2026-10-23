// Destinations are fixed local routes; URL parameters never establish identity or membership.
export function destinationForProfile(profile) {
  if (!profile?.user || !Array.isArray(profile.workspaces)) throw new Error('Profil sesi tidak valid.');
  if (profile.activeWorkspace?.id) return '/app';
  return profile.workspaces.length ? null : '/onboarding';
}

export async function loadAuthProfile(signal) {
  const response = await fetch('/auth/me', { credentials: 'same-origin', signal });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Layanan masuk belum tersedia. Coba lagi sebentar.');
  const profile = await response.json();
  destinationForProfile(profile);
  return profile;
}
