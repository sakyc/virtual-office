export const demoEnabled=(env=process.env)=>env.DEMO_ENABLED==='1';
// Trial entitlements never create a paid subscription or make top-up available.
export async function activeDemo(c,org,env=process.env) {
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
