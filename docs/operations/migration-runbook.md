# Migration backup, recovery, and adoption runbook

Only Operations-approved non-production targets may use migration commands. Set `MIGRATION_NON_PROD_APPROVED=1`, `MIGRATION_TARGET_LABEL=non-production`, and `MIGRATION_NON_PROD_DB_NAME` equal to `DB_NAME` only in the dedicated shell/job.

Before apply or adoption, record a verified backup identifier, timestamp, target label, schema fingerprint, and table row counts. Restore that backup into a different isolated non-production database. Compare the four baseline tables, row counts, foreign-key relationships, indexes, and sampled content checksums. Do not store connection strings or credentials in evidence.

Run validation before adoption: `npm run migrate:validate -- --confirm-non-production`. Adoption requires an approved backup reference: `npm run migrate:adopt-baseline -- --confirm-non-production --confirm-baseline-adoption --backup-reference=<approved-id>`. It records migration metadata only after contract validation and advisory lock acquisition; it does not run baseline SQL.

If a migration fails, stop deployment. Preserve `schema_migrations` evidence and error code. Do not delete or edit history and do not re-run the migration. Restore the verified backup or prepare a reviewed forward corrective migration. A schema-migration checksum mismatch is an integrity event: stop and investigate source/history divergence.
