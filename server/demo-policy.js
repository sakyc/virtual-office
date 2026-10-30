import {activeSharedDemo} from './shared-demo-policy.js';
export const demoEnabled=(env=process.env)=>env.DEMO_ENABLED==='1';
// Trial entitlements never create a paid subscription or make top-up available.
export async function activeDemo(c,org,env=process.env) {
  const shared=await activeSharedDemo(c,org,env); if(shared)return shared;
  if(!demoEnabled(env))return null;
  const [[row]]=await c.execute(`SELECT organization_id, workspace_id, credit_idr,
    DATE_FORMAT(activated_at, '%Y-%m-%dT%H:%i:%s.000Z') AS activatedAt,
    DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%s.000Z') AS expiresAt
    FROM demo_access WHERE organization_id=? AND activated_at IS NOT NULL AND expires_at>UTC_TIMESTAMP()`,[org]);
  return row || null;
}
export function demoEntitlements() {
  return {active:true,canUseAi:true,maxDivisions:6,maxMembers:1,agentsPerDivision:4,whatsapp:false,demo:true};
}

// Historical status is presentation only. Expired rows must never grant access.
export async function readDemoStatus(c,org,env=process.env) {
  const shared=await activeSharedDemo(c,org,env); if(shared)return shared;
  if(!demoEnabled(env))return null;
  const [[row]]=await c.execute(`SELECT organization_id, workspace_id, credit_idr,
    DATE_FORMAT(activated_at, '%Y-%m-%dT%H:%i:%s.000Z') AS activatedAt,
    DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%s.000Z') AS expiresAt,
    expires_at>UTC_TIMESTAMP() AS active
    FROM demo_access WHERE organization_id=? AND activated_at IS NOT NULL`,[org]);
  return row?{...row,active:Boolean(row.active),status:row.active?'trial':'expired'}:null;
}
