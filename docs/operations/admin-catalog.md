# Admin Platform: catalog management (009)

Customer pages use `/dashboard` (including `/dashboard/office` and
`/dashboard/billing`); platform catalog administration stays at `/admin/billing`.
Legacy `/app` and `/app/*` links are replaced client-side with the equivalent
dashboard URL, preserving query/hash. Aliases do not bypass session or tenant
checks. No extra React application, database, or authentication system is added.

`/admin/billing` edits the existing four package definitions: name, monthly IDR
price, included monthly IDR credit, division/member limits, WhatsApp entitlement,
and public visibility. Four agents per division and maximum eight divisions
remain fixed renderer constraints. Custom keeps null price/capacity until a
separately approved quote; it is never implicitly unlimited. WhatsApp entitlement
does not activate delivery. Payments, wallet debits, provider rates and AI markup
are NOT enabled/edited by this increment.

`GET /api/plans`, landing pricing and owner billing all read `billing_plans`.
No hardcoded-price fallback is displayed on catalog errors. Pages fetch again on
open/reload, not via live push. Hidden plans cannot be newly activated through
the billing service, but existing subscriptions keep their snapshots.

`GET /api/platform/me`, `GET /api/admin/billing/plans`, and
`PUT /api/admin/billing/plans/:code` resolve the existing opaque session and check
the persisted, non-revoked `platform_admins` grant for every request. Tenant owner,
workspace admin, client IDs/roles, and shared access codes grant no platform rights.
The admin page works without a customer workspace. A dashboard link is shown only
after server confirmation. Existing customer route gates remain unchanged.

Writes require exact APP_ORIGIN plus JSON, a complete allowlisted payload,
expectedVersion, and a reason. A transaction locks grant and plan, increments
version, and inserts actor + before/after snapshots in `billing_catalog_audit`.
Version conflicts return 409. Audit failures roll back the price change. No route
edits/deletes audit history or grants administrator rights. The runtime database
account should be least-privileged; SQL operators can still alter tables outside
this service, so this is not a tamper-proof external audit system.

New subscriptions snapshot database terms/version under a plan lock. A retry of
the same idempotency key returns the original ledger result even after catalog
edits. This is initial activation only; renewal, upgrades, custom quoting and
checkout need their own reviewed workflows.

## Activate a named administrator

No customer is automatically promoted. The owner must first identify the exact
existing account/user ID to authorize. From an approved **local** environment:

```powershell
$env:MIGRATION_NON_PROD_APPROVED = '1'
$env:MIGRATION_TARGET_LABEL = 'non-production'
$env:MIGRATION_NON_PROD_DB_NAME = 'virtual_office'
node scripts/platform-admin.mjs grant USER_ID OWNER_APPROVAL_REFERENCE
# Immediate server-side revocation, without waiting for session expiry:
node scripts/platform-admin.mjs revoke USER_ID REVOCATION_REFERENCE
```

Replace the uppercase arguments; they are not default accounts. The script checks
active user, loopback target, database and Laragon datadir. Never expose this CLI
through an HTTP route. It does not change tenant memberships or customer access.

## Verification evidence (2026-10-25)

Migration 009 was applied explicitly to loopback MySQL 8.0.30, database
`virtual_office`, datadir `C:/laragon/data/mysql-8/`. Schema validator returned
`valid: true`, `differences: []`. No startup migration was introduced.

Before applying, a single-transaction dump was saved outside the repository:
`D:/VetendCode/database-backups/virtual-office-before-009-VbRSts/before-009.sql`
(53771 bytes), SHA256
`5890c19c5e1e1a90f1682936181c13afcca17c9efe2ca2c96cf047e5702143d7`.
The dump/hash were checked; restore was NOT rehearsed.

`npm run test:billing` covers real-session-shaped fixtures, access denials, forged
roles/scopes, CSRF, revoked grants/sessions, optimistic concurrency, atomic audit
rollback, Custom validation, public catalog and React component rendering.

For rollback-only **real MySQL** checks, without creating another database:

```powershell
$env:ADMIN_CATALOG_LOCAL_VERIFY = '1'
try { node scripts/verify-admin-catalog-local.mjs }
finally { Remove-Item Env:ADMIN_CATALOG_LOCAL_VERIFY }
```

This ran successfully: schema/history checksums, real session/grant, changed public
catalog, before/after JSON audit, stale-version rejection, audit FK failure and
savepoint rollback, hidden package, database-priced activation, immutable snapshot
and retry, grant/session revocation, then outer rollback. Original catalog and
table counts matched afterward. No permanent administrator, test subscription,
test session or test credit remained; no paid provider request was made.
HTTP concurrency uses mocks; actual concurrent MySQL admin HTTP requests and a
logged-in administrator browser flow have not been verified yet. No owner-selected
account has been granted platform administration in this implementation.
