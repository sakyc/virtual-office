// One duration for newly activated trials; never recompute an existing expiry.
export const TRIAL_DAYS = 7;

export function trialTiming(trial, now = Date.now()) {
  if (!trial) return null;
  const end = Date.parse(trial.expiresAt);
  const active = trial.active !== false && trial.status !== 'expired' && Number.isFinite(end) && now < end;
  return { active, label: trial.shared ? active ? 'Demo terjadwal' : 'Demo berakhir' : active ? 'Trial' : 'Trial berakhir',
    daysRemaining: active ? Math.ceil((end - now) / 86400000) : 0,
    expiresLabel: Number.isFinite(end) ? new Date(end).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB' : '—' };
}
