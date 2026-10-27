# Billing foundation and AI enforcement (008–011)

Current tariff-source update (owner request, 2026-10-25): screenshot prices are
hardcoded in `shared/ai-model-prices.js` and bound only to exact server-discovered
model names/IDs and reported limits. Admin DB tariffs take precedence, including
disablement/expiry. A DB error never falls back to hardcoded prices. The rate card
is owner-supplied, not independently provider-verified, and requires review before
2026-11-24 UTC. Details and limitations are in `chat-models.md`. This supersedes
the historical DB-only tariff wording below; no applied migrations were changed.

## Implemented boundaries

Migration 008 adds six tables: `billing_plans`, `billing_subscriptions`,
`billing_wallets`, `billing_credit_grants`, `billing_holds`, `billing_ledger`.
Tenant identity is the existing BIGINT `organizations.id`, never a second tenant
master or a browser-supplied organization. The migration seeds the catalog ONLY;
it does not give existing organizations a subscription, wallet or free credit.
001–007 remain unchanged. No migration runs at startup; `initDb()` is unchanged.

Monthly approved catalog version 1:

| Plan | IDR/month | Included IDR | Divisions | Human members | WhatsApp entitlement |
| --- | ---: | ---: | ---: | ---: | --- |
| Starter | 149000 | 50000 | 1 | 2 | No |
| Pro | 399000 | 150000 | 3 | 6 | Yes |
| Business | 899000 | 350000 | 8 | 15 | Yes |
| Custom | Negotiated | Negotiated | Explicit | Explicit | Negotiated |

Four agents per division; no additional agent pricing. Custom is not implicitly
unlimited: all negotiated values must be supplied, including WhatsApp access.
Custom division capacity currently cannot exceed the existing renderer's eight
division limit. No annual pricing, add-on prices, trial balance or default
subscription has been invented. These are initial seed terms; after migration 009,
platform administrators manage the versioned database catalog. Never edit the
applied 008 source. Activated terms are
snapshotted on the subscription and in the immutable-by-service ledger result,
not dynamically joined to catalog pricing for old periods.

`GET /api/billing` is a no-store, organization-owner-only read endpoint behind
the real existing session/tenant gate. It rejects scope/query overrides and
returns the catalog, current subscription, computed entitlements, grant balances
and the 50 latest ledger events. It exposes no POST/PATCH/checkout/funding route.
The later UI adds a billing page; checkout remains disabled.

## Trusted internal service

`createBillingService` is callable ONLY by reviewed trusted server/operator code.
Its input is NOT evidence of payment, login, or a gateway signature. In particular,
an `approvalReference` supplied by a browser must never reach this service. The
first-subscription and credit methods exist for the future verified funding path;
they are not called during registration, normal startup or migration application.

- First activation requires explicit monthly boundaries (UTC, end-exclusive),
  reviewed approval reference and exact standard terms or a complete Custom quote.
  It atomically records subscription terms and grants that month's included credit.
  Existing subscriptions cannot be replaced through first activation. Renewal,
  cancellation, scheduled downgrade and upgrade/proration are not implemented.
- Top-ups/adjustments require a trusted funding/approval reference. Top-up and
  adjustment grants never expire. Package credit expires at its period end.
- Every mutation locks the organization's wallet and runs in one transaction.
  Idempotency keys are organization-scoped and hash-bound to the complete request.
  Exact retries return the original stored result; changed inputs conflict.
  A unique grant source/reference also prevents the same payment reference being
  credited twice under different idempotency keys.
- Reserve requires a currently active subscription and sufficient unexpired
  credit, consumes expiring credit before non-expiring top-ups, and records grant
  allocations. Concurrent service calls are serialized on the wallet row.
- Settlement must not exceed the reservation, spends actual IDR and returns the
  unused portion to its original grants. Release returns the full reservation.
  Completed/released holds cannot be finalized a second time. Restoring expired
  package credit does not extend its expiry. Open holds remain reserved even if
  their grant expires; read reporting does not hide those reservations.
- Amounts are decimal integer strings; arithmetic is BigInt, no floating-point
  money. Database CHECKs protect basic grant and hold invariants. Application
  ledger APIs append only; there is no ledger update/delete API. DBA edits are not
  cryptographically prevented. Ledger amounts are event amounts, not a signed
  balance sum: reserve/release/subscription events must not be counted as debits.
  Expiry is derived from the grant timestamp, not a background ledger mutation.

Automatic AI charging is now connected to the server's tenant chat, job and
revision clients. Before dispatch it reserves a conservative request budget and persists
request-time model price, FX, markup and request hash in `ai_billing_attempts`
(011). It settles actual provider usage idempotently and returns unused funds.
Unknown usage is NOT assumed free. Holds have no automatic timeout/reaper:
unresolved attempts retain their reservation until operator reconciliation.
Post-settlement commercial refunds are also not implemented; returned unused
reservations are not a payment-gateway refund.

