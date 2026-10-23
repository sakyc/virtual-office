const metricKeys = ['totalJobs', 'activeJobs', 'completedJobs', 'totalClients', 'approvedItems'];

export async function loadDashboardOverview(signal) {
  try {
    const response = await fetch('/api/dashboard/overview', { credentials: 'same-origin', signal });
    if (!response.ok) throw new Error();
    const body = await response.json();
    if (!metricKeys.every((key) => Number.isSafeInteger(body?.metrics?.[key]) && body.metrics[key] >= 0) || !Array.isArray(body.recentJobs)) throw new Error();
    return body;
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Ringkasan workspace belum dapat dimuat. Coba lagi.');
  }
}

export function dashboardChecklist(profile, overview) {
  return [
    { label: 'Organisasi dan workspace siap', done: Boolean(profile?.activeWorkspace?.id) },
    { label: 'Tambahkan klien pertama', done: overview ? overview.metrics.totalClients > 0 : null },
    { label: 'Kirim perintah pertama', done: overview ? overview.metrics.totalJobs > 0 : null },
    { label: 'Setujui hasil pekerjaan', done: overview ? overview.metrics.approvedItems > 0 : null },
  ];
}
