import {createHash,createHmac,randomInt,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {readCookie,resolveSession} from './auth/sessions.js';
import {createNativeLimiter} from './auth/native-routes.js';
import {createWhatsapp} from './whatsapp.js';
import {normalizeWhatsapp} from '../shared/auth-validation.js';
import {teamTemplates} from '../shared/workspace-team.js';
import {addAgent} from './workspace-team.js';
import {TRIAL_DAYS} from '../shared/trial.js';

const fail=(code,status=409)=>{throw Object.assign(Error(code),{code,status});};
const phoneDigest=phone=>createHash('sha256').update(`karyora-demo-phone:${phone}`).digest('hex');
export function demoConfiguration(env=process.env) {
  return {enabled:env.DEMO_ENABLED==='1' && Boolean(env.BLITZMES_API_KEY?.trim()) && (env.DEMO_CODE_SECRET?.length||0)>=32,
    days:TRIAL_DAYS,creditIdr:'3000',divisions:6};
}
export function demoDigest(secret,user,purpose,value) {
  return createHmac('sha256',secret).update(JSON.stringify([user,purpose,value])).digest('hex');
}
export function matchingCode(expected,actual) {
  return typeof expected==='string' && /^[a-f0-9]{64}$/.test(expected) && timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(actual,'hex'));
}
export function createDemoService({getPool,env=process.env,whatsapp=createWhatsapp({env})}) {
  const config=demoConfiguration(env);
  const digest=(user,purpose,value)=>demoDigest(env.DEMO_CODE_SECRET,user,purpose,value);
  async function transaction(userId,action) {
    const c=await getPool().getConnection();
    try {
      await c.beginTransaction();
      const [[user]]=await c.execute("SELECT id, whatsapp_number, display_name FROM users WHERE id=? AND status='active' FOR UPDATE",[userId]);
      if(!user)fail('DEMO_SESSION_REQUIRED',401);
      const [[row]]=await c.execute(`SELECT *, otp_expires_at>UTC_TIMESTAMP() AS otp_valid,
        activation_expires_at>UTC_TIMESTAMP() AS activation_valid,
        last_sent_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 60 SECOND) AS cooling,
        send_window_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) AS in_window,
        expires_at>UTC_TIMESTAMP() AS active FROM demo_access WHERE user_id=? FOR UPDATE`,[userId]);
      const result=await action(c,user,row);
      await c.commit();
      // Failed code attempts and send budgets must survive an error response.
      if(result?.failure)fail(result.failure,result.status||400);
      return result;
    }catch(e){await c.rollback().catch(()=>{});throw e;}finally{c.release();}
  }
  async function status(userId) {
    return transaction(userId,async(_c,user,row)=>({enabled:config.enabled,days:config.days,creditIdr:config.creditIdr,divisions:6,
      phone:normalizeWhatsapp(user.whatsapp_number)?.replace(/.(?=.{4})/g,'•') || null,
      stage:row?.activated_at?'activated':row?.verified_at?'activation':'otp',
      active:Boolean(row?.activated_at && row.active),subscriptionStatus:row?.activated_at?(row.active?'trial':'trial_expired'):null,
      workspaceId:row?.workspace_id || null,activatedAt:row?.activated_at || null,expiresAt:row?.expires_at || null}));
  }
  async function send(userId,kind) {
    if(!config.enabled)fail('DEMO_UNAVAILABLE',503);
    return transaction(userId,async(c,user,row)=>{
      const phone=normalizeWhatsapp(user.whatsapp_number);
      if(!phone)fail('DEMO_PHONE_REQUIRED',400);
      if(row?.activated_at)fail('DEMO_ALREADY_CLAIMED');
      if(row && row.pending_phone_hash!==phoneDigest(phone))fail('DEMO_PHONE_CHANGED');
      if(row?.cooling || (row?.in_window && row.sends>=10))fail('DEMO_SEND_LIMIT',429);
      if(kind==='activation' && !row?.verified_at)fail('DEMO_VERIFY_FIRST');
      if(kind==='otp' && row?.verified_at)fail('DEMO_ALREADY_VERIFIED');
      if(!row) {
        // Only verification claims the unique phone: sending OTP cannot squat a
        // victim's number indefinitely. The unique key serializes verified claims.
        await c.execute('INSERT INTO demo_access(user_id,pending_phone_hash) VALUES (?,?)',[userId,phoneDigest(phone)]);
      }
      const activation=kind==='activation';
      const code=activation?`KRY-DEMO-${randomBytes(10).toString('hex').toUpperCase()}`:String(randomInt(100000,1000000));
      const message=activation?`Nomor WhatsApp Anda berhasil diverifikasi.\n\nKode aktivasi Trial Karyora: ${code}\n\nMasukkan di halaman Trial Karyora. Berlaku 24 jam, sekali pakai, khusus akun Anda. Trial ${config.days} hari dimulai setelah aktivasi. Jangan bagikan kode ini.`
        :`Kode OTP Karyora Anda: ${code}\n\nBerlaku 5 menit. Jangan bagikan kode ini. OTP ini untuk verifikasi nomor, bukan kode aktivasi trial.`;
      const prefix=activation?'activation':'otp';
      await c.execute(`UPDATE demo_access SET ${prefix}_hash=?,${prefix}_expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ${activation?'24 HOUR':'5 MINUTE'}),${prefix}_attempts=0,
        sends=CASE WHEN send_window_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) THEN sends+1 ELSE 1 END,
        send_window_at=CASE WHEN send_window_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) THEN send_window_at ELSE UTC_TIMESTAMP() END,
        last_sent_at=UTC_TIMESTAMP() WHERE user_id=?`,[digest(userId,kind,code),userId]);
      try{await whatsapp.send(phone,message);}catch{
        // Unknown gateway delivery must never expose a usable code or erase rate limits.
        await c.execute(`UPDATE demo_access SET ${prefix}_hash=NULL WHERE user_id=?`,[userId]);
        return {failure:'DEMO_SEND_UNCONFIRMED',status:503};
      }
      return {sent:true,stage:activation?'activation':'otp'};
    });
  }
  async function verify(userId,code) {
    if(!config.enabled)fail('DEMO_UNAVAILABLE',503);
    return transaction(userId,async(c,user,row)=>{
      if(row?.activated_at)fail('DEMO_ALREADY_CLAIMED');
      if(row?.verified_at)return {verified:true};
      if(!row?.otp_valid || row.otp_attempts>=5 || !row.otp_hash)fail('DEMO_CODE_EXPIRED',400);
      if(!matchingCode(row.otp_hash,digest(userId,'otp',code))) {
        await c.execute('UPDATE demo_access SET otp_attempts=otp_attempts+1 WHERE user_id=?',[userId]);
        return {failure:'DEMO_CODE_INVALID'};
      }
      if(row.pending_phone_hash!==phoneDigest(normalizeWhatsapp(user.whatsapp_number)))fail('DEMO_PHONE_CHANGED');
      await c.execute('UPDATE demo_access SET verified_at=UTC_TIMESTAMP(),phone_hash=pending_phone_hash,otp_hash=NULL,last_sent_at=NULL WHERE user_id=?',[userId]);
      await c.execute('UPDATE users SET whatsapp_verified_at=UTC_TIMESTAMP() WHERE id=?',[userId]);
      return {verified:true};
    });
  }
  async function activate(userId,sessionId,code) {
    if(!config.enabled)fail('DEMO_UNAVAILABLE',503);
    return transaction(userId,async(c,user,row)=>{
      if(row?.activated_at) return {activated:true,existing:true};
      if(!row?.verified_at || !row.activation_valid || row.activation_attempts>=5 || !row.activation_hash)fail('DEMO_CODE_EXPIRED',400);
      if(!matchingCode(row.activation_hash,digest(userId,'activation',code))) {
        await c.execute('UPDATE demo_access SET activation_attempts=activation_attempts+1 WHERE user_id=?',[userId]);
        return {failure:'DEMO_CODE_INVALID'};
      }
      if(row.phone_hash!==phoneDigest(normalizeWhatsapp(user.whatsapp_number)))fail('DEMO_PHONE_CHANGED');
      const [[session]]=await c.execute(`SELECT id FROM sessions WHERE id=? AND user_id=? AND revoked_at IS NULL
        AND idle_expires_at>UTC_TIMESTAMP() AND absolute_expires_at>UTC_TIMESTAMP() FOR UPDATE`,[sessionId,userId]);
      if(!session)fail('DEMO_SESSION_REQUIRED',401);
      // Demo belongs to a fresh account; do not overwrite an existing tenant/team.
      const [[membership]]=await c.execute(`SELECT organization_id FROM organization_memberships WHERE user_id=? AND revoked_at IS NULL LIMIT 1`,[userId]);
      const [[workspaceMembership]]=await c.execute('SELECT workspace_id FROM workspace_memberships WHERE user_id=? AND revoked_at IS NULL LIMIT 1',[userId]);
      if(membership || workspaceMembership)fail('DEMO_FRESH_ACCOUNT_REQUIRED');
      const [org]=await c.execute('INSERT INTO organizations(slug,name,created_by_user_id) VALUES (?,?,?)',[`demo-${randomUUID()}`,'Kantor Trial Karyora',userId]);
      const organizationId=org.insertId;
      await c.execute("INSERT INTO organization_memberships(organization_id,user_id,role,created_by_user_id) VALUES (?,?,'owner',?)",[organizationId,userId,userId]);
      const [workspace]=await c.execute("INSERT INTO workspaces(organization_id,slug,name,created_by_user_id) VALUES (?,'main','Kantor Trial',?)",[organizationId,userId]);
      const tenant={organizationId,workspaceId:workspace.insertId};
      await c.execute("INSERT INTO workspace_memberships(workspace_id,user_id,role,created_by_user_id) VALUES (?,?,'admin',?)",[tenant.workspaceId,userId,userId]);
      // No paid-plan row. All six teams and credit are committed with activation.
      for(const [slot,template] of teamTemplates.slice(0,6).entries()) {
        const divisionId=randomUUID();
        await c.execute('INSERT INTO workspace_divisions(id,organization_id,workspace_id,name,template_id,slot,created_by_user_id) VALUES (?,?,?,?,?,?,?)',[divisionId,organizationId,tenant.workspaceId,template.name,template.id,slot,userId]);
        for(const agent of template.agents.slice(0,4))await addAgent(c,tenant,userId,divisionId,{name:agent.name,role:agent.role,instructions:agent.focus,modelTier:'team'},agent.id);
      }
      await c.execute('INSERT INTO billing_wallets(organization_id) VALUES (?)',[organizationId]);
      const grant=randomUUID();
      await c.execute(`UPDATE demo_access SET organization_id=?,workspace_id=?,activated_at=UTC_TIMESTAMP(),expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ${config.days} DAY),activation_hash=NULL WHERE user_id=?`,[organizationId,tenant.workspaceId,userId]);
      // Credit and access share the exact stored deadline, even across queries.
      await c.execute("INSERT INTO billing_credit_grants(id,organization_id,source,reference_id,original_idr,available_idr,expires_at) SELECT ?,?,'package',?,3000,3000,expires_at FROM demo_access WHERE user_id=?",[grant,organizationId,`demo:${userId}`,userId]);
      await c.execute("INSERT INTO billing_ledger(id,organization_id,idempotency_key,request_hash,kind,amount_idr,result) VALUES (?,?,?,?,'credit',3000,?)",[randomUUID(),organizationId,`demo:${userId}`,digest(userId,'grant','3000'),JSON.stringify({grantId:grant,source:'demo',amountIdr:'3000'})]);
      await c.execute('UPDATE sessions SET active_workspace_id=? WHERE id=? AND user_id=?',[tenant.workspaceId,sessionId,userId]);
      return {activated:true};
    });
  }
  return {status,send,verify,activate};
}