The entitlement resolver denies missing/inactive/expired subscription periods and
expresses division/member/WhatsApp rights. Team additions and edits now require
an active package within organization-wide division/member limits, under an
organization lock. Division creation checks the prospective count across all
active workspaces. Archiving remains available after expiry so capacity can be
reduced. Onboarding creates an empty workspace and does not grant/seed paid
divisions; selected templates must be chosen again after activation. New invite
or membership writers are not implemented: they MUST call `assertPaidAccess`
with the prospective distinct-member increase in the same transaction before
being enabled. Current AI routes recheck package capacity and real persisted
session/workspace membership before reserving; no platform-admin content bypass.
The technical four-agent-per-division check remains intact.
WhatsApp capability is only a negotiated package right; no messages are sent.

## Local application evidence: 2026-10-25

The listener PID 19396 was verified as Laragon's
`C:/laragon/bin/mysql/mysql-8.0.30-winx64/bin/mysqld.exe`.
The connection was restricted to loopback:3306, database `virtual_office`, with
MySQL 8.0.30 data directory `C:/laragon/data/mysql-8/`. History/checksums 001–007
and schema were valid before application; ONLY 008 was pending.

Pre-008 dump and evidence (outside Git):
`D:/VetendCode/database-backups/virtual-office-billing-mu8heQ/before-008.sql`
and adjacent `verification.json`. Dump: 42,344 bytes; SHA-256
`eca81f7592a956ebbdd68b408e67d87ba9074536c7f665d3f4064bb20995ba89`.
Dump exit/completion marker/hash were checked. Restore was NOT rehearsed; the
owner requested one database, so no restore target was created or development
database overwritten. This remains a limitation versus the general runbook.

008 applied under the framework advisory lock, schema returned
`{"valid":true,"differences":[]}`, all history checksums matched, and a second
framework application returned `[]`. Fingerprints of original application tables
were unchanged. `sessions` (normal activity) and `schema_migrations` (expected
change) were excluded from content comparison. All five new non-catalog tables
contained zero rows after application.

`scripts/verify-billing-local.mjs` requires explicit `BILLING_LOCAL_VERIFY=1` and
the same loopback/database/datadir identity. It never creates a database or calls
a paid provider. It uses a real existing organization solely inside an outer SQL
transaction. Service commits are replaced with savepoint releases; the final
outer rollback discards ALL fixtures, including mock funding references.
Do not adapt this savepoint wrapper into production code.

The local verifier passed catalog, transactions, duplicate prevention,
package-first allocation, settlement, release, insufficient funds, CHECK/unique
constraints and contention on the wallet row from a second real connection.
Before/after billing table counts matched after rollback. Concurrent full service
spends are tested in a serialized in-memory fixture, not with committed customer
funds on two real connections. No development organization was actually subscribed
or funded. No extra database was created.

Offline: `npm run test:billing`; regression: `node --test --test-reporter=spec`;
frontend: `npm run build`. To repeat rollback-only local checks in PowerShell:

```powershell
$env:BILLING_LOCAL_VERIFY = '1'
try { node scripts/verify-billing-local.mjs }
finally { Remove-Item Env:BILLING_LOCAL_VERIFY }
```

No dependencies were installed. Browser checkout, payment processing, WhatsApp,
subscription renewal/upgrade/cancellation and invitation workflows remain pending.

## Provider ownership decision (2026-10-25)

All customer AI requests use platform-managed provider credentials. BYOK is not
offered or planned as a package benefit. Customers select available models but
never supply provider secrets. Landing copy, FAQ, and dashboard Model AI explain
this policy; the old customer API-key form has been removed. Existing server-side
provider secrets remain unchanged. This policy alone does not activate payments
or provide a chargeable tariff.

## AI tariff and reservation policy (011)

Historical 011 configuration (superseded in application runtime by 012 below):
`BILLING_MODEL_RATES_JSON` is an operator-only environment object keyed by exact
provider model ID. It defaults to `{}`: no model is chargeable until validated
provider pricing is configured. Dashboard cost estimates in `ai-pricing.js` are
NOT used as billing tariffs. Do not invent a price or copy a screenshot without
confirming its units/model/provider. Each model requires decimal strings
`inputUsdPerMillion`, `outputUsdPerMillion`, `cacheReadUsdPerMillion`, integer
`maxInputTokens` and `maxOutputTokens`, ISO `verifiedAt`/`validUntil`, and a safe
operator `approvalReference`. Dates must be current. Limits must be verified
model/context bounds, not guesses at typical prompt size. Use exact versioned
model IDs; a different response model/alias remains unresolved rather than being
silently repriced.

