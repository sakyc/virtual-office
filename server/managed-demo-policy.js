import {billingError} from './billing-policy.js';
export const MANAGED_DEMO_ISSUER='karyora:managed-demo';
export const MANAGED_DEMO_DISABLED_MESSAGE='Akses AI demo sedang dinonaktifkan. Hubungi admin.';
export async function managedDemoForOrganization(c,organizationId,{lock=false}={}) {
  const [[row]]=await c.execute(`SELECT user_id,organization_id,workspace_id,ai_enabled FROM managed_demo_accounts WHERE organization_id=?${lock?' FOR UPDATE':''}`,[organizationId]);
  return row?{...row,managed:true,active:true,status:'demo',aiEnabled:Boolean(row.ai_enabled)}:null;
}
export async function assertManagedDemoAi(c,organizationId) {
  const account=await managedDemoForOrganization(c,organizationId,{lock:true});
  if(account && !account.aiEnabled)throw Object.assign(billingError('MANAGED_DEMO_AI_DISABLED',402),{message:MANAGED_DEMO_DISABLED_MESSAGE});
}