export function installDemoRoutes(app,{getPool,env=process.env,service=createDemoService({getPool,env})}) {
  const config=demoConfiguration(env),limit=createNativeLimiter();
  const origin=env.APP_ORIGIN || (env.NODE_ENV==='production'?null:'http://localhost:5173');
  app.get('/api/demo/config',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json({enabled:config.enabled});});
  const handle=(action,fields=[])=>async(req,res)=>{
    res.setHeader('Cache-Control','no-store');let c;
    try {
      if(!config.enabled)fail('DEMO_UNAVAILABLE',503);
      if(req.method==='POST' && (!origin || req.get('origin')!==origin || !req.is('application/json')))fail('DEMO_ORIGIN_REQUIRED',403);
      if(Object.keys(req.query).length || (req.method==='POST' && (!req.body || Array.isArray(req.body) || Object.keys(req.body).sort().join()!==fields.slice().sort().join())))fail('DEMO_FIELDS_INVALID',400);
      c=await getPool().getConnection();
      const principal=await resolveSession(c,readCookie(req.headers.cookie,'vo_session'));c.release();c=null;
      if(!principal)fail('DEMO_SESSION_REQUIRED',401);
      if(req.method==='POST' && !limit(req.ip,`demo:${principal.userId}`))fail('DEMO_SEND_LIMIT',429);
      if(fields.length && (typeof req.body.code!=='string' || req.body.code.length>40 || !req.body.code.trim()))fail('DEMO_FIELDS_INVALID',400);
      res.json(await action(principal,req.body));
    }catch(e){const known=/^DEMO_[A-Z_]+$/.test(e.code||'');res.status(e.code==='ER_DUP_ENTRY'?409:known?e.status:503).json({code:e.code==='ER_DUP_ENTRY'?'DEMO_ALREADY_CLAIMED':known?e.code:'DEMO_UNAVAILABLE'});}
    finally{c?.release();}
  };
  app.get('/api/demo',handle(p=>service.status(p.userId)));
  app.post('/api/demo/otp',handle(p=>service.send(p.userId,'otp')));
  app.post('/api/demo/verify',handle(async(p,b)=>{
    await service.verify(p.userId,b.code.trim());
    return {...await service.send(p.userId,'activation'),verified:true};
  },['code']));
  app.post('/api/demo/activation-code',handle(p=>service.send(p.userId,'activation')));
  app.post('/api/demo/activate',handle((p,b)=>service.activate(p.userId,p.sessionId,b.code.trim().toUpperCase()),['code']));
}
