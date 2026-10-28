const titles = {
  '/': 'Karyora — Kantor AI untuk Tim Anda',
  '/login': 'Masuk', '/register': 'Daftar', '/login/complete': 'Menyelesaikan login', '/demo': 'Aktivasi Demo',
  '/join': 'Undangan workspace', '/onboarding': 'Siapkan kantor',
  '/dashboard': 'Dashboard', '/dashboard/office': 'Kantor 3D',
  '/dashboard/workers': 'Tim AI', '/dashboard/team': 'Tim AI',
  '/dashboard/clients': 'Klien', '/dashboard/members': 'Anggota & akses',
  '/dashboard/board': 'Board tugas', '/dashboard/jobs': 'Tugas',
  '/dashboard/templates': 'Template tugas', '/dashboard/settings': 'Pengaturan',
  '/dashboard/billing': 'Langganan & saldo', '/dashboard/usage': 'Penggunaan AI',
  '/dashboard/models': 'Model AI', '/dashboard/reference': 'Referensi dashboard',
  '/admin': 'Admin', '/admin/users': 'Kelola pengguna',
  '/admin/organizations': 'Kelola organisasi', '/admin/subscriptions': 'Kelola langganan',
  '/admin/billing': 'Penagihan platform', '/admin/models': 'Kelola model AI',
  '/admin/audit': 'Audit platform',
};

export function pageTitle(path) {
  if (path === '/') return titles[path];
  return `${titles[path] || 'Halaman tidak ditemukan'} | Karyora`;
}
