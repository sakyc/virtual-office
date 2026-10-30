import {randomUUID,randomInt,randomBytes,createHash} from 'node:crypto';
import {readCookie,resolveSession,issueSession,sessionCookie} from './auth/sessions.js';
import {requirePlatformAdmin} from './billing-catalog.js';
import {createNativeLimiter} from './auth/native-routes.js';
import {createWhatsapp} from './whatsapp.js';
import {normalizeWhatsapp,normalizeEmail} from '../shared/auth-validation.js';
import {demoDigest,matchingCode} from './demo.js';
import {SHARED_DEMO_ISSUER,sharedDemoEnabled,sharedDemoRouteAllowed} from './shared-demo-policy.js';
import {teamTemplates} from '../shared/workspace-team.js';
import {addAgent} from './workspace-team.js';

const fail=(code,status=409)=>{throw Object.assign(Error(code),{code,status});};
const fields=(body,keys)=>{
  if(!body || Array.isArray(body) || Object.keys(body).sort().join()!==keys.slice().sort().join())fail('VISIT_FIELDS_INVALID',400);
};
const text=(v,min,max)=>typeof v==='string' && v.trim().length>=min && v.trim().length<=max && !/[\x00-\x1f]/.test(v);
const date=v=>{
  if(typeof v!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString()!==v)fail('VISIT_DATE_INVALID',400);
  return new Date(v);
};
export function validateVisitRequest(body,now=Date.now()) {
  fields(body,['company','needs','requestedAt']);
  if(!text(body.company,2,150) || !text(body.needs,5,2000))fail('VISIT_FIELDS_INVALID',400);
  const requestedAt=date(body.requestedAt);
  if(+requestedAt<now || +requestedAt>now+90*86400000)fail('VISIT_DATE_INVALID',400);
  return {company:body.company.trim(),needs:body.needs.trim(),requestedAt};
}
export function validateGuestVisitRequest(body,now=Date.now()) {
  fields(body,['name','email','phone','company','needs','requestedAt']);
  if(!text(body.name,2,150) || !normalizeEmail(body.email) || !normalizeWhatsapp(body.phone)
    || !text(body.company,2,150) || !text(body.needs,5,2000))fail('VISIT_FIELDS_INVALID',400);
  const requestedAt=body.requestedAt===null?null:date(body.requestedAt);
  if(requestedAt && (+requestedAt<now || +requestedAt>now+90*86400000))fail('VISIT_DATE_INVALID',400);
  return {...body,name:body.name.trim(),email:normalizeEmail(body.email),phone:normalizeWhatsapp(body.phone),company:body.company.trim(),needs:body.needs.trim(),requestedAt};
}
const guestHash=token=>typeof token==='string' && /^[a-f0-9]{64}$/.test(token)?createHash('sha256').update(token).digest('hex'):null;
export function validateVisitApproval(body,now=Date.now()) {
  fields(body,['startsAt','endsAt','creditIdr','reason']);
  const startsAt=date(body.startsAt),endsAt=date(body.endsAt),duration=+endsAt-+startsAt;
  if(+startsAt<now || +startsAt>now+90*86400000 || duration<15*60000 || duration>4*3600000
    || !Number.isInteger(body.creditIdr) || body.creditIdr<100 || body.creditIdr>10000 || !text(body.reason,5,500))fail('VISIT_APPROVAL_INVALID',400);
  return {startsAt,endsAt,creditIdr:body.creditIdr,reason:body.reason.trim()};
}
const ready=env=>sharedDemoEnabled(env) && Boolean(env.BLITZMES_API_KEY?.trim()) && (env.DEMO_CODE_SECRET?.length||0)>=32;
const projection=`b.id,b.company,b.needs,b.requested_at AS requestedAt,b.status,b.enabled,b.applicant_id IS NOT NULL AS legacy,
  b.verified_at AS verifiedAt,b.starts_at AS startsAt,b.ends_at AS endsAt,
  CAST(b.credit_idr AS CHAR) AS creditIdr,b.entered_at AS enteredAt,b.created_at AS createdAt,
  b.code_hash IS NOT NULL AS codeSent,b.ends_at<=UTC_TIMESTAMP() AS expired`;

