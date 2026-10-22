# API application boundary

The Express API remains in `server/` during incremental migration. It cannot move yet because the current migration scripts, tests, and static frontend serving import it by root-relative paths. `apps/api/` reserves the target application boundary without creating a duplicate backend.

Move the backend only with a dedicated import-path, scripts, migration-path, and startup compatibility change.
