// Approved initial seed terms/fixtures. Live UI and new subscriptions read the database catalog.
export const approvedPlans = Object.freeze({
  starter: Object.freeze({ price: '149000', credit: '50000', divisions: 1, members: 2, whatsapp: false }),
  pro: Object.freeze({ price: '399000', credit: '150000', divisions: 3, members: 6, whatsapp: true }),
  business: Object.freeze({ price: '899000', credit: '350000', divisions: 8, members: 15, whatsapp: true }),
});
export const publicBillingPlans = Object.freeze([
  ...Object.entries(approvedPlans).map(([code, plan]) => Object.freeze({
    code, name: code[0].toUpperCase() + code.slice(1), monthlyPriceIdr: plan.price,
    includedCreditIdr: plan.credit, maxDivisions: plan.divisions, maxMembers: plan.members,
    agentsPerDivision: 4, whatsapp: plan.whatsapp, quoteRequired: false,
  })),
  Object.freeze({ code: 'custom', name: 'Custom', quoteRequired: true, agentsPerDivision: 4 }),
]);
