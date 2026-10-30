const extraIcons = {
  tasks: 'M9 5H5v16h14V5h-4 M9 3h6v4H9z M9 12h6 M9 16h4',
  templates: 'M5 3h10l4 4v14H5z M9 11h6 M9 15h6',
  clients: 'M4 4h16v16H4z M8 8h8 M8 12h8',
  billing: 'M3 5h18v14H3z M3 9h18 M7 14h4',
  catalogAdmin: 'M12 3v18 M3 12h18',
};
const sections = {
  overview: 'overview', office: 'office', team: 'agents', jobs: 'tasks', board: 'jobs',
  templates: 'templates', clients: 'clients', members: 'members', billing: 'billing', settings: 'settings',
  usage: 'usage', models: 'keys',
};
const paths = {
  overview: '/dashboard', office: '/dashboard/office', agents: '/dashboard/team', tasks: '/dashboard/jobs',
  jobs: '/dashboard/board', templates: '/dashboard/templates', clients: '/dashboard/clients',
  members: '/dashboard/members', billing: '/dashboard/billing', settings: '/dashboard/settings', catalogAdmin: '/admin',
  usage: '/dashboard/usage', keys: '/dashboard/models',
};
export function dashboardNavigation({ baseGroups, section, view = 'overview', platformAdmin = false, managedDemo = false, onNavigate, setView }) {
  const base = Object.fromEntries(baseGroups.flatMap(group => group.items).map(item => [item.id, item]));
  const activeId = section === 'overview' ? view : sections[section];
  const groups = [
    ['Utama', [['overview', 'Ringkasan'], ['office', 'Kantor 3D']]],
    ['Pekerjaan', [['agents', 'Divisi & agen'], ['tasks', 'Tugas'], ['jobs', 'Board & persetujuan'], ['templates', 'Template tugas'], ['clients', 'Klien']]],
    ['Organisasi', [['members', 'Anggota & akses'], ['billing', 'Langganan & saldo'], ['usage', 'Penggunaan AI']]],
    ['Pengaturan', [['keys', 'Model AI'], ['settings', 'Pengaturan akun']]],
    ...(platformAdmin ? [['Platform', [['catalogAdmin', 'Dashboard admin']]]] : []),
  ];
  return groups.map(([title, entries]) => ({ title, items: entries.filter(([id])=>!managedDemo||!['members','catalogAdmin'].includes(id)).map(([id, label]) => {
    const active = id === activeId;
    return {
      id, label, icon: extraIcons[id] || base[id]?.icon || '',
      current: active ? 'page' : undefined,
      bg: active ? 'var(--accentSoft)' : 'transparent', ink: active ? 'var(--accentText)' : 'var(--soft)',
      weight: active ? 800 : 600, shadow: active ? 'inset 3px 0 0 var(--accent)' : 'none',
      go() {
        // Usage/model are existing dashboard views, not placeholder links.
        setView(paths[id] ? 'overview' : id);
        onNavigate(paths[id] || '/dashboard');
      },
    };
  }) }));
}
