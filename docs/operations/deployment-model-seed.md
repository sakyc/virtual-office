# Seed models on the deployment database

Use only after 001–016 schema/history validation succeeds and private credentials
have been rotated. Run as the cPanel account, not root, from the checkout with its
server-only `.env`. This entry point leaves local-only seed/migration guards intact.

```sh
cd /home/vetencode/apps/karyora
node scripts/seed-deployment-models.mjs --apply --confirm-production --database vetencode_karyora
```

It requires a matching explicit database, production environment, non-root DB
account, loopback DB host, valid migration source/checksums/history/full schema,
and a provider key. It uses the existing migration advisory lock. Provider model
metadata lookup is bounded and performs no inference. Seed writes are transactional.
Empty/provider failures do not write anything. It neither grants subscriptions nor
funds wallets nor changes database schema or customer ownership.

The existing seedModelCatalog implementation is reused: existing catalog rows and
admin tariff overrides are never overwritten. Only new metadata IDs are imported;
unknown prices or missing provider token-limit metadata remain disabled. The
owner-approved price list has an explicit expiry/review date; metadata is not a
provider price feed and this script does not invent prices/limits. A successful
import does not guarantee that models are ready to bill: inspect `/admin/models`
and enter/approve verified provider rates and limits where needed. Duplicate runs
are no-ops for existing models, not synchronization of changed metadata/prices.

No restart is required: the live catalog is read from the database. Verify with a
fresh user model-list request; inference testing is separate and incurs charges.
Output shows inserted/metadata counts only. On failure, stop and review its sanitized
code/status; never paste `.env`, provider headers, or full provider error objects.

Tests use fake metadata/connections only, no deployed DB or provider credentials:

```sh
node --test test/deployment-model-seed.test.js test/model-catalog.test.js test/default-model-tariffs.test.js test/deployment-bootstrap.test.js
```
