# Native authentication local verification — 2026-10-23

Target: `virtual_office` at loopback port 3306, positively identified as the
local Laragon MySQL 8.0.30 process. The owner authorized preparation and migration
after diagnosis. No production service was accessed. Target approval flags were
limited to child migration processes; `.env` was not changed.

## Backup and preflight

- Original tables: clients, jobs, items, revisions; all InnoDB, zero rows each.
- Backup: `D:/VetendCode/database-backups/virtual-office-native-xMZLPe/before-native.sql`.
- Backup size: 6547 bytes.
- Backup SHA-256: `df8ea61de5bb7587b33e5b5b3abf8ec46c84ed8055095e37da82e16430bf1413`.
- Restore: `vo_native_restore_1792725188620`.
- Baseline reference: `vo_native_reference_1792725188620`.
- Backup tool: local mysqldump with single transaction, no table locks,
  no tablespaces, GTID purge off and column statistics off. Credentials were
  passed only through the child environment, never logged.
- Initial text-only SHOW CREATE comparison flagged redundant CHARACTER SET
  clauses emitted by mysqldump. Semantic metadata comparison and normalized
  SHOW CREATE comparison subsequently passed for all four tables. The source
  has five foreign keys. No source migration began until restore verification
  and baseline comparison passed.

## Migration execution

The adoption CLI had incorrectly required a one-entry manifest. It now selects
only the immutable first baseline while accepting registered later migrations.
Two regression tests cover valid selection and invalid/missing/duplicate
baseline rejection. Existing contract, backup, confirmation, history and lock
checks remain required.

For the isolated restore first, then the approved development database:

```
node scripts/migration-adopt-baseline.js --confirm-baseline-adoption --confirm-non-production --backup-reference=local-native-xMZLPe-restore-verified
node scripts/migrate.js --apply --confirm-non-production
node scripts/migration-validate.js --confirm-non-production
```

All commands exited 0. Baseline 001 was recorded as adopted, never executed
against existing tables. Migrations 002 and 003 were applied. Both schema
validations returned `{"valid":true,"differences":[]}`. Final read-only command:

```
node scripts/migration-status.js --db --confirm-non-production
```

It returned no diagnostics; all history checksums match immutable source:

| Migration | Status | SHA-256 |
| --- | --- | --- |
| 001_current_schema_baseline | adopted | 766b5f8cf0d5d934c177e9a44ec5daafeb74fd3848090dfa368d947218f73351 |
| 002_tenant_foundation | applied | 8a7b557f01f347bc554c8f8c43d03d5d750ccb7c2f8a70cb8fa2c08e58811118 |
| 003_native_credentials | applied | e7741b236f0a008dd3cd82daf79753cbcfd8802dd6c055d277733b4c820539e2 |

## Real local authentication checks

Real Express handlers and mysql2 connections ran against the isolated restore,
with generated disposable credentials. No Auth0 or AI provider was contacted.
All eleven assertions passed:

1. Registration returned 201 and issued a session.
2. The new account had no workspace privileges.
3. Dashboard access without a workspace returned 403.
4. Onboarding returned 201.
5. Authenticated dashboard access returned 200.
6. Logout returned 204.
7. Reusing the revoked session returned 401.
8. A wrong password returned 401.
9. Correct credentials returned 200.
10. Server-validated workspace selection returned 200.
11. Tenant Board list returned 200 with no items.

The running development backend at localhost:3001 now returns 401 for an
unknown account login, demonstrating the credential query succeeds rather
than failing with 503. The register page at localhost:5173 returns 200.
No test account was created in the development database. Post-migration counts
for clients/jobs/items/revisions/users/native_credentials/sessions remain zero.

Backup and verification databases are retained; the isolated restore contains
only the generated test account/workspace. Browser interaction and a real
owner-created account remain to be verified by the owner. Email verification,
password recovery, MFA and production release controls remain incomplete as
documented in the native login runbook.

## Onboarding regression — 2026-10-23

Executed `node scripts/verify-local-onboarding.mjs --database=vo_native_restore_1792725188620`
with `LOCAL_AUTH_VERIFICATION_APPROVED=1` scoped to that verification process.
The loopback listener was identified as Laragon MySQL 8.0.30 before connection.
The retained isolated restore above was used, not the `virtual_office` development
database. No `initDb`, schema SQL, migration, provider, or AI worker was invoked.

Result: PASS. Registration 201; fresh profile routes to onboarding; dashboard
before workspace 403; onboarding 201 with the exact submitted workspace name;
server-derived owner role and active workspace verified; empty dashboard 200;
repeat onboarding 200 with the same workspace and exactly one organization
membership; logout 204; revoked cookie 401; login again 200 with the existing
workspace available for server-validated selection, not onboarding; final logout 204.

Column metadata fingerprint and row counts for clients/jobs/items/revisions were
unchanged. Generated QA fixture `onboarding-qa-8c78dbb4-0d18-4593-b62d-d37ff38c681a`
is retained in the isolated restore only; its sessions were revoked. No credentials
or session tokens are recorded. The script creates additional QA account/workspace
records on each explicitly approved run; it never deletes or backfills existing data.

This verifies real HTTP handlers against local MySQL, not a production release or
a browser login using an owner-created account.
