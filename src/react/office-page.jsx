import React, { useEffect, useRef, useState } from 'react';
import { startOfficeWorkloadSync } from '../office-workloads.js';

export function OfficePage({ onNavigate }) {
  const [frame, setFrame] = useState(null);
  const [state, setState] = useState({ status: 'loading' });
  const sync = useRef(null);
  useEffect(() => {
    if (!frame) return;
    const runner = startOfficeWorkloadSync({ send: (message) => frame.contentWindow?.postMessage(message, location.origin), onState: setState });
    sync.current = runner;
    const navigate = (event) => {
      if (event.source === frame.contentWindow && event.origin === location.origin && event.data?.type === 'virtual-office:navigate'
          && ['/app/board', '/app/jobs'].includes(event.data.path)) onNavigate(event.data.path);
    };
    addEventListener('message', navigate);
    return () => { runner.stop(); removeEventListener('message', navigate); if (sync.current === runner) sync.current = null; };
  }, [frame, onNavigate]);
  return <div className="office"><div className="office-toolbar">
    <button onClick={() => onNavigate('/app')}>← Dashboard</button>
    <button onClick={() => onNavigate('/app/jobs')}>Buat perintah</button>
    <button onClick={() => onNavigate('/app/board')}>Lihat board</button>
    <button onClick={() => onNavigate('/app/team')}>Kelola divisi & agen</button>
    <small>Chat sesuai izin workspace · riwayat sementara di tab ini. Hasil pekerjaan ada di Board.</small>
    <span role={state.status === 'unavailable' ? 'alert' : 'status'}>{state.status === 'loading' ? 'Memuat aktivitas workspace…' : state.status === 'ready' ? `${state.activeJobs} pekerjaan berjalan · diperbarui ${state.updatedAt.toLocaleTimeString('id-ID')}` : 'Aktivitas belum dapat dimuat. Status agent tidak diketahui.'}</span>
    {state.status === 'unavailable' && <button onClick={() => sync.current?.refresh()}>Coba lagi</button>}
  </div><iframe ref={setFrame} onLoad={() => sync.current?.refresh()} title="Virtual Office 3D" src="/office.html?tenant=1" /></div>;
}
