import React, { useEffect, useRef, useState } from 'react';
import { startOfficeWorkloadSync } from '../office-workloads.js';
import { canonicalCustomerPath } from './customer-routes.js';

export function OfficePage({ onNavigate }) {
  const [frame, setFrame] = useState(null);
  const [state, setState] = useState({ status: 'loading' });
  const sync = useRef(null);
  useEffect(() => {
    if (!frame) return;
    const runner = startOfficeWorkloadSync({ send: (message) => frame.contentWindow?.postMessage(message, location.origin), onState: setState });
    sync.current = runner;
    const navigate = (event) => {
      const target = typeof event.data?.path === 'string' ? canonicalCustomerPath(event.data.path) : '';
      if (event.source === frame.contentWindow && event.origin === location.origin && event.data?.type === 'virtual-office:navigate'
          && ['/dashboard/board', '/dashboard/jobs', '/dashboard/billing'].includes(target)) onNavigate(target);
    };
    addEventListener('message', navigate);
    return () => { runner.stop(); removeEventListener('message', navigate); if (sync.current === runner) sync.current = null; };
  }, [frame, onNavigate]);
  return <div className="office"><div className="office-toolbar">
    <button onClick={() => onNavigate('/dashboard')}>← Dashboard</button>
    <button onClick={() => onNavigate('/dashboard/jobs')}>Buat perintah</button>
    <button onClick={() => onNavigate('/dashboard/board')}>Lihat board</button>
    <button onClick={() => onNavigate('/dashboard/team')}>Kelola divisi & agen</button>
    <small>Riwayat chat pribadi per agen dan workspace · Hasil pekerjaan ada di Board.</small>
    <span role={state.status === 'unavailable' ? 'alert' : 'status'}>{state.status === 'loading' ? 'Memuat aktivitas workspace…' : state.status === 'ready' ? `${state.activeJobs} pekerjaan berjalan · diperbarui ${state.updatedAt.toLocaleTimeString('id-ID')}` : 'Aktivitas belum dapat dimuat. Status agent tidak diketahui.'}</span>
    {state.status === 'unavailable' && <button onClick={() => sync.current?.refresh()}>Coba lagi</button>}
  </div><iframe ref={setFrame} onLoad={() => sync.current?.refresh()} title="Karyora 3D" src="/office.html?tenant=1" /></div>;
}