export function createSharedDemoService({getPool,env=process.env,whatsapp=createWhatsapp({env}),clock=()=>Date.now()}) {
  const digest=(id,purpose,code)=>demoDigest(env.DEMO_CODE_SECRET,id,`shared:${purpose}`,code);
  async function tx(action) {
    const c=await getPool().getConnection();
    try {
      await c.beginTransaction();const result=await action(c);await c.commit();
      if(result?.failure)fail(result.failure,result.status||400);
      return result;
    }catch(e){await c.rollback().catch(()=>{});throw e;}finally{c.release();}
  }
  async function lockControl(c) {
    const [[control]]=await c.execute('SELECT id,enabled,user_id FROM shared_demo_control WHERE id=1 FOR UPDATE');
    if(!control)fail('VISIT_SCHEMA_REQUIRED',503);return control;
  }
  async function applicant(c,userId) {
    if(userId?.guestHash)return null;
    const [[u]]=await c.execute("SELECT id,whatsapp_number,status FROM users WHERE id=? AND status='active' FOR UPDATE",[userId]);
    if(!u)fail('VISIT_SESSION_REQUIRED',401);return u;
  }
  async function booking(c,id,userId) {
    if(typeof id!=='string' || !/^[a-f0-9-]{36}$/.test(id))fail('VISIT_NOT_FOUND',404);
    const [[b]]=await c.execute(`SELECT *,otp_expires_at>UTC_TIMESTAMP() AS otp_valid,
      last_sent_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 60 SECOND) AS cooling,
      send_window_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) AS in_window
      FROM shared_demo_bookings WHERE id=?${userId===undefined?'':userId?.guestHash?' AND guest_token_hash=? AND applicant_id IS NULL':userId?.guestEntry?' AND applicant_id IS NULL':' AND applicant_id=?'} FOR UPDATE`,userId===undefined || userId?.guestEntry?[id]:[id,userId?.guestHash || userId]);
    if(!b)fail('VISIT_NOT_FOUND',404);return b;
  }
  const audit=(c,actor,id,action,reason)=>c.execute('INSERT INTO shared_demo_audit(id,booking_id,actor_user_id,action,reason) VALUES (?,?,?,?,?)',[randomUUID(),id,actor,action,reason]);
  async function list(userId) {
    return tx(async c=>{
      const [[control]]=await c.execute('SELECT enabled FROM shared_demo_control WHERE id=1');
      const [rows]=await c.execute(`SELECT ${projection} FROM shared_demo_bookings b WHERE ${userId?.guestHash?'b.guest_token_hash=? AND b.applicant_id IS NULL':'b.applicant_id=?'} ORDER BY b.created_at DESC,b.id DESC LIMIT 20`,[userId?.guestHash || userId]);
      return {enabled:ready(env),accepting:Boolean(control?.enabled),rows};
    });
  }
  async function request(userId,body) {
    const guest=Boolean(userId?.guestHash),data=guest?validateGuestVisitRequest(body,clock()):validateVisitRequest(body,clock());
    return tx(async c=>{
      const control=await lockControl(c);if(!control.enabled)fail('VISIT_PAUSED');
      const u=await applicant(c,userId),phone=guest?data.phone:normalizeWhatsapp(u.whatsapp_number);
      if(!phone)fail('VISIT_PHONE_REQUIRED',400);
      const [[exists]]=await c.execute(`SELECT id FROM shared_demo_bookings WHERE ${guest?'guest_token_hash=?':'applicant_id=?'}
        AND (status IN ('verifying','pending') OR (status IN ('approved','active') AND ends_at>UTC_TIMESTAMP())) LIMIT 1`,[guest?userId.guestHash:userId]);
      if(exists)fail('VISIT_REQUEST_EXISTS');
      const id=randomUUID();
      if(guest)await c.execute('INSERT INTO shared_demo_bookings(id,applicant_id,guest_name,guest_email,guest_token_hash,company,needs,requested_at,phone) VALUES (?,NULL,?,?,?,?,?,?,?)',[id,data.name,data.email,userId.guestHash,data.company,data.needs,data.requestedAt,phone]);
      else await c.execute('INSERT INTO shared_demo_bookings(id,applicant_id,company,needs,requested_at,phone) VALUES (?,?,?,?,?,?)',[id,userId,data.company,data.needs,data.requestedAt,phone]);
      return {id};
    });
  }
  async function sendOtp(userId,id) {
    return tx(async c=>{
      const control=await lockControl(c);if(!control.enabled)fail('VISIT_PAUSED');
      const u=await applicant(c,userId),b=await booking(c,id,userId);
      if(b.status!=='verifying')fail('VISIT_STATUS_CONFLICT');
      if(u && b.phone!==normalizeWhatsapp(u.whatsapp_number))fail('VISIT_PHONE_CHANGED');
      return send(c,b,'otp');
    });
  }
  async function send(c,b,kind) {
    if(b.cooling || (b.in_window && b.sends>=10))return {failure:'VISIT_SEND_LIMIT',status:429};
    const [[budget]]=await c.execute('SELECT COALESCE(SUM(sends),0) AS sends FROM shared_demo_bookings WHERE phone=? AND send_window_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY)',[b.phone]);
    if(Number(budget.sends)>=10)return {failure:'VISIT_SEND_LIMIT',status:429};
    const otp=kind==='otp',code=otp?String(randomInt(100000,1000000)):`KRY-VISIT-${randomBytes(16).toString('hex').toUpperCase()}`;
    const prefix=otp?'otp':'code';
    await c.execute(`UPDATE shared_demo_bookings SET ${prefix}_hash=?,${prefix}_attempts=0,
      ${otp?'otp_expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE),':''}
      sends=CASE WHEN send_window_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) THEN sends+1 ELSE 1 END,
      send_window_at=CASE WHEN send_window_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) THEN send_window_at ELSE UTC_TIMESTAMP() END,
      last_sent_at=UTC_TIMESTAMP() WHERE id=?`,[digest(b.id,kind,code),b.id]);
    const schedule=otp?'':`${new Date(b.starts_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} s/d ${new Date(b.ends_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} WIB`;
    const origin=env.APP_ORIGIN || 'http://localhost:5173';
    try {await whatsapp.send(b.phone,otp?`OTP pengajuan Demo Terjadwal Karyora: ${code}\nBerlaku 5 menit. Jangan bagikan kode ini.`
      :`Pengajuan demo Karyora disetujui.\nJadwal: ${schedule}\nSaldo AI: Rp${b.credit_idr}\nKode akses: ${code}\nBuka ${origin}/scheduled-demo?booking=${b.id}${b.applicant_id?'&legacy=1':''}\n${b.applicant_id?'Pengajuan lama: masuk dengan akun pemohon. ':'Tidak perlu login atau daftar akun. '}Masukkan kode sesuai jadwal. Sekali pakai; jangan bagikan kode.`);}
    catch {await c.execute(`UPDATE shared_demo_bookings SET ${prefix}_hash=NULL WHERE id=?`,[b.id]);return {failure:'VISIT_SEND_UNCONFIRMED',status:503};}
    return {sent:true};
  }
  async function verify(userId,id,code) {
    return tx(async c=>{
      const control=await lockControl(c);if(!control.enabled)fail('VISIT_PAUSED');
      const u=await applicant(c,userId),b=await booking(c,id,userId);
      if(b.status!=='verifying')fail('VISIT_STATUS_CONFLICT');
      if(u && b.phone!==normalizeWhatsapp(u.whatsapp_number))fail('VISIT_PHONE_CHANGED');
      if(!b.otp_valid || !b.otp_hash || b.otp_attempts>=5)fail('VISIT_CODE_EXPIRED',400);
      if(!matchingCode(b.otp_hash,digest(b.id,'otp',code))){await c.execute('UPDATE shared_demo_bookings SET otp_attempts=otp_attempts+1 WHERE id=?',[id]);return {failure:'VISIT_CODE_INVALID'};}
      if(userId?.guestHash) {
        const [[exists]]=await c.execute("SELECT id FROM shared_demo_bookings WHERE phone=? AND id<>? AND (status='pending' OR (status IN ('approved','active') AND ends_at>UTC_TIMESTAMP())) LIMIT 1",[b.phone,id]);
        if(exists)fail('VISIT_REQUEST_EXISTS');
      }
      await c.execute("UPDATE shared_demo_bookings SET verified_at=UTC_TIMESTAMP(),otp_hash=NULL,status='pending' WHERE id=?",[id]);
      // Verification belongs to the snapshotted phone, not an editable browser field.
      if(u)await c.execute('UPDATE users SET whatsapp_verified_at=UTC_TIMESTAMP() WHERE id=? AND whatsapp_number=?',[userId,u.whatsapp_number]);
      return {verified:true};
    });
  }
  async function adminList() {
    return tx(async c=>{
      const [[control]]=await c.execute('SELECT enabled,user_id AS userId FROM shared_demo_control WHERE id=1');
      const [rows]=await c.execute(`SELECT ${projection},COALESCE(b.guest_name,u.display_name) AS name,COALESCE(b.guest_email,u.email) AS email,b.phone,
        s.last_seen_at AS lastSeenAt,
        (SELECT CAST(COALESCE(SUM(h.settled_idr),0) AS CHAR) FROM billing_holds h WHERE h.organization_id=b.organization_id AND h.status='settled') AS spentIdr,
        (SELECT CAST(COALESCE(SUM(a.input_tokens),0)+COALESCE(SUM(a.output_tokens),0) AS CHAR) FROM ai_usage a WHERE a.organization_id=b.organization_id) AS tokens
        FROM shared_demo_bookings b LEFT JOIN users u ON u.id=b.applicant_id
        LEFT JOIN sessions s ON s.id=b.session_id ORDER BY b.created_at DESC,b.id DESC LIMIT 100`);
      const [history]=await c.execute('SELECT id,booking_id AS bookingId,actor_user_id AS actorUserId,action,reason,created_at AS createdAt FROM shared_demo_audit ORDER BY created_at DESC,id DESC LIMIT 50');
      return {configured:ready(env),control,rows,history};
    });
  }
  async function adminAction(actor,id,action,body) {
    return tx(async c=>{
      const control=await lockControl(c);
      if(action==='control') {
        fields(body,['enabled','reason']);if(typeof body.enabled!=='boolean' || !text(body.reason,5,500))fail('VISIT_FIELDS_INVALID',400);
        await c.execute('UPDATE shared_demo_control SET enabled=? WHERE id=1',[body.enabled]);
        await audit(c,actor,null,body.enabled?'enable_global':'disable_global',body.reason.trim());return {saved:true};
      }
      const b=await booking(c,id);
      if(action==='approve') {
        const data=validateVisitApproval(body,clock());
        if(b.status!=='pending' || !b.verified_at)fail('VISIT_VERIFY_FIRST');
        const [[overlap]]=await c.execute(`SELECT id FROM shared_demo_bookings WHERE status IN ('approved','active') AND starts_at<? AND ends_at>? LIMIT 1`,[data.endsAt,data.startsAt]);
        if(overlap)fail('VISIT_SCHEDULE_CONFLICT');
        await c.execute("UPDATE shared_demo_bookings SET status='approved',starts_at=?,ends_at=?,credit_idr=? WHERE id=?",[data.startsAt,data.endsAt,data.creditIdr,id]);
        await audit(c,actor,id,'approve',data.reason);return {saved:true};
      }
      fields(body,['reason']);if(!text(body.reason,5,500))fail('VISIT_FIELDS_INVALID',400);
      if(action==='send-code') {
        if(!control.enabled || !b.enabled || b.status!=='approved' || new Date(b.ends_at)<=new Date(clock()))fail('VISIT_STATUS_CONFLICT');
        const result=await send(c,b,'access');await audit(c,actor,id,result.failure?'send_failed':'send_code',body.reason.trim());return result;
      }
      if(!['pause','resume','end','reject'].includes(action))fail('VISIT_FIELDS_INVALID',400);
      if(action==='reject' && !['verifying','pending','approved'].includes(b.status))fail('VISIT_STATUS_CONFLICT');
      if(action!=='reject' && !['approved','active'].includes(b.status))fail('VISIT_STATUS_CONFLICT');
      if(action==='resume' && new Date(b.ends_at)<=new Date(clock()))fail('VISIT_WINDOW_CLOSED');
      if(['end','reject'].includes(action)) {
        await c.execute('UPDATE shared_demo_bookings SET status=?,enabled=0,code_hash=NULL WHERE id=?',[action==='end'?'ended':'rejected',id]);
        if(b.session_id)await c.execute("UPDATE sessions SET revoked_at=UTC_TIMESTAMP(),revoked_reason='demo_ended' WHERE id=?",[b.session_id]);
      } else await c.execute('UPDATE shared_demo_bookings SET enabled=? WHERE id=?',[action==='resume',id]);
      await audit(c,actor,id,action,body.reason.trim());return {saved:true};
    });
  }
  async function enter(userId,id,code) {
    return tx(async c=>{
      const control=await lockControl(c),u=userId?.guestEntry?null:await applicant(c,userId),b=await booking(c,id,userId),now=clock();
      if(!control.enabled || !b.enabled)fail('VISIT_PAUSED');
      if(b.status!=='approved' || !b.verified_at || !b.code_hash || b.code_attempts>=5)fail('VISIT_CODE_EXPIRED',400);
      if(u && b.phone!==normalizeWhatsapp(u.whatsapp_number))fail('VISIT_PHONE_CHANGED');
      if(now<+new Date(b.starts_at) || now>=+new Date(b.ends_at))fail('VISIT_WINDOW_CLOSED');
      if(!matchingCode(b.code_hash,digest(id,'access',code))) {await c.execute('UPDATE shared_demo_bookings SET code_attempts=code_attempts+1 WHERE id=?',[id]);return {failure:'VISIT_CODE_INVALID'};}
      const [[occupied]]=await c.execute("SELECT id FROM shared_demo_bookings WHERE status='active' AND ends_at>UTC_TIMESTAMP() LIMIT 1");
      if(occupied)fail('VISIT_OCCUPIED');
      let sharedUser=control.user_id;
      if(!sharedUser) {
        const [result]=await c.execute('INSERT INTO users(provider_issuer,external_subject,email,display_name) VALUES (?,?,?,?)',[SHARED_DEMO_ISSUER,'singleton','demo@internal.karyora.invalid','Demo Karyora']);
        sharedUser=result.insertId;await c.execute('UPDATE shared_demo_control SET user_id=? WHERE id=1',[sharedUser]);
      }
      const [[identity]]=await c.execute('SELECT provider_issuer,external_subject,status FROM users WHERE id=? FOR UPDATE',[sharedUser]);
      if(identity?.provider_issuer!==SHARED_DEMO_ISSUER || identity.external_subject!=='singleton' || identity.status!=='active')fail('VISIT_INTERNAL_ACCOUNT_INVALID',503);
      // Never share a password or reuse an applicant's account. One internal user;
      // each visit gets a clean tenant snapshot. Old data stays auditable, not deleted.
      await c.execute("UPDATE sessions SET revoked_at=UTC_TIMESTAMP(),revoked_reason='demo_next_visit' WHERE user_id=? AND revoked_at IS NULL",[sharedUser]);
      await c.execute('UPDATE organization_memberships SET revoked_at=UTC_TIMESTAMP() WHERE user_id=? AND revoked_at IS NULL',[sharedUser]);
      await c.execute('UPDATE workspace_memberships SET revoked_at=UTC_TIMESTAMP() WHERE user_id=? AND revoked_at IS NULL',[sharedUser]);
      const [org]=await c.execute('INSERT INTO organizations(slug,name,created_by_user_id) VALUES (?,?,?)',[`visit-${id}`,'Kantor Demo Karyora',sharedUser]);
      const organizationId=org.insertId;
      const [workspace]=await c.execute("INSERT INTO workspaces(organization_id,slug,name,created_by_user_id) VALUES (?,'main','Kantor Demo',?)",[organizationId,sharedUser]);
      const tenant={organizationId,workspaceId:workspace.insertId};
      await c.execute("INSERT INTO organization_memberships(organization_id,user_id,role,created_by_user_id) VALUES (?,?,'owner',?)",[organizationId,sharedUser,sharedUser]);
      await c.execute("INSERT INTO workspace_memberships(workspace_id,user_id,role,created_by_user_id) VALUES (?,?,'admin',?)",[tenant.workspaceId,sharedUser,sharedUser]);
      for(const [slot,template] of teamTemplates.slice(0,6).entries()) {
        const divisionId=randomUUID();
        await c.execute('INSERT INTO workspace_divisions(id,organization_id,workspace_id,name,template_id,slot,created_by_user_id) VALUES (?,?,?,?,?,?,?)',[divisionId,organizationId,tenant.workspaceId,template.name,template.id,slot,sharedUser]);
        for(const agent of template.agents.slice(0,4))await addAgent(c,tenant,sharedUser,divisionId,{name:agent.name,role:agent.role,instructions:agent.focus,modelTier:'team'},agent.id);
      }
      await c.execute('INSERT INTO billing_wallets(organization_id) VALUES (?)',[organizationId]);
      const grant=randomUUID();
      await c.execute("INSERT INTO billing_credit_grants(id,organization_id,source,reference_id,original_idr,available_idr,expires_at) VALUES (?,?,'package',?,?,?,?)",[grant,organizationId,`visit:${id}`,b.credit_idr,b.credit_idr,b.ends_at]);
      await c.execute("INSERT INTO billing_ledger(id,organization_id,idempotency_key,request_hash,kind,amount_idr,result) VALUES (?,?,?,?,'credit',?,?)",[randomUUID(),organizationId,`visit:${id}`,createHash('sha256').update(id).digest('hex'),b.credit_idr,JSON.stringify({source:'shared_demo',grantId:grant})]);
      const session=await issueSession(c,{userId:sharedUser,activeWorkspaceId:tenant.workspaceId,now:new Date(now)});
      await c.execute('UPDATE sessions SET absolute_expires_at=?,idle_expires_at=LEAST(idle_expires_at,?) WHERE id=?',[b.ends_at,b.ends_at,session.id]);
      await c.execute("UPDATE shared_demo_bookings SET status='active',code_hash=NULL,entered_at=UTC_TIMESTAMP(),organization_id=?,workspace_id=?,session_id=? WHERE id=?",[organizationId,tenant.workspaceId,session.id,id]);
      await audit(c,typeof userId==='object'?null:userId,id,'enter','Pemohon masuk menggunakan kode akses sekali pakai.');
      return {token:session.token,entered:true,endsAt:b.ends_at};
    });
  }
  return {list,request,sendOtp,verify,adminList,adminAction,enter};
}