FX is fetched using the existing pricing service and must be available, positive
and no more than five days old. Each attempt captures FX and tariff once.
The customer debit is `ceil(provider USD cost × captured USD/IDR × 2)`, rounded
once to whole rupiah with BigInt arithmetic. No five-hour or weekly allowance.
As of 2026-10-26, reservations no longer assume the FULL model input capacity.
For supported text requests, input budget is UTF-8 byte length of the complete
server-built JSON request (including system instructions and history), plus
1,024 framing tokens and 32 per message, then 10% margin rounded upward, capped
at the approved model input limit. This is a conservative local estimate, not
an exact tokenizer count or provider usage evidence. Unicode is counted in bytes,
not characters/4. Reserve that budget at the larger input/cache-read rate plus
the requested maximum output; do not change provider context limits or prices.
Unknown request features, images, tools and non-text blocks fail before dispatch
rather than silently receiving text-only pricing. No token-count or inference
API call is needed for this estimate.

Actual usage still settles with captured prices/FX; unused funds return to the
original grants. If unexpectedly larger usage exceeds the hold, the existing
atomic wallet guard rejects settlement and keeps evidence/reservation unresolved
for reconciliation; it never silently overdrafts, frees the hold or replays AI.
Older snapshots keep their original policy and settlement behavior. Low balances
can still be refused when they do not cover the output cap and buffered input.
Partial, negative, oversized, cache-write or model-mismatched
usage cannot settle. Cache creation and extended thinking are not enabled until
their pricing rules are independently implemented and tested.

Wallet/hold/attempt reservation is atomic. SDK hidden retries are disabled.
Job/revision logical attempt keys are unique; a distinct deliberate model retry
is a separate charge. Stream finalization is shared, so two consumers cannot
charge a completed response twice. Settlement uses a stable ledger key and
stored evidence/snapshot, not today's FX or tariff. Transport errors, aborts,
crashes after reservation or DB failures may leave reserved funds. Even an error
shown to the user does not prove the provider did not bill the request.

Operator retry for an attempt whose provider evidence is ALREADY stored:

```powershell
$env:MIGRATION_NON_PROD_APPROVED = '1'
$env:MIGRATION_TARGET_LABEL = 'non-production'
$env:MIGRATION_NON_PROD_DB_NAME = 'virtual_office'
node scripts/reconcile-ai-billing-local.mjs <usage-uuid> --confirm-non-production
```

This local-only tool makes no provider call, cannot inject usage, cannot change
prices and cannot release an unknown outcome. Missing evidence requires secure
provider reconciliation; no automated evidence import/release/refund workflow
exists yet. Prepared holds also require investigation, not blind timeout release.
This remains a public-launch limitation. `ai_usage` and the usage dashboard still
display token telemetry/estimates; the billing ledger is the actual debit record.
Room visuals are unchanged; backend capacity enforcement does not yet add a
subscription padlock overlay in the Three.js office.

## 011 local verification: 2026-10-25

Verified loopback:3306, `virtual_office`, MySQL 8.0.30 and Laragon data directory
`C:/laragon/data/mysql-8/`. Only 011 was pending. Pre-011 dump:
`D:/VetendCode/database-backups/virtual-office-before-011-LFOHfv/before-011.sql`
(58,236 bytes, SHA-256
`1cdd49ece49bb67242481c5fd1692b23e386233595470e9f27e0091ebbabbd11`).
Dump completion/hash were checked; restore was NOT rehearsed. 011 applied and
complete schema validation returned `{"valid":true,"differences":[]}`.

`AI_BILLING_LOCAL_VERIFY=1 npm run test:billing:local` (PowerShell: set
`$env:AI_BILLING_LOCAL_VERIFY='1'` first) passed 16 checks: persisted-session
validation, reservation/actual debit/return, duplicate and retry accounting,
unknown hold retention, real CHECK/FK/unique constraints, revocation, wrong
workspace, insufficient balance, real second-connection wallet lock contention,
organization-wide division capacity, Starter WhatsApp denial, inactive package
denial, and count preservation after rollback. Test rates and funding exist only
inside rollback fixtures. Zero paid provider calls; two mock responses used.
Concurrent full-service spending is covered by serialized offline wallet mocks,
not committed customer charges on two live connections. Auto-increment
counters may advance despite rollback; no fixture records remain.

No real customer subscription, credit or provider tariff was activated. Without
those prerequisites, AI and paid team creation intentionally fail closed while
login, dashboard reads and existing history remain available. Payments, WhatsApp
delivery, self-service plan activation, renewal and add-ons are NOT operational.

Final regression: all 265 offline tests passed (zero skipped/failed),
`npm run test:billing` passed 31/31, and `npm run build` passed. Re-running the
migration runner returned `applied: []`; validation remained valid with no
differences. No dependencies installed and no live paid provider verification.

