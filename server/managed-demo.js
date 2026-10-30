import {randomUUID,createHash} from 'node:crypto';
import {createNativeLimiter} from './auth/native-routes.js';
import {hashPassword,normalizeEmail,validPassword} from './auth/passwords.js';
import {readCookie,resolveSession} from './auth/sessions.js';
import {requirePlatformAdmin} from './billing-catalog.js';
import {teamTemplates} from '../shared/workspace-team.js';
import {addAgent} from './workspace-team.js';
import {MANAGED_DEMO_ISSUER,MANAGED_DEMO_DISABLED_MESSAGE} from './managed-demo-policy.js';
import {sharedDemoRouteAllowed} from './shared-demo-policy.js';

const fail=(code,status=400)=>{throw Object.assign(Error(code),{code,status});};
const exact=(body,keys)=>{if(!body || Array.isArray(body) || Object.keys(body).sort().join()!==keys.sort().join())fail('MANAGED_DEMO_FIELDS_INVALID');};
const reason=body=>{if(typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.trim().length>500||/[\x00-\x1f]/.test(body.reason))fail('MANAGED_DEMO_REASON_INVALID');return body.reason.trim();};
const audit=(c,actor,action,note)=>c.execute('INSERT INTO managed_demo_audit(id,actor_user_id,action,reason) VALUES (?,?,?,?)',[randomUUID(),actor,action,note]);
export async function createManagedDemoAccount(c,actor,body) {
  exact(body,['name','email','password','creditIdr','reason']);const note=reason(body),email=normalizeEmail(body.email);
  if(!email || typeof body.name!=='string' || body.name.trim().length<2 || body.name.trim().length>150 || /[\x00-\x1f]/.test(body.name)
    || !validPassword(body.password) || Buffer.byteLength(body.password||'','utf8')>256 || !Number.isInteger(body.creditIdr) || body.creditIdr<100 || body.creditIdr>100000)fail('MANAGED_DEMO_FIELDS_INVALID');
  const [[exists]]=await c.execute('SELECT id FROM managed_demo_accounts WHERE id=1 FOR UPDATE');if(exists)fail('MANAGED_DEMO_EXISTS',409);
  const passwordHash=await hashPassword(body.password),identity=randomUUID();
  const [user]=await c.execute('INSERT INTO users(provider_issuer,external_subject,email,display_name) VALUES (?,?,?,?)',[MANAGED_DEMO_ISSUER,identity,email,body.name.trim()]);
  await c.execute('INSERT INTO native_credentials(user_id,email_normalized,password_hash) VALUES (?,?,?)',[user.insertId,email,passwordHash]);
  const [org]=await c.execute('INSERT INTO organizations(slug,name,created_by_user_id) VALUES (?,?,?)',[`managed-demo-${identity}`,'Kantor Demo',user.insertId]);
  const [workspace]=await c.execute("INSERT INTO workspaces(organization_id,slug,name,created_by_user_id) VALUES (?,'main','Kantor Demo',?)",[org.insertId,user.insertId]);
  const scope={organizationId:org.insertId,workspaceId:workspace.insertId};
  await c.execute("INSERT INTO organization_memberships(organization_id,user_id,role,created_by_user_id) VALUES (?,?,'owner',?)",[org.insertId,user.insertId,actor]);
  await c.execute("INSERT INTO workspace_memberships(workspace_id,user_id,role,created_by_user_id) VALUES (?,?,'admin',?)",[workspace.insertId,user.insertId,actor]);
  for(const [slot,template] of teamTemplates.slice(0,6).entries()) {
    const division=randomUUID();
    await c.execute('INSERT INTO workspace_divisions(id,organization_id,workspace_id,name,template_id,slot,created_by_user_id) VALUES (?,?,?,?,?,?,?)',[division,org.insertId,workspace.insertId,template.name,template.id,slot,actor]);
    for(const agent of template.agents.slice(0,4))await addAgent(c,scope,actor,division,{name:agent.name,role:agent.role,instructions:agent.focus,modelTier:'team'},agent.id);
  }
  await c.execute('INSERT INTO billing_wallets(organization_id) VALUES (?)',[org.insertId]);
  const grant=randomUUID(),reference=`managed-demo:${identity}`;
  await c.execute("INSERT INTO billing_credit_grants(id,organization_id,source,reference_id,original_idr,available_idr) VALUES (?,?,'adjustment',?,?,?)",[grant,org.insertId,reference,body.creditIdr,body.creditIdr]);
  await c.execute("INSERT INTO billing_ledger(id,organization_id,idempotency_key,request_hash,kind,amount_idr,result) VALUES (?,?,?,?,'credit',?,?)",[randomUUID(),org.insertId,reference,createHash('sha256').update(reference).digest('hex'),body.creditIdr,JSON.stringify({source:'managed_demo',grantId:grant,amountIdr:String(body.creditIdr)})]);
  await c.execute('INSERT INTO managed_demo_accounts(id,user_id,organization_id,workspace_id) VALUES (1,?,?,?)',[user.insertId,org.insertId,workspace.insertId]);
  await audit(c,actor,'create',note);return {created:true,userId:user.insertId,aiEnabled:false};
}
export async function changeManagedDemo(c,actor,action,body) {
  exact(body,['expectedVersion','reason',action==='password'?'password':'enabled']);const note=reason(body);
  if(!['ai','login','password'].includes(action)||!Number.isInteger(body.expectedVersion)||body.expectedVersion<1)fail('MANAGED_DEMO_FIELDS_INVALID');
  if(action==='password' ? !validPassword(body.password)||Buffer.byteLength(body.password||'','utf8')>256 : typeof body.enabled!=='boolean')fail('MANAGED_DEMO_FIELDS_INVALID');
  const [[pointer]]=await c.execute('SELECT organization_id FROM managed_demo_accounts WHERE id=1');if(!pointer)fail('MANAGED_DEMO_NOT_FOUND',404);
  await c.execute('SELECT id FROM organizations WHERE id=? FOR UPDATE',[pointer.organization_id]);
  const [[row]]=await c.execute('SELECT d.user_id,d.version,u.provider_issuer FROM managed_demo_accounts d JOIN users u ON u.id=d.user_id WHERE d.id=1 FOR UPDATE');
  if(!row || row.provider_issuer!==MANAGED_DEMO_ISSUER || row.user_id===actor)fail('MANAGED_DEMO_ACCOUNT_INVALID',409);
  if(row.version!==body.expectedVersion)fail('MANAGED_DEMO_VERSION_CONFLICT',409);
  if(action==='ai')await c.execute('UPDATE managed_demo_accounts SET ai_enabled=? WHERE id=1',[body.enabled]);
  if(action==='login')await c.execute('UPDATE users SET status=? WHERE id=?',[body.enabled?'active':'suspended',row.user_id]);
  if(action==='password') {
    const hash=await hashPassword(body.password);
    const [changed]=await c.execute('UPDATE native_credentials SET password_hash=?,password_changed_at=UTC_TIMESTAMP() WHERE user_id=?',[hash,row.user_id]);
    if(changed.affectedRows!==1)fail('MANAGED_DEMO_ACCOUNT_INVALID',409);
  }
  if(action==='password'||(action==='login'&&!body.enabled))await c.execute("UPDATE sessions SET revoked_at=UTC_TIMESTAMP(),revoked_reason='managed_demo_admin' WHERE user_id=? AND revoked_at IS NULL",[row.user_id]);
  await c.execute('UPDATE managed_demo_accounts SET version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=1');
  await audit(c,actor,action==='password'?'password_reset':`${action}_${body.enabled?'enabled':'disabled'}`,note);
  return {saved:true};
}
export function installManagedDemoRoutes(app,{getPool,env=process.env}) {
  const allowAttempt=createNativeLimiter();
  const handle=async(req,res)=>{
    res.setHeader('Cache-Control','no-store');let c;
    try {
      if(Object.keys(req.query).length)fail('MANAGED_DEMO_FIELDS_INVALID');
      const origin=env.APP_ORIGIN||(env.NODE_ENV==='production'?null:'http://localhost:5173');
      if(req.method==='POST'&&(!origin||req.get('origin')!==origin||!req.is('application/json')))fail('MANAGED_DEMO_ORIGIN_REQUIRED',403);
      c=await getPool().getConnection();await c.beginTransaction();const admin=await requirePlatformAdmin(c,req);let result;
      if(req.method==='GET') {
        const [rows]=await c.execute(`SELECT d.user_id AS userId,u.email,u.display_name AS name,u.status AS loginStatus,d.ai_enabled AS aiEnabled,d.version,
          (SELECT CAST(COALESCE(SUM(g.available_idr),0) AS CHAR) FROM billing_credit_grants g WHERE g.organization_id=d.organization_id AND (g.expires_at IS NULL OR g.expires_at>UTC_TIMESTAMP())) AS availableIdr
          FROM managed_demo_accounts d JOIN users u ON u.id=d.user_id WHERE d.id=1`);
        const [history]=await c.execute('SELECT id,actor_user_id AS actorUserId,action,reason,created_at AS createdAt FROM managed_demo_audit ORDER BY created_at DESC,id DESC LIMIT 20');
        result={account:rows[0]||null,history};
      } else {
        if((!req.params.action||req.params.action==='password')&&!allowAttempt(req.ip,String(admin.userId)))fail('MANAGED_DEMO_RATE_LIMITED',429);
        result=req.params.action?await changeManagedDemo(c,admin.userId,req.params.action,req.body):await createManagedDemoAccount(c,admin.userId,req.body);
      }
      await c.commit();res.json(result);
    }catch(e){await c?.rollback().catch(()=>{});const safe=[400,401,403,404,409,429].includes(e.status);res.status(safe?e.status:e.code==='ER_DUP_ENTRY'?409:503).json({code:safe?e.code:e.code==='ER_DUP_ENTRY'?'MANAGED_DEMO_EXISTS':'MANAGED_DEMO_UNAVAILABLE'});}finally{c?.release();}
  };
  app.get('/api/admin/managed-demo',handle);app.post('/api/admin/managed-demo',handle);app.post('/api/admin/managed-demo/:action',handle);
}
export function managedDemoFirewall({getPool}) {
  return async(req,res,next)=>{
    if(!req.path.startsWith('/api/')&&!req.path.startsWith('/auth/'))return next();
    const token=readCookie(req.headers.cookie,'vo_session');if(!token)return next();let c;
    try {
      c=await getPool().getConnection();const principal=await resolveSession(c,token);
      if(principal?.managedDemo) {
        if(!sharedDemoRouteAllowed(req.method,req.path))return res.status(403).json({code:'MANAGED_DEMO_RESTRICTED',error:'Fitur ini hanya dapat dikelola admin untuk akun demo.'});
        if(!principal.managedDemo.aiEnabled && req.method==='POST' && (req.path==='/api/office/chat'||req.path==='/api/dashboard/jobs'||/^\/api\/dashboard\/items\/\d+\/revise$/.test(req.path)))return res.status(402).json({code:'MANAGED_DEMO_AI_DISABLED',error:MANAGED_DEMO_DISABLED_MESSAGE});
      }
      next();
    }catch{res.status(503).json({code:'MANAGED_DEMO_UNAVAILABLE',error:'Pemeriksaan akses demo belum tersedia.'});}finally{c?.release();}
  };
}
