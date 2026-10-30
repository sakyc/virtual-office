import React, { cloneElement, useEffect, useState } from 'react';
import { loadAuthProfile, redirectForProtectedPath } from './auth-flow.js';
import { preferredDark } from './theme-preference.js';
import {SharedDemoBanner} from './shared-demo-banner.jsx';

// A UI boundary only: API authorization continues to be enforced on the server.
export function SessionBoundary({ path, onNavigate, children, preserveShell = false }) {
  const [state, setState] = useState({ path: null, profile: null, error: '' });
  const [dark] = useState(() => {
    try { return preferredDark({ storage: window.localStorage, media: window.matchMedia?.bind(window) }); }
    catch { return false; }
  });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState(current => ({ ...current, error: '' }));
    loadAuthProfile(controller.signal).then((profile) => {
      if (controller.signal.aborted) return;
      const destination = redirectForProtectedPath(profile, path);
      if (destination) {
        setState({ path: null, profile: null, error: '' });
        onNavigate(destination, { replace: true });
      } else setState({ path, profile, error: '' });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ path: null, profile: null, error: 'Sesi belum dapat diperiksa. Coba lagi sebentar.' });
    });
    return () => controller.abort();
  }, [path, retry, onNavigate]);
  if (preserveShell && state.profile && !state.error) return <>{state.profile.sharedDemo && <SharedDemoBanner visit={state.profile.sharedDemo}/>} {cloneElement(children, {
    // Only an identity/workspace change remounts the shell, never a menu change.
    key: `${state.profile.user.id}:${state.profile.activeWorkspace?.organization?.id}:${state.profile.activeWorkspace?.id || 'none'}:${state.profile.activeWorkspace?.role}`,
    verifiedProfile: state.profile, sessionPending: state.path !== path,
  })}</>;
  if (state.path === path && !state.error) return <>{state.profile?.sharedDemo && <SharedDemoBanner visit={state.profile.sharedDemo}/>} {children}</>;
  return <main className="grid min-h-screen place-content-center gap-4 p-6 text-center" style={{ background: dark ? '#0b0f17' : '#f6f8fc', color: dark ? '#eef1f7' : '#141a29' }}>
    <p role={state.error ? 'alert' : 'status'}>{state.error || 'Memeriksa sesi dan workspace…'}</p>
    {state.error && <button className="rounded-xl bg-[#3b63e0] px-5 py-3 font-bold text-white" onClick={() => setRetry((value) => value + 1)}>Coba lagi</button>}
    {state.error && <a href="/login">Kembali ke login</a>}
  </main>;
}
