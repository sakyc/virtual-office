# Platform account administration

Routes: `/admin/users`, `/admin/organizations`, `/admin/subscriptions`, `/admin/audit`.
These reuse the existing opaque sessions and persisted `platform_admins` grants.
Organization ownership, workspace roles, shared-access codes, and browser identity claims never grant platform administration.

## Available operations

- Search and paginate account metadata (25 rows by default, maximum 50).
- Suspend/activate a non-admin account, or revoke all of its sessions. Each operation requires a confirmation, reason, and expected account status.
- Suspension revokes sessions in the same transaction. Activation never restores revoked sessions. There is no account deletion, password reset, impersonation, or HTTP admin promotion endpoint.
- Self-modification and modification of any account with an unrevoked platform admin grant are forbidden. Deleted accounts cannot be restored through this panel.
- Inspect organizations and their active memberships. Organization ownership and workspace membership are separate rows; a person can appear in multiple scopes. Archived workspace membership is labelled, not misrepresented as active access. No member/role reassignment or ownership transfer is exposed.
- Inspect recorded subscription snapshots, including organizations without subscriptions. Prices are historical subscription terms, not current catalog values. No activation, renewal, cancellation, funding, checkout, refund, or top-up action is exposed.
- Read the latest 50 account-administration audit events. Catalog audit remains separate on the same log page.

No chat content, job payloads, files, credentials, session tokens/hashes, or provider subject identifiers are returned.
All admin responses are `no-store`. Writes require exact configured Origin and JSON.

## Audit schema

`010_platform_admin_audit` adds one append-only-by-application audit table with actor/target foreign keys, action, reason, before/after status, revoked-session count, and timestamp. It does not alter existing user/resource data or grant privileges.

Apply through the existing explicitly approved non-production migration workflow, never at application startup. Check status/checksums first and preserve a backup of the same local database. No alternate database is required for this feature.

Until 010 exists, directory reads still work. User mutations fail closed: audit insertion failure rolls back the user status and session changes and returns `ADMIN_SCHEMA_REQUIRED`. Log reads report the missing schema. There is no unaudited fallback.

The audit is an application-level administrative trail, not a tamper-proof record against database operators. Only the existing platform-admin operator script grants/revokes platform access.

## Verification

Offline tests: `node --test test/platform-admin.test.js test/admin-dashboard-ui.test.js`.
Regressions: `npm run test:billing`, `npm run test:sessions`, `npm run test:authorization`, `npm run test:migrations`, `npm run build`.
Fixtures/mock connections do not prove real MySQL enforcement. Any local database execution and its result must be reported separately.

### Local execution — 2026-10-25

- Target verified using loopback host/3306, database `virtual_office`, MySQL 8.0.30, and Laragon's `C:/laragon/data/mysql-8/` data directory. No production connection or new database.
- Before applying, history/source checksums were clean and the only pending migration was `010_platform_admin_audit`.
- Backup: `D:/VetendCode/database-backups/virtual-office-before-010-KJGiWY/before-010.sql`, 56,566 bytes, SHA-256 `f438ad8bfced1747d73c332f751938cd50e436d300e24410b8d4a85632bfda6e`. Dump completion and hash checked; restore was NOT rehearsed.
- `npm run migrate:apply -- --apply --confirm-non-production` applied only 010. `npm run migrate:validate -- --confirm-non-production` returned `valid: true`, `differences: []`.
- `$env:PLATFORM_ADMIN_LOCAL_VERIFY='1'; node scripts/verify-platform-admin-local.mjs` passed 13 real MySQL/loopback HTTP checks. All fixture accounts, grants, organizations, memberships, sessions, subscriptions, status changes, and audit rows were inside an outer rollback transaction. Row counts matched before/after. No real customer account was suspended or assigned ownership. MySQL auto-increment sequences can retain gaps after rollback.
- The verification includes real schema/history, real-session access denial, directory projections, organization membership isolation, subscription snapshots, self-admin protection, suspension/session revocation, stale-state conflict, activation without session resurrection, audit persistence inside the transaction, and foreign-key failure rollback.
- No paid AI/provider calls or payment actions were made.