export function installSharedDemoRoutes(app,{getPool,env=process.env,service=createSharedDemoService({getPool,env})}) {
  const limit=createNativeLimiter(),origin=env.APP_ORIGIN || (env.NODE_ENV==='production'?null:'http://localhost:5173');
  const handle=(action,{admin=false,keys=[],publicVisit=false,newGuest=false}={})=>async(req,res)=>{
    res.setHeader('Cache-Control','no-store');let c;
    try {
      if(!ready(env))fail('VISIT_UNAVAILABLE',503);
      if(Object.keys(req.query).length)fail('VISIT_FIELDS_INVALID',400);
      if(req.method==='POST') {
        if(!origin || req.get('origin')!==origin || !req.is('application/json'))fail('VISIT_ORIGIN_REQUIRED',403);
        fields(req.body,keys);
      }
      let p,guestToken;
      if(publicVisit) {
        guestToken=readCookie(req.headers.cookie,'vo_demo_guest');
        if(!guestHash(guestToken))guestToken=newGuest?randomBytes(32).toString('hex'):null;
        p={guestHash:guestHash(guestToken)||'0'.repeat(64)};
      } else {
        c=await getPool().getConnection();
        p=admin?await requirePlatformAdmin(c,req):await resolveSession(c,readCookie(req.headers.cookie,'vo_session'));
        c.release();c=null;
        if(!p || p.sharedDemo)fail('VISIT_SESSION_REQUIRED',401);
      }
      if(req.method==='POST' && !limit(req.ip,`visit:${p.userId || p.guestHash}`))fail('VISIT_SEND_LIMIT',429);
      const result=await action(p,req);
      if(newGuest)res.setHeader('Set-Cookie',`vo_demo_guest=${guestToken}; Path=/api/shared-demo; HttpOnly; SameSite=Lax; Max-Age=7776000${env.NODE_ENV==='production'?'; Secure':''}`);
      if(result.token){res.setHeader('Set-Cookie',sessionCookie('vo_session',result.token,{production:env.NODE_ENV==='production'}));delete result.token;}
      res.json(result);
    }catch(e){const safe=/^(VISIT_|SESSION_REQUIRED$|PLATFORM_ADMIN_REQUIRED$)/.test(e.code||'');res.status(safe?e.status||400:503).json({code:safe?e.code:'VISIT_SERVICE_ERROR'});}
    finally{c?.release();}
  };
  app.get('/api/shared-demo',handle(async(p,r)=>{
    const result=await service.list(p),token=readCookie(r.headers.cookie,'vo_session');
    if(token) {
      const connection=await getPool().getConnection();let principal;
      try{principal=await resolveSession(connection,token);}finally{connection.release();}
      if(principal && !principal.sharedDemo)result.rows.push(...(await service.list(principal.userId)).rows);
    }
    return result;
  },{publicVisit:true}));
  app.post('/api/shared-demo',handle((p,r)=>service.request(p,r.body),{publicVisit:true,newGuest:true,keys:['name','email','phone','company','needs','requestedAt']}));
  app.post('/api/shared-demo/:id/otp',handle((p,r)=>service.sendOtp(p,r.params.id),{publicVisit:true}));
  for(const action of ['verify','enter'])app.post(`/api/shared-demo/:id/${action}`,handle((p,r)=>{
    if(!text(r.body.code,1,50))fail('VISIT_FIELDS_INVALID',400);
    return service[action](action==='enter'?{guestEntry:true}:p,r.params.id,r.body.code.trim().toUpperCase());
  },{publicVisit:true,keys:['code']}));
  // Retained for pre-020 applicants; anonymous access never authorizes legacy bookings.
  app.post('/api/shared-demo/:id/legacy-enter',handle((p,r)=>{
    if(!text(r.body.code,1,50))fail('VISIT_FIELDS_INVALID',400);
    return service.enter(p.userId,r.params.id,r.body.code.trim().toUpperCase());
  },{keys:['code']}));
  app.post('/api/shared-demo/:id/legacy-otp',handle((p,r)=>service.sendOtp(p.userId,r.params.id)));
  app.post('/api/shared-demo/:id/legacy-verify',handle((p,r)=>{
    if(!text(r.body.code,1,6))fail('VISIT_FIELDS_INVALID',400);
    return service.verify(p.userId,r.params.id,r.body.code.trim());
  },{keys:['code']}));
  app.get('/api/admin/demo',handle(()=>service.adminList(),{admin:true}));
  app.post('/api/admin/demo/control',handle((p,r)=>service.adminAction(p.userId,null,'control',r.body),{admin:true,keys:['enabled','reason']}));
  for(const action of ['approve','send-code','pause','resume','end','reject'])app.post(`/api/admin/demo/:id/${action}`,handle((p,r)=>service.adminAction(p.userId,r.params.id,action,r.body),{admin:true,keys:action==='approve'?['startsAt','endsAt','creditIdr','reason']:['reason']}));
}

// Installed BEFORE every auth/API handler. Even a future endpoint is unavailable
// to the shared identity until explicitly allowed. Normal users are unchanged.
export function sharedDemoFirewall({getPool}) {
  return async(req,res,next)=>{
    if(!req.path.startsWith('/api/') && !req.path.startsWith('/auth/'))return next();
    const token=readCookie(req.headers.cookie,'vo_session');if(!token)return next();
    let c;
    try {
      c=await getPool().getConnection();
      const p=await resolveSession(c,token);
      if(p?.sharedDemo && !sharedDemoRouteAllowed(req.method,req.path))return res.status(403).json({code:'VISIT_RESTRICTED',error:'Fitur ini tidak tersedia pada akun demo bersama.'});
      next();
    }catch{res.status(503).json({code:'VISIT_SESSION_UNAVAILABLE'});}finally{c?.release();}
  };
}
