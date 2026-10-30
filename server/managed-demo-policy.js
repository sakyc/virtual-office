import {billingError} from './billing-policy.js';
export const MANAGED_DEMO_ISSUER='karyora:managed-demo';
export const MANAGED_DEMO_DISABLED_MESSAGE='Akses AI demo sedang dinonaktifkan. Hubungi admin.';
// Presentation accounts may arrange their own team, never account/admin/billing settings.
export function managedDemoTeamRouteAllowed(method,path) {
  const id='[a-f0-9-]{36}';
  if(method==='POST')return path==='/api/team/divisions'
    || new RegExp(`^/api/team/divisions/${id}/agents$`).test(path)
    || new RegExp(`^/api/team/(?:agents|divisions)/${id}/archive$`).test(path);
  return method==='PATCH' && new RegExp(`^/api/team/agents/${id}$`).test(path);
}
export function managedDemoTemplateRouteAllowed(method,path) {
  if(method==='POST')return path==='/api/task-templates'||/^\/api\/task-templates\/[a-f0-9-]{36}\/archive$/.test(path);
  return method==='PATCH' && /^\/api\/task-templates\/[a-f0-9-]{36}$/.test(path);
}
export async function managedDemoForOrganization(c,organizationId,{lock=false}={}) {
  const [[row]]=await c.execute(`SELECT user_id,organization_id,workspace_id,ai_enabled FROM managed_demo_accounts WHERE organization_id=?${lock?' FOR UPDATE':''}`,[organizationId]);
  return row?{...row,managed:true,active:true,status:'demo',aiEnabled:Boolean(row.ai_enabled)}:null;
}
export async function assertManagedDemoAi(c,organizationId) {
  const account=await managedDemoForOrganization(c,organizationId,{lock:true});
  if(account && !account.aiEnabled)throw Object.assign(billingError('MANAGED_DEMO_AI_DISABLED',402),{message:MANAGED_DEMO_DISABLED_MESSAGE});
}
