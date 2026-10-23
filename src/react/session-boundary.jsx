import React, { useEffect, useState } from 'react';
import { loadAuthProfile, redirectForProtectedPath } from './auth-flow.js';

// A UI boundary only: API authorization continues to be enforced on the server.
export function SessionBoundary({ path, onNavigate, children }) {
  const [state, setState] = useState({ path: null, error: '' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ path: null, error: '' });
    loadAuthProfile(controller.signal).then((profile) => {
      if (controller.signal.aborted) return;
      const destination = redirectForProtectedPath(profile, path);
      if (destination) onNavigate(destination, { replace: true });
      else setState({ path, error: '' });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ path: null, error: 'Sesi belum dapat diperiksa. Coba lagi sebentar.' });
    });
    return () => controller.abort();
  }, [path, retry, onNavigate]);
  if (state.path === path) return children;
  return <main className="grid min-h-screen place-content-center gap-4 bg-[#f6f8fc] p-6 text-center text-[#141a29]">
    <p role={state.error ? 'alert' : 'status'}>{state.error || 'Memeriksa sesi dan workspace…'}</p>
    {state.error && <button className="rounded-xl bg-[#3b63e0] px-5 py-3 font-bold text-white" onClick={() => setRetry((value) => value + 1)}>Coba lagi</button>}
    {state.error && <a href="/login">Kembali ke login</a>}
  </main>;
}
