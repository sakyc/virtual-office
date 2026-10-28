// Fixed destination: API credentials must never be sent to a browser-selected URL.
export function createWhatsapp({env=process.env,request=globalThis.fetch}={}) {
  const enabled=Boolean(env.BLITZMES_API_KEY?.trim());
  return {enabled,async send(receiver,message) {
    receiver=typeof receiver==='string'?receiver.replace(/^\+/,''):receiver;
    if(!enabled || !/^[1-9]\d{7,14}$/.test(receiver) || typeof message!=='string' || message.length>4000) throw Error('WHATSAPP_UNAVAILABLE');
    try {
      const response=await request('https://api.blitzmes.com/api/send-message',{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{Accept:'application/json','Content-Type':'application/json'},
        body:JSON.stringify({api_key:env.BLITZMES_API_KEY,receiver,data:{message}}),
      });
      if(!response.ok)throw Error();
      const result=await response.json();
      // Verified against Blitzmes core/server/app/controllers/api.controller.js.
      // Acceptance is not proof of handset delivery; HTTP 200 alone is insufficient.
      if(result?.status!==true)throw Error();
    }catch {throw Error('WHATSAPP_DELIVERY_UNCONFIRMED');}
  }};
}
