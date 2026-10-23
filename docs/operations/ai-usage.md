# AI usage ledger

Implemented for tenant office chat, structured jobs, and revisions. The production
entry point supplies a SQL usage store to all three; legacy global AI routes remain
behind their existing fail-closed tenant gate. No migration is run at startup.

## Activation / verification

`004_ai_usage.sql` is an additive migration registered in the existing manifest.
It has NOT been applied or tested against a real database in this task. Use the
existing migration runbook, isolated non-production target identification, backup,
and explicit operator procedure before enabling live AI. Do not run schema.sql,
baseline adoption, or migration commands blindly against development/production.
The migration validation command now checks the usage contract if 004 is applied.
Without this table, live tenant AI calls stop before contacting the provider;
demo jobs still work, and the usage page reports unavailable rather than zero.

## What is recorded

One UUID per SDK call, server-derived organization/workspace/user, operation,
resource ID (job or item; NULL for chat), agent, provider, requested model, provider
message ID, reported input/output/cache-read/cache-creation tokens, and timestamps.
No API keys, prompts, responses, passwords, or provider error text are stored.
Each explicit runner retry is a separate entry. Hidden SDK transport retries are
disabled on tracked calls. Do not add a global retry around this ledger.

`started` is persisted BEFORE the request. A provider response with valid input
and output counters becomes `completed`, even if downstream parsing or output
storage subsequently fails. Unknown/error/aborted responses become `unknown`
with NULL counters, not a fabricated zero. A process crash or failed final write
leaves `started`. No subsequent provider call is retried after ledger failure.
Final updates only affect started entries, making duplicate finalization a no-op.
Ledger writes use the pool independently of output transactions, so rolling back
a job/revision does not erase its provider usage. Reserve pool capacity accordingly.

## Reading and access

`GET /api/dashboard/usage` requires the existing validated session and tenant gate.
It accepts no client tenant filters. Both totals and the 50 latest rows are scoped
to the active organization/workspace and the last 30 days. Owners/admins see that
workspace; members/viewers see only their own rows. Platform-only access is denied.
Other workspaces in the organization are NOT included. The dashboard menu
“Penggunaan & Billing” reads this endpoint, with loading/error/empty states.
Existing historical job counters are not backfilled into the ledger.

## Limitations and recovery

This is metering, NOT billing or quota enforcement. No model-price assumptions,
cost estimate, credit, top-up, division entitlement, hourly/customer token limit,
or financial ledger is implemented. Cache token categories remain separate because
their prices differ. Existing global/IP request limits remain unchanged.
Unknown/started entries are explicitly unresolved and totals are incomplete when
they exist. They must not be interpreted as free requests or used for invoices.
After provider/network/storage failure, reconcile manually with trusted provider
usage evidence; do not delete rows, reissue the AI request, or guess missing usage.
Automated reconciliation and trusted administrator tooling are future work.

Verification: `npm run test:usage`, full offline Node tests, and `npm run build`.
`node scripts/serve-usage-ui-verification.mjs` serves the built UI on loopback 5221
with visibly labeled fixtures only. It imports no DB/provider modules and does
not exercise real login or database behavior. Send `stop` on stdin to close it.