## Admin activation and tariff management (012, current runtime)

Platform Admin can now perform FIRST manual subscription activation from
`/admin/subscriptions` → **Aktifkan paket** on an active organization without a
subscription record. This is a privileged commercial approval, NOT evidence of
a successful gateway payment. The form requires an approval/payment reference,
reason, current catalog version, UTC start date, and explicit confirmation that
the admin authorizes the activation and its package credit. Standard terms are
resolved from the locked server catalog, never browser price/credit claims.
Custom requires all negotiated terms. The server calculates the calendar-month
end (clamped at shorter months) and rejects already-expired periods. Existing
division/member usage must fit the package; it is never reduced/backfilled.
Scheduled starts are allowed, but AI requires the period actually to be active.

Subscription, package grant, wallet ledger and `billing_operations_audit` share
ONE transaction with the validated platform grant. Audit failure rolls everything
back. Actor-scoped request UUID + canonical payload hash prevents duplicate
credit and rejects changed retries. Exact historical retries return their stored
result even after a period/tariff subsequently expires. A second activation under
any new request key is refused if a subscription record exists, including one
that expired/cancelled. Renewals, replacements, top-ups and refunds remain out of
scope; no generic browser credit-grant endpoint exists.

`/admin/billing` includes **Tarif AI untuk penagihan**. Enter exact model ID,
provider USD per million input/output/cache-read rates, verified full context and
output limits, verification/expiry dates, HTTPS source URL without credentials
or query secrets, reason, explicit human pricing confirmation, and enabled flag.
New entries default disabled and have no sample prices. The system validates
format, bounds and dates and records the admin's approval/source; it does NOT
fetch the URL or independently certify provider prices/model availability.
Use the real direct-provider price table and versioned IDs. The source URL must
never contain API keys. Cache writes/thinking are still unsupported. FX remains
dynamic with the existing freshness requirement; markup remains fixed at 2×.

012 adds `billing_model_tariffs` and `billing_operations_audit`, with no seed
rates, subscriptions or funds. Tariff changes use optimistic versions and audited
before/after snapshots. Runtime resolves each new AI attempt's tariff from this
database table ONLY; there is no `.env` fallback. The old environment adapter is
retained for isolated module tests, not Express runtime. Missing, disabled,
expired or malformed tariffs fail closed. Tariff versions are captured in each
attempt; a subsequent edit/disable cannot reprice existing captured attempts.
`/admin/audit` includes activation/tariff history (last 50 operations). All new
endpoints reuse real session + persisted Platform Admin grants, same-origin JSON
write protection and no-store responses; tenant roles/shared codes cannot fund
subscriptions or edit pricing.

Local evidence 2026-10-25: only 012 pending; loopback:3306, `virtual_office`,
Laragon `C:/laragon/data/mysql-8/` verified before backup/application. Pre-012 dump
`D:/VetendCode/database-backups/virtual-office-before-012-n4puTE/before-012.sql`
(60,728 bytes, SHA-256
`2bb4633564df0a67e807ff6fecea13a55735ff29e4834ffd74eed6747f69b294`).
Dump completion/hash verified; restore NOT rehearsed. 012 applied; full schema
returned `valid:true` and no differences. No migration is run at application startup.

PowerShell local verification:

```powershell
$env:BILLING_ADMIN_LOCAL_VERIFY = '1'
try { npm run test:billing-admin:local }
finally { Remove-Item Env:BILLING_ADMIN_LOCAL_VERIFY }
```

14 checks passed on real MySQL and real session-protected HTTP endpoints:
activation/grant/audit, duplicate/retry protection, tariff approval/versioning,
runtime tariff snapshot, actual wallet debit using one mocked provider response,
disabled tariff denial, old-snapshot settlement, settlement idempotency, rollback
on injected audit failure, audit unique key, revoked admin denial and final count
preservation. ALL fixture writes rolled back; no extra database and no paid
provider call. As with prior verifiers, auto-increment gaps may remain. UI forms
are covered by React SSR tests, not a live browser/provider certification.

The actual customer database still needs an explicitly authorized manual package
activation and REAL admin-approved provider tariffs before paid AI can be used.
Neither is auto-created by tests/migrations. Gateway checkout/top-up, renewals,
WhatsApp delivery and membership invitations remain separate unfinished work.

Final 012 regression: 278/278 offline tests passed, zero failed/skipped;
`npm run build` passed. The earlier 16-check AI wallet verifier also passed after
012. Runner reapplication returned `applied:[]`; complete schema remained valid.
Final live read confirmed zero subscriptions, credit grants, tariffs and billing
operation audit rows: no customer activation, credit or test tariff was retained.
No new dependency was installed; the npm lockfile was not regenerated.
