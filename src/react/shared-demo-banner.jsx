import React,{useEffect,useState} from 'react';
export function SharedDemoBanner({visit}) {
  const [message,setMessage]=useState('');
  useEffect(()=>{
    const c=new AbortController();
    const check=()=>fetch('/auth/me',{credentials:'same-origin',cache:'no-store',signal:c.signal}).then(r=>{
      if(r.status===401)location.replace('/scheduled-demo');
    }).catch(()=>{});
    const timer=setInterval(check,30000);
    return()=>{c.abort();clearInterval(timer);};
  },[]);
  async function leave() {
    try {const r=await fetch('/auth/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error();location.assign('/scheduled-demo');}
    catch{setMessage('Belum dapat keluar. Coba lagi.');}
  }
  return <aside role="status" style={{position:'fixed',bottom:16,left:'50%',transform:'translateX(-50%)',zIndex:1000,background:'#1d2e62',color:'#fff',padding:'12px 18px',borderRadius:14,boxShadow:'0 6px 32px #0003',maxWidth:'calc(100vw - 32px)',fontSize:12}}>
    Demo bergantian · berakhir {new Date(visit.endsAt).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})} WIB · data kunjungan terpisah.
    <button style={{marginLeft:12,color:'white',textDecoration:'underline'}} onClick={leave}>Keluar demo</button>{message && <span>{message}</span>}
  </aside>;
}
