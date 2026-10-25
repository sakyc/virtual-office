# Conversation model selection

Implemented 2026-10-25. One development database remains the target:
`virtual_office`. This task did not open, create, migrate or delete any database,
make provider requests, change `.env`, or install dependencies.

## Configuration and behavior

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
- No rupiah pricing, exchange rate, wallet deduction, subscription, or top-up is
  implemented by this change. Usage consumes provider credit as before. Price
  guidance explicitly states that the Saldo AI feature is not active yet.

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

007 has NOT been applied or verified on MySQL in this task. Use the existing
explicit migration workflow on the ONE approved local database after a current
backup. Do not run the historical disposable-database verifier for this change.
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
