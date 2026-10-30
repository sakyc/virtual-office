import React,{useEffect,useState} from 'react';
export function ManagedDemoBanner({demo}){
  const [current,setCurrent]=useState(demo),[unavailable,setUnavailable]=useState(false);
  useEffect(()=>{setCurrent(demo);const c=new AbortController();let pending=false;
    async function refresh(){if(document.hidden||pending)return;pending=true;try{const r=await fetch('/auth/me',{credentials:'same-origin',signal:c.signal});if(r.status===401){window.location.assign('/login');return;}if(!r.ok)throw Error();const data=await r.json();if(!c.signal.aborted){setCurrent(data.managedDemo);setUnavailable(false);}}catch{if(!c.signal.aborted)setUnavailable(true);}finally{pending=false;}}
    const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{c.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};},[demo]);
  return <aside className="billing-notice" role="status" style={{margin:0,borderRadius:0,padding:'10px 20px'}}>{unavailable?'Status demo belum dapat diperbarui.':`Akun demo bersama · AI ${current?.aiEnabled?'aktif':'nonaktif, hubungi admin'}.`} Kantor dan riwayat dibagikan. Jangan masukkan data rahasia.</aside>;
}
