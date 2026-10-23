# AI usage ledger

Implemented for tenant office chat, structured jobs, and revisions. The production
entry point supplies a SQL usage store to all three; legacy global AI routes remain
behind their existing fail-closed tenant gate. No migration is run at startup.

## Activation / verification

`004_ai_usage.sql` is an additive migration registered in the existing manifest.
Local application and restore verification passed on 2026-10-23 (see below). Use the
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

## Local migration execution — 2026-10-23

Owner explicitly requested migration execution. Target `virtual_office` was
identified through loopback port 3306, local process PID 16392, executable
`C:/laragon/bin/mysql/mysql-8.0.30-winx64/bin/mysqld.exe`, MySQL 8.0.30,
and server data directory `C:/laragon/data/mysql-8/`. This identity is evidence
for this run only, not authorization for future runs or other targets.

Executed, with approval confined to this shell/child processes:

```
node scripts/apply-local-usage-migration.mjs
```

The utility invoked `scripts/migrate.js --apply --confirm-non-production` first
on the isolated restore, then the development database. Both applied ONLY
`004_ai_usage`. No schema.sql, baseline adoption, initDb, or provider was invoked.

- Backup: `D:/VetendCode/database-backups/virtual-office-ai-usage-zdcEGK/before-004.sql`.
- SHA-256: `df0bac2a61c81b29c5fbd274a32c2eaae59abe7a50c771348bbe21ed057fe00c`.
- Retained restore: `vo_usage_restore_1792750024166`.
- Backup restore matched all 12 original tables: column definitions, indexes,
  foreign keys/rules, engines/collations, row counts, and full-row content digests.
- After apply, existing non-history table data and structure remained unchanged.
  Only the new usage table and migration-history record were added.
- Both schema validations returned `valid: true`, `differences: []`.
- Migration 004 checksum:
  `5c354471df27b50874496bf3430b94e047629479103b1ae4fc78f821d382ed65`.
- Development usage table was empty after migration.
- Real SQL ledger insert/finalize/read test passed in the retained restore only,
  using a mock provider response: one fixture request, 11 input / 7 output tokens.
  This is not real Anthropic usage; the fixture row is retained outside development.
- Full evidence (no credentials or row contents):
  `D:/VetendCode/database-backups/virtual-office-ai-usage-zdcEGK/verification.json`.

Final commands: `node scripts/migration-validate.js --confirm-non-production`
returned valid with no differences; `node scripts/migration-status.js --db
--confirm-non-production` returned no diagnostics and matching history checksums.
The first status invocation was correctly refused because its separate
`MIGRATION_STATUS_NON_PROD_APPROVED` flag was absent; it was rerun once with that
flag scoped to the child process. No guard was modified or bypassed.

The backup contains private application/authentication data. Keep it outside Git
and do not share it. No real-provider call or authenticated browser journey was
performed in this migration run. Credit, cost calculation and quotas remain out
of scope. The operator utility is intentionally one-shot: it refuses to apply
again once history includes 004 rather than attempting recovery or deletion.
