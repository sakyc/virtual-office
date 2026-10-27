import { approvedPlans } from '../shared/billing-plans.js';
export { approvedPlans };
export const billingError = (code, status = 409) => Object.assign(new Error(code), { code, status });
export const money = (value, allowZero = false) => {
  if (typeof value !== 'string' || !/^\d{1,16}$/.test(value)) throw billingError('BILLING_AMOUNT_INVALID', 400);
  const amount = BigInt(value);
  if (amount > 9007199254740991n || amount < (allowZero ? 0n : 1n)) throw billingError('BILLING_AMOUNT_INVALID', 400);
  return amount;
};
export function subscriptionTerms(code, custom) {
  if (Object.hasOwn(approvedPlans, code)) {
    if (custom !== undefined) throw billingError('STANDARD_PLAN_OVERRIDE_REJECTED', 400);
    return { ...approvedPlans[code], agentsPerDivision: 4 };
  }
  if (code !== 'custom' || !custom || Object.keys(custom).sort().join(',') !== 'credit,divisions,members,price,whatsapp') throw billingError('CUSTOM_QUOTE_REQUIRED', 400);
  money(custom.price, true); money(custom.credit, true);
  // Custom is negotiated, never implicitly unlimited; office rendering still caps at 8.
  if (!Number.isInteger(custom.divisions) || custom.divisions < 1 || custom.divisions > 8 || !Number.isInteger(custom.members) || custom.members < 1 || custom.members > 65535 || typeof custom.whatsapp !== 'boolean') throw billingError('CUSTOM_LIMITS_INVALID', 400);
  return { ...custom, agentsPerDivision: 4 };
}
export function resolveBillingEntitlements(subscription, now = Date.now()) {
  const active = subscription?.status === 'active' && Date.parse(subscription.period_start) <= now && now < Date.parse(subscription.period_end);
  if (!active) return { active: false, canUseAi: false, maxDivisions: 0, maxMembers: 0, agentsPerDivision: 4, whatsapp: false };
  return { active: true, canUseAi: true, maxDivisions: subscription.max_divisions, maxMembers: subscription.max_members,
    agentsPerDivision: 4, whatsapp: subscription.whatsapp_enabled === 1 || subscription.whatsapp_enabled === true };
}
