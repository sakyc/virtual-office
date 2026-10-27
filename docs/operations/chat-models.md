# Conversation model selection

Implemented 2026-10-25. One development database remains the target:
`virtual_office`. Implementation initially used offline verification; the explicit
local activation recorded below subsequently applied 007. No additional database,
provider request, `.env` change, or dependency installation was needed.

## Configuration and behavior

### Current database-owned catalog (013, supersedes historical records below)

`ai_models` stores a stable internal UUID and the unique pair
`(provider, provider_model_id)`, display name, lifecycle and initial enabled/price
values. Only Anthropic is currently implemented. Provider IDs remain unchanged
in chat/usage records; existing billing snapshots are never rewritten. New
pricing snapshots additionally capture the internal catalog UUID and provider.

Runtime and `/admin/models` read the persisted catalog joined to
`billing_model_tariffs`. A versioned admin override wins in full, including
disabled/expired/invalid values. No runtime screenshot-price fallback exists.
Provider discovery can constrain availability but cannot publish unpersisted
models or approve prices. GET requests and application startup never seed data.

After explicit migration, run `npm run seed:models -- --confirm-non-production`
with the existing non-production migration confirmation environment variables.
The script positively checks local `virtual_office` and Laragon's datadir,
validates migration history/checksums and serializes with the migration lock.
It calls only the Models metadata API (not paid inference), binds exact display
names/limits to the supplied screenshot prices, and inserts missing catalog
rows. Unknown prices remain inactive. Existing manually approved IDs are imported
without guessing metadata. Reruns never change IDs, prices or admin disablement;
expired approvals are not renewed. Initial price approval still ends
2026-11-24 UTC. Review later prices through `/admin/models`, not by reseeding.

013 was applied to the positively identified local database on 2026-10-25;
schema validation returned `valid: true` with no differences. Existing-table
fingerprints and all migration checksums matched; a repeated apply was a no-op.
Backup: `D:/VetendCode/database-backups/virtual-office-before-013-Uhg1ln/before-013.sql`
(65,926 bytes; SHA-256 `8b035880db8e96e86ec3d6051f8437f974a4a18e9e427c4384d2df5a7cd3c4b7`).
The dump completed, but restore was NOT rehearsed; no extra database was created.
The initial seed inserted 13 models; rerun inserted zero, preserving the existing
disabled Fable override. Eight models have selectable prices, four are unpriced
(including Sonnet 5.5), and one is disabled. No inference call was performed.
Do not assign Sonnet 5's price to Sonnet 5.5. A configured default that is inactive
remains denied; choose an active model explicitly or approve its correct price.

`npm run test:model-catalog` uses mocks. For authorized local rollback-only checks:
set `MODEL_CATALOG_LOCAL_VERIFY=1` and the non-production confirmation variables,
then run `npm run test:model-catalog:local`. This verifies real constraints,
session/admin access, status audit/idempotency, failed-audit rollback, seeder
preservation and fixture cleanup in the same development database. Eight checks
passed, with all fixture changes rolled back and zero paid provider calls.

Model deletion, display metadata/order editing and persisted agent defaults are
not implemented by this step. Use Nonaktifkan to preserve historical references.

### Historical admin management implementation (before 013)

`/admin/models` is now a dedicated **Model AI** navigation entry. Its list comes
from authenticated `GET /api/admin/models`: real server session and persisted
Platform Admin grant are checked before provider discovery. Responses are
no-store, unknown query filters are rejected, and a listing never creates tariffs.
The catalog reads tariff rows using the existing authenticated transaction's
connection (no nested pool checkout while session/admin locks are held).

The page provides search, active/unavailable filters, read-only API IDs, provider
discovery status, default/admin price provenance, USD input/output/cache-read
prices, and distinct active/disabled/missing/invalid-tariff states. Price edits and
enable/disable confirmations reuse `PUT /api/admin/billing/tariffs/:model` with
optimistic versions, actor-scoped idempotency UUIDs, reason, explicit confirmation,
same-origin JSON and atomic audit. Status changes submit the exact displayed
tariff unchanged, not a fresh date or a guessed price. New discovered models can
be configured via their row; prices are blank if not known. Expired prices require
explicit review in the price editor before enabling. Admin disablement overrides
hardcoded defaults on subsequent selections/sends and pricing reads.

`/admin/billing` now links to this page instead of presenting a second model
configuration UI. Existing billing audit remains under `/admin/audit`. No schema
change or actual database write was needed for implementation/tests. Automated
HTTP integration uses mocked persistence/provider metadata; frontend verification
uses real React SSR plus production build, not a live provider/browser session.

