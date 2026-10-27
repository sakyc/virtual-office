import { randomUUID, createHash } from 'node:crypto';
import { createBillingService } from './billing.js';
import { requirePlatformAdmin } from './billing-catalog.js';
import { authenticationEnabled } from './auth/config.js';
import { billingError, subscriptionTerms } from './billing-policy.js';
import { parseBillingTariffs } from './ai-billing.js';
import { adminId } from './platform-admin.js';

const fail=(code,status=400)=>{throw billingError(code,status);};
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const canonical=v=>v && typeof v==='object' && !Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const uuid=v=>typeof v==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
function fields(body,keys) {
  if(!body || Array.isArray(body) || Object.keys(body).sort().join(',')!==[...keys].sort().join(',')) fail('BILLING_ADMIN_FIELDS_INVALID');
  if(!uuid(body.requestId) || typeof body.reason!=='string' || body.reason.trim().length<5 || body.reason.trim().length>500 || /[\x00-\x1f]/.test(body.reason)) fail('BILLING_ADMIN_VALUES_INVALID');
}
export function nextMonthlyPeriod(start) {
  if(typeof start!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(start) || !Number.isFinite(Date.parse(start)) || new Date(start).toISOString()!==start) fail('BILLING_DATE_INVALID');
  const begin=new Date(start), end=new Date(begin), day=begin.getUTCDate();
  end.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()+1);
  end.setUTCDate(Math.min(day,new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate()));
  return end.toISOString();
}
export function validateActivation(body,now=Date.now()) {
  fields(body,['requestId','reason','planCode','expectedPlanVersion','periodStart','approvalReference','customTerms','confirmedManualActivation']);
  if(body.confirmedManualActivation!==true || !['starter','pro','business','custom'].includes(body.planCode) || !Number.isInteger(body.expectedPlanVersion) || body.expectedPlanVersion<1 ||
    typeof body.approvalReference!=='string' || !/^[A-Za-z0-9][A-Za-z0-9:._/-]{4,190}$/.test(body.approvalReference)) fail('BILLING_ACTIVATION_INVALID');
  if(body.planCode==='custom') subscriptionTerms('custom',body.customTerms);
  else if(body.customTerms!==null) fail('STANDARD_PLAN_OVERRIDE_REJECTED');
  const periodEnd=nextMonthlyPeriod(body.periodStart);
  if(Date.parse(periodEnd)<=now) fail('BILLING_PERIOD_EXPIRED');
  return {...body,reason:body.reason.trim(),periodEnd};
}
export function validateTariff(model,body,now=Date.now()) {
  fields(body,['requestId','reason','expectedVersion','enabled','sourceReference','tariff','confirmedProviderPricing']);
  if(!Number.isInteger(body.expectedVersion) || body.expectedVersion<0 || body.expectedVersion>=4294967295 || typeof body.enabled!=='boolean' || body.confirmedProviderPricing!==true) fail('BILLING_TARIFF_INVALID');
  if(typeof body.sourceReference!=='string')fail('BILLING_TARIFF_SOURCE_INVALID');
  let url;try{url=new URL(body.sourceReference);}catch{fail('BILLING_TARIFF_SOURCE_INVALID');}
  if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || body.sourceReference.length>500) fail('BILLING_TARIFF_SOURCE_INVALID');
  const keys=['inputUsdPerMillion','outputUsdPerMillion','cacheReadUsdPerMillion','maxInputTokens','maxOutputTokens','verifiedAt','validUntil'];
  if(!body.tariff || Object.keys(body.tariff).sort().join(',')!==keys.sort().join(',')) fail('BILLING_TARIFF_INVALID');
  const tariff={...body.tariff,approvalReference:`admin-tariff:${body.requestId}`};
  try {parseBillingTariffs(JSON.stringify({[model]:tariff}),body.enabled?now:Math.min(now,Date.parse(tariff.validUntil)-1));}catch{fail('BILLING_TARIFF_INVALID');}
  return {...body,reason:body.reason.trim(),tariff};
}
export async function readBillingTariffs(c) {
  const [rows]=await c.execute('SELECT model,version,enabled,tariff,source_reference AS sourceReference,updated_by_user_id AS updatedByUserId,updated_at AS updatedAt FROM billing_model_tariffs ORDER BY model');
  return rows.map(r=>({...r,tariff:parse(r.tariff)}));
}
// No environment fallback in application runtime: a missing/disabled/expired DB tariff
// fails closed. Existing captured attempts continue to settle using their own snapshot.
export async function resolveBillingTariff(c,model,now=Date.now()) {
  const [[row]]=await c.execute('SELECT version,enabled,tariff FROM billing_model_tariffs WHERE model=?',[model]);
  if(!row || !row.enabled) throw billingError('AI_BILLING_PRICING_REQUIRED',503);
  const tariff=parse(row.tariff);parseBillingTariffs(JSON.stringify({[model]:tariff}),now);
  return {...tariff,catalogVersion:row.version};
}
export async function administerBilling(c,actor,action,target,input,{now=Date.now()}={}) {
  if(!['activate_subscription','update_tariff'].includes(action) || !uuid(input?.requestId))fail('BILLING_ADMIN_VALUES_INVALID');
  const hash=createHash('sha256').update(JSON.stringify(canonical({action,target,input}))).digest('hex');
  const [[previous]]=await c.execute('SELECT request_hash,after_snapshot FROM billing_operations_audit WHERE actor_user_id=? AND request_id=?',[actor.userId,input.requestId]);
  if(previous){if(previous.request_hash!==hash)fail('BILLING_ADMIN_IDEMPOTENCY_CONFLICT',409);return parse(previous.after_snapshot);}
  const body=action==='activate_subscription'?validateActivation(input,now):validateTariff(target,input,now);
  let result,before=null;
  if(action==='activate_subscription') {
    const [[org]]=await c.execute('SELECT id,status FROM organizations WHERE id=?',[target]);
    if(!org)fail('ADMIN_ORGANIZATION_NOT_FOUND',404);
    if(org.status!=='active')fail('BILLING_ORGANIZATION_INACTIVE',409);
    // Caller owns the transaction and real admin grant lock. Service commits are no-ops
    // on this adapter so audit, grant, wallet and subscription share ONE atomic commit.
    const adapter={execute:(...args)=>c.execute(...args),beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}};
    result=await createBillingService(()=>({getConnection:async()=>adapter})).startSubscription({organizationId:target,key:`admin-sub:${actor.userId}:${body.requestId}`,planCode:body.planCode,
      ...(body.customTerms===null?{}:{customTerms:body.customTerms}),periodStart:body.periodStart,periodEnd:body.periodEnd,approvalReference:body.approvalReference,expectedPlanVersion:body.expectedPlanVersion,
      beforeActivate:async(connection,terms)=>{
        const [[usage]]=await connection.execute(`SELECT
          (SELECT COUNT(*) FROM workspace_divisions d JOIN workspaces w ON w.id=d.workspace_id AND w.status='active' WHERE d.organization_id=? AND d.status='active') AS divisions,
          (SELECT COUNT(DISTINCT user_id) FROM (SELECT user_id FROM organization_memberships WHERE organization_id=? AND revoked_at IS NULL UNION ALL SELECT wm.user_id FROM workspace_memberships wm JOIN workspaces w ON w.id=wm.workspace_id AND w.status='active' WHERE w.organization_id=? AND wm.revoked_at IS NULL) AS members) AS members`,[target,target,target]);
        if(Number(usage.divisions)>terms.divisions || Number(usage.members)>terms.members) fail('BILLING_EXISTING_CAPACITY_EXCEEDED',409);
      }});
    result={organizationId:target,...result,activationType:'manual_admin',approvalReference:body.approvalReference};
  } else {
    const [[row]]=await c.execute('SELECT model,version,enabled,tariff,source_reference AS sourceReference FROM billing_model_tariffs WHERE model=? FOR UPDATE',[target]);
    if((row?.version??0)!==body.expectedVersion)fail('BILLING_TARIFF_VERSION_CONFLICT',409);
    before=row?{...row,tariff:parse(row.tariff)}:null;
    const version=body.expectedVersion+1;
    if(row)await c.execute('UPDATE billing_model_tariffs SET version=?,enabled=?,tariff=?,source_reference=?,updated_by_user_id=? WHERE model=? AND version=?',[version,body.enabled?1:0,JSON.stringify(body.tariff),body.sourceReference,actor.userId,target,body.expectedVersion]);
    else await c.execute('INSERT INTO billing_model_tariffs(model,version,enabled,tariff,source_reference,updated_by_user_id) VALUES (?,?,?,?,?,?)',[target,version,body.enabled?1:0,JSON.stringify(body.tariff),body.sourceReference,actor.userId]);
    result={model:target,version,enabled:body.enabled,tariff:body.tariff,sourceReference:body.sourceReference};
  }
  await c.execute('INSERT INTO billing_operations_audit(id,actor_user_id,organization_id,model,action,request_id,request_hash,before_snapshot,after_snapshot,reason) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [randomUUID(),actor.userId,action==='activate_subscription'?target:null,action==='update_tariff'?target:null,action,body.requestId,hash,before?JSON.stringify(before):null,JSON.stringify(result),body.reason]);
  return result;
}
export function installBillingAdministrationRoutes(app,{getPool,env=process.env,modelCatalog,readModels=readBillingTariffs}) {
  async function handle(req,res) {
    res.setHeader('Cache-Control','no-store');
    if(!authenticationEnabled(env))return res.status(503).json({code:'AUTH_UNAVAILABLE'});
    const write=req.method!=='GET',origin=env.APP_ORIGIN||(env.NODE_ENV==='production'?null:'http://localhost:5173');
    if(write && (!origin || req.headers.origin!==origin || !req.is('application/json')))return res.status(403).json({code:'ADMIN_ORIGIN_REQUIRED'});
    let c;
    try {
      if(Object.keys(req.query).length)fail('ADMIN_FILTER_INVALID');
      c=await getPool().getConnection();await c.beginTransaction();const actor=await requirePlatformAdmin(c,req);
      let result;
      if(req.method==='GET') {
        if(req.path==='/api/admin/models') {
          if(!modelCatalog?.adminList)fail('BILLING_MODELS_UNAVAILABLE',503);
          // Reuse the authenticated transaction connection, not a second pool
          // checkout while holding the admin grant/session locks.
          result={models:await modelCatalog.adminList(await readModels(c)),markup:2};
        } else {
          const [audit]=await c.execute('SELECT id,actor_user_id AS actorUserId,organization_id AS organizationId,model,action,reason,after_snapshot AS afterSnapshot,created_at AS createdAt FROM billing_operations_audit ORDER BY created_at DESC,id DESC LIMIT 50');
          result={tariffs:await readBillingTariffs(c),audit,markup:2,paymentEnabled:false};
        }
      } else {
        if(req.method==='PUT' && readModels!==readBillingTariffs) {
          const [[model]]=await c.execute('SELECT id FROM ai_models WHERE provider=\'anthropic\' AND provider_model_id=? FOR UPDATE',[req.params.model]);
          if(!model)fail('MODEL_CATALOG_SEED_REQUIRED',409);
        }
        result=await administerBilling(c,actor,req.method==='POST'?'activate_subscription':'update_tariff',req.method==='POST'?adminId(req.params.id):req.params.model,req.body);
      }
      await c.commit();res.json(result);
    }catch(e){await c?.rollback().catch(()=>{});const safe=[400,401,403,404,409].includes(e.status);res.status(safe?e.status:503).json({code:safe?e.code:e.code==='ER_NO_SUCH_TABLE'?'BILLING_ADMIN_SCHEMA_REQUIRED':'BILLING_ADMIN_UNAVAILABLE'});}
    finally{c?.release();}
  }
  app.get('/api/admin/billing/operations',handle);
  app.get('/api/admin/models',handle);
  app.post('/api/admin/organizations/:id/subscription',handle);
  app.put('/api/admin/billing/tariffs/:model',handle);
}
