export async function loadUsage(signal) {
  const response = await fetch('/api/dashboard/usage', { credentials: 'same-origin', cache: 'no-store', signal });
  if (!response.ok) throw new Error(response.status === 401 ? 'Sesi berakhir. Silakan masuk kembali.' : 'Pemakaian belum dapat dimuat. Pastikan migrasi 004 sudah diverifikasi operator.');
  const body = await response.json();
  if (!body?.totals || !Array.isArray(body.recent) || !['workspace', 'self'].includes(body.scope)) throw new Error('Data pemakaian tidak valid.');
  return body;
}
