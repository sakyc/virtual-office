import {useEffect} from 'react';
export function ManagedDemoBanner(){
  // Keep session revocation checks without displaying a presentation banner.
  // AI access remains enforced by the server, not this component.
  useEffect(()=>{const c=new AbortController();let pending=false;
    async function refresh(){if(document.hidden||pending)return;pending=true;try{const r=await fetch('/auth/me',{credentials:'same-origin',signal:c.signal});if(r.status===401&&!c.signal.aborted)window.location.assign('/login');}catch{/* Retry on the next focus/timer; API authorization remains server-side. */}finally{pending=false;}}
    const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{c.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};},[]);
  return null;
}