This step does not implement model deletion, editable display metadata/order, or
persisted team/leader default-model settings. Those remain separate work; no full
CRUD completion is claimed and history is not deleted or reassigned.

Verification: `npm run test:admin-models` passed 32/32 focused tests; all offline
test files passed 300/300 with zero failed/skipped; `npm run build` passed.

### Historical automatic catalog (before 013; not current runtime behavior)

The running server now combines `MODEL_TEAM`/`MODEL_LEADER`, optional operator
labels from `CHAT_MODELS_JSON`, the configured Anthropic client's Models API,
and exact model IDs registered in admin billing tariffs. API IDs are never
invented. Prices now have owner-approved defaults as described below. Discovery is server-side metadata
only, cached for ten minutes, with deduplicated requests, three-second per-page
timeouts, no SDK retries, and a bound of ten pages of 100 entries. Discovery
failure backs off for one minute and retains only configured/admin IDs, without
exposing provider errors. No live provider calls were used for verification.

Only currently selectable models are published in the customer chat context and
displayed in the office composer. Disabled/unpriced/expired models remain visible
in `/admin/models`, not customer choices. Disabled defaults are omitted from the
customer default map too. The client also filters unavailable options defensively.
A saved conversation whose model became unavailable shows a generic disabled
"Pilih model aktif" placeholder, never re-inserts that model into the choices or
silently rewrites the stored selection. Historical messages remain readable.
Refresh/reopen chat to reload the choices after an admin change; no realtime push
is implemented. Every send still checks current server pricing/status.
Selection/send
requires an enabled, unexpired, validated tariff with sufficient output allowance
for the configured `MAX_TOKENS`; known retired/incompatible models are disabled.
Models missing pricing are omitted from customer choices. Approved manual IDs can still be
used if discovery is unavailable, but their provider availability is not promised.
Billing independently rechecks the tariff and reserves funds before inference.
Discovery does not grant subscriptions, balances, identity, or tenant permissions.

Tariffs are reloaded on context reads, explicit model selection, and sends. History
reads, renames and deletion do not depend on provider discovery or tariff approval.
The UI uses text-only labels and describes the difference between token counts
and price per token. Labels use these operator-defined USD-per-million thresholds:
Hemat = input <= 1 AND output <= 5; Seimbang = input <= 3 AND output <= 15;
otherwise Premium. They are not intelligence benchmarks. Task guidance uses the
provider's model-line metadata when supplied, never guessed version numbers.

The owner explicitly requested hardcoding the supplied screenshot prices.
`shared/ai-model-prices.js` now contains all ten standard/non-batch price entries,
with version `owner-screenshot-20261025-v1`. These are owner-supplied rates, not an
independent verification of the provider's current official rates. Input, output
and cache-read rates are billed; screenshot 5-minute cache-write prices are kept
as reference only. Cache writes/extended thinking remain disabled.

`server/default-model-tariffs.js` binds an exact provider display name to that
provider-returned API ID and context/output limits. It normalizes only whitespace,
case and the optional `Claude` prefix. Sonnet 5 is NOT Sonnet 5.5, for example.
Missing metadata, unknown versions, retired models and invalid limits remain
unavailable. No guessed IDs or context sizes are added. Defaults are valid from
2026-10-25 until a fixed review deadline of 2026-11-24 UTC; expiry never silently
renews on restart. Review and update the rate card/version if pricing changes.

Any persisted admin tariff overrides the default for that exact ID, including a
disabled, expired or malformed record. Database read failures never bypass admin
disablement by falling back to defaults. `/admin/billing` displays the read-only
default table and keeps manual overrides optional. No database seeds or migration
are needed. Billing snapshots capture the default version, exact rate and FX;
old attempts continue settling with their captured values after rates change.
The same active rates are used for dashboard current-rate estimates (still not
historical invoices). Rupiah charging remains supplier USD cost × captured FX × 2.

This expands **per-conversation chat choices**. Agent/job default tiers remain
team/leader; it does not change their persisted schema or task behavior. No
migration, dependency install, `.env` edit or customer-data write is needed.

Initial verification for the expanded catalog: `npm run test:chat-models` (7 tests),
all offline test files (285 passed, none failed/skipped), and `npm run build`
passed. Provider metadata and tariff reads use mocks in tests. Actual provider
discovery, live inference, and browser appearance remain unverified for this change.

After owner-approved hardcoded tariffs: all 293 offline tests passed (none
failed/skipped), including billing reservation/settlement with a captured default
price snapshot, exact screenshot rates, strict version matching, admin override
denial, fixed expiry, and dashboard estimate consistency. `npm run build` passed.
No database writes, migrations, dependency installation, or paid provider calls
were performed for this update.

