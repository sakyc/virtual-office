# First deployment database initialization

`scripts/bootstrap-deployment.mjs` is a separate production-aware entry point;
existing non-production migration guards are unchanged. It supports exactly the
current 001–021 release and initializes **only an empty database**. Never use it
to upgrade, retry partial DDL, seed models, or repair an existing installation.

Prerequisites: a new dedicated deployment database/user, loopback database server,
server-private `.env` with `NODE_ENV=production`, matching `DB_NAME`, non-root
`DB_USER`, and `DB_PASSWORD`. Rotate any exposed credentials first. No app/PM2
process or other writer may use the target during initialization. Use the cPanel
account, not root, for Node commands. Keep a snapshot/dump before later upgrades.

```sh
cd /home/vetencode/apps/karyora
node scripts/bootstrap-deployment.mjs --apply --confirm-production --database vetencode_karyora
```

This command changes schema and inserts migration seed/history rows. It inspects
the manifest/checksums before connecting, locks using the existing migration
framework, confirms the selected database and absence of all tables, then applies
the registered migrations. It validates history checksums and the full schema
contract including tenant members and flexible shared demos. Expected output contains 21 applied IDs and
`validation: { valid: true, differences: [] }`. No provider calls, model-catalog
API seed, legacy ownership assignment, or application startup are performed.

After initialization, validate without applying/replaying any migration:

```sh
node scripts/bootstrap-deployment.mjs --validate --confirm-production --database vetencode_karyora
```

This mode runs metadata/history SELECTs in a read-only transaction, requires all
21 migration IDs to be applied with matching checksums, and validates the full
schema. It is also the correct next step after a validation-only failure. The
validator accepts MariaDB integer display widths and its JSON alias only when
an exact JSON_VALID check exists on the corresponding LONGTEXT column. Signedness,
nullability, foreign keys and index requirements are not relaxed.

On any failure, stop and retain history/logs. MariaDB DDL is not transactional.
Do not drop tables, re-label this production target as non-production, or rerun
blindly. A successful second invocation is intentionally rejected as non-empty.

Verification on the development machine uses mocked connections only:

```sh
node --test test/deployment-bootstrap.test.js test/migration-framework.test.js test/migration-status.test.js
```

Actual MariaDB execution and schema validation must be confirmed from deployment
output; passing mocked tests does not establish that remote initialization passed.
