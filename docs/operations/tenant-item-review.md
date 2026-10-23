# Tenant item review (local implementation)

`POST /api/dashboard/items/:id/reject` and `POST /api/dashboard/items/:id/revise`
require the existing server session, active workspace membership, member/admin/owner
permission, and a JSON body `{ "version": 1, "reason": "Human feedback" }`.
The version is an optimistic concurrency check, not identity evidence. Reasons must
contain 3–500 characters for rejection or 3–2000 for revision. Missing/out-of-scope
items return 404; stale versions and an in-progress revision return 409.

Revision reserves the scoped item with a row lock and sets `revising`. A
connection-scoped advisory lock prevents concurrent runners for that item. The
provider runs outside the row transaction. Session and membership are checked again
before generation and before committing output. Only a successful commit writes
the previous content/version into tenant-owned `revisions`, increments the item
version and returns the item to `draft`. Approval/deletion cannot modify an item
while it is revising. Raw provider/database errors are not persisted or exposed.

Provider/output failures restore the prior status without replacing content or
advancing the version. A generic `last_error` is displayed; the human must reload
and explicitly submit a new request. This service never automatically requeues or
regenerates a failed revision. The existing provider client's transport retry
policy is unchanged.

## Limitations and interruption recovery

This reuses the current in-process execution model, not a durable queue. A process
crash or database outage can leave an item at `revising`. There is no automated
lease expiration/replay and no public force-unlock endpoint. Never blindly resend
provider work or edit migration history to recover it.

For an interrupted local run, record only item ID, tenant/workspace ID, version,
approximate request time and a secret-free incident reference. Before any repair,
verify the isolated non-production target, backup/restore evidence, and absence
of an active revision runner/advisory lock. Inspect the scoped item's current
version and revision history to determine whether output committed. A human must
authorize a scoped recovery to the independently verified previous status; do not
guess that status from `revising`, and do not change content or delete history.
If the prior status cannot be established, leave the item blocked for review.
A durable job/attempt ledger and operator recovery CLI are separate work.

## Login prerequisite

Auth0 remains opt-in. When disabled, `/auth/me` and `/auth/login` return 503 with
`AUTHENTICATION_DISABLED`, without connecting to a database or issuing sessions.
Set the Auth0 placeholder fields documented in `.env.example` to real owner-managed
local-PoC values before enabling `AUTH0_ENABLED=1` and restarting the backend.
Never commit credentials or bypass the guard with fake sessions. After login,
complete onboarding/select an authorized workspace, then open `/app/board`.

Automated tests use HTTP, SQL and provider fixtures only; they do not prove live
Auth0 login, actual MySQL lock behavior, or real provider revision quality.