### Original implementation record

- The authenticated context exposes an operator-defined model allowlist. Existing
  `MODEL_TEAM` and `MODEL_LEADER` are always included; optional `CHAT_MODELS_JSON`
  adds entries or labels/categories for these same IDs. There is no provider
  discovery, no API key in the browser, and no promise every configured ID is
  enabled on the provider account.
- Each JSON entry has exactly `id`, `label`, `costClass`. Valid categories are
  `economy`, `balanced`, `premium`, and `unspecified`. Descriptions explicitly call
  these operator classifications, not guaranteed prices or capabilities. Both
  existing model IDs default to unspecified until the operator classifies them.
  Malformed configuration stops startup with a sanitized configuration error.
- The office selector can follow the agent default or choose an allowed ID.
  Existing-conversation changes persist through the same owner/user/workspace gate
  and CSRF checks. An unsent new chat keeps its choice only in memory; its first
  send creates the conversation and selected model in a single INSERT.
- The server resolves the stored selection under the conversation row lock and
  captures it for the entire turn. Pending turns reject model changes. Model IDs
  sent directly to the streaming endpoint remain rejected, including attempts to
  override identity or permissions. A removed ID fails before reservation/provider
  invocation; there is no silent switch to another model.
- Each new message stores the requested model snapshot. SSE reports that model,
  the UI labels assistant replies, and the existing usage ledger records the same
  model used for the provider request. Prior messages retain their old snapshots;
  pre-007 rows remain NULL (unknown), not falsely attributed to today's model.
- Model snapshots are metadata, never forwarded as conversation text. Changing a
  model affects future turns only; completed history stays in the conversation.
- At the original 007 implementation stage, rupiah billing was not yet active.
  That historical limitation is superseded by 008–012 and the current catalog:
  chat copy now correctly states that active AI usage charges Saldo AI in rupiah.

## Migration and verification

`007_chat_model_selection` only adds nullable `VARCHAR(191)` model IDs to existing
conversation/message tables. Applied migrations 001–006 remain untouched; no
backfill is performed. 007 is registered and SHA-256 inspected by the existing
framework. Schema validation checks both new columns when 007 is recorded applied.
The store checks the two optional columns read-only and caches capability until
restart. Before 007, existing 006 chat/history continues using its original SQL;
the model selector is hidden and explicit override writes are refused. No model
preference is silently accepted or discarded. After 007 and a server restart,
selection and message snapshots are enabled. Metadata errors fail closed.

007 was applied on 2026-10-25 to the approved local `virtual_office` database.
The listener was positively identified as Laragon MySQL 8.0.30, with executable
`C:/laragon/bin/mysql/mysql-8.0.30-winx64/bin/mysqld.exe` and data directory
`C:/laragon/data/mysql-8/`. History 001–006 and their checksums matched before
application; only 007 was pending. The existing migration framework applied 007
under its advisory lock. Complete schema validation returned
`{"valid":true,"differences":[]}` and history/checksums matched all seven sources.
Fingerprints of all original columns in the two conversations and four messages
were unchanged; both newly added model columns remained NULL for those rows.

The current pre-007 backup and verification evidence are outside the repository:
`D:/VetendCode/database-backups/virtual-office-model-2REdNW/before-007.sql`
and its adjacent `verification.json`. The dump exited successfully, contained its
completion marker, and was 41,989 bytes. SHA-256:
`506691ec668edeb5c9dd022506d08d67f974f6fe20fe5fc5960b3dba91246d71`.
This backup was NOT restore-rehearsed: the owner requested the single-database
workflow, so no restore database was created and no restore over development data
was attempted. This is a limitation relative to the restore rehearsal in the
general migration runbook, not evidence of a successful restore test.

For future authorized local implementation tasks, include explicit migration
activation after checking the local target, pending history/checksums, current
backup, and migration scope; validate again afterward and report actual results.
Do not run the historical disposable-database verifier for this workflow.
`initDb()` and automatic startup behavior remain unchanged; no migration is run
on startup. No new database is necessary to activate model selection.

Offline checks: `npm run test:chat-history`, `node --test --test-reporter=spec`,
and `npm run build`. Tests cover catalog validation, actual mock-provider/usage
model selection, persisted choices, immutable message snapshots, pending-turn
conflicts, removed/forged model rejection, tenant isolation, model-column contract,
and selector persistence in the real panel DOM double. Browser appearance and live
provider account model availability remain unverified.

Final results: 207/207 tests passed and `npm run build` passed. The historical
006 disposable verifier now refuses a newer manifest before opening a connection
or creating a database, so its old npm command cannot accidentally create another
test schema during the single-database workflow.
