# Midtrans Snap — initial subscription and AI top-up

Implemented locally; no keys, remote payment calls or database migrations were
executed while implementing. The default is OFF. Existing manual billing and AI
debits continue unchanged. No changes are made to Blitzmes or its Midtrans account.

## Supported scope

- Organization owner only, on `/dashboard/billing`: first Starter/Pro/Business
  subscription, one monthly period with included credit; and AI balance top-up
  (Rp10,000–Rp10,000,000) while a subscription is active.
- Prices/limits are read from the admin-managed catalog and snapshotted at order
  creation. Catalog edits after checkout cannot change a paid purchase.
- Payment starts the period on fulfillment, using UTC and calendar-month end
  clamping (January 31 -> February 28/29), not a fixed 30-day duration.
- No autodebit, renewals, upgrades/downgrades, Custom quotes, add-ons, coupons,
  automated refunds, payment fee/tax surcharges or WhatsApp. The displayed amount
  is the charged amount; Midtrans fees reduce merchant receipts, not AI credits.
- Top-ups do not expire but do not extend a subscription. Existing initial-only
  subscription policy is preserved; customers with an existing subscription
  cannot purchase another package through this release. Contact admin instead.

## Configure (never send keys to chat/Git)

Backend `.env` only:

```dotenv
MIDTRANS_ENABLED=1
MIDTRANS_IS_PRODUCTION=0
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
MIDTRANS_SANDBOX_ORGANIZATION_ID=
MIDTRANS_SANDBOX_ALLOW_ALL=0
```

Fill keys from the SAME Midtrans Sandbox account. `MIDTRANS_IS_PRODUCTION=1`
selects the separate Production endpoints and must use Production keys instead.
`MIDTRANS_ENABLED=0` disables new checkout/reconciliation. No `VITE_` key is needed;
only Client Key is returned to the authenticated owner for Snap. Server Key never
leaves the backend, except its Basic authentication to the fixed Midtrans host.

On `NODE_ENV=production`, Sandbox defaults to requiring the numeric ID of one
dedicated test organization in `MIDTRANS_SANDBOX_ORGANIZATION_ID`. Alternatively,
if the ENTIRE installation is still being developed and ALL accounts are test
accounts (no real customers), set `MIDTRANS_SANDBOX_ALLOW_ALL=1`. This explicit
opt-in opens Sandbox to all organizations and overrides an existing tenant ID;
the tenant ID can be left blank. Owner-only checkout, authentication, payment
verification, tenant isolation and duplicate-credit prevention remain enforced.
Only the exact value `1` enables this opt-in. It does not select real Production
payments and does not enable payments without keys or `MIDTRANS_ENABLED=1`.

Sandbox grants enter normal application wallets and activate normal plans,
without any real money being received. Fake credit can incur real provider costs
if used for paid AI calls. Before onboarding real customers, set
`MIDTRANS_SANDBOX_ALLOW_ALL=0`, reconcile test subscriptions/grants with an
operator, and switch to approved Production credentials/endpoints. There is no
automated destructive cleanup of test data. Existing orders retain their own
environment, so Production cannot fulfill Sandbox orders.

Notification URL for this integration (must be publicly reachable over HTTPS):

`https://app.karyora.vetencode.com/api/payments/midtrans/notification`

Set it in the Midtrans account used for Karyora. Do NOT overwrite Blitzmes's
notification URL on a shared live merchant account. Arrange a separate Karyora
merchant/account or a reviewed routing strategy before sharing credentials.
Localhost alone cannot receive external notifications; an owner can use
"Periksa status" to independently verify status from the backend during local
testing. UI callback results never grant funds.

## Migration / deployment (separate explicit operation)

017 only creates `billing_payment_orders`, with tenant/creator FKs and unique
request/provider-transaction keys. 001–016 sources remain immutable. No startup
migrations are added. Keep payments disabled until 017 is applied and validated.

After reviewing changes and deploying source, create/verify a backup of the target
database by your usual operational procedure. The following command's backup
flag is an operator assertion, NOT a backup creator. During a maintenance window,
as the existing PM2 owner (root in the latest deployment):

```sh
cd /home/vetencode/apps/karyora
node scripts/upgrade-deployment-payments.mjs --apply --confirm-production --database vetencode_karyora --backup-confirmed
node scripts/upgrade-deployment-payments.mjs --validate --confirm-production --database vetencode_karyora
```

This narrow upgrade requires a matching local non-root DB account, production
confirmation, valid checksums and all sixteen existing applied migrations. It
refuses a pre-existing payment table without migration history or unrelated
pending migrations. On ANY failure stop: DDL is non-transactional; don't drop
tables or repeatedly rerun. Fresh deployments use the existing bootstrap script,
now expecting all seventeen migrations. Model seeding validates the latest
seventeen-migration schema as well.

Then fill the keys/test tenant, enable Sandbox, and use:

```sh
pm2 restart deploy/ecosystem.config.cjs --update-env
pm2 save
```

Do not run `pm2 env`/`cat .env` in shared output or post keys. There is no reason
to restart other PM2 apps. This document is not evidence of a completed deploy.

## Payment trust and recovery

- Checkout identity/organization is resolved from the existing authenticated
  tenant gate. Owners only; same-origin JSON required for customer writes.
- Checkout accepts only kind, request UUID, plan/version or bounded top-up amount.
  Browser price, custom terms, organization and balance claims are rejected.
- Each request UUID is unique per organization, with a payload hash. Retrying
  the same request cannot create a second provider checkout.
- Webhook has no user session/CSRF requirement (server-to-server), but requires
  timing-safe SHA-512 signature verification AND independent authenticated
  Midtrans GET Status. Compare order ID, amount, currency, environment and
  provider transaction ID before granting benefits.
- `settlement` (not fraud-challenged) or `capture` with fraud `accept` can fulfill.
  Pending/expired/cancelled/denied/challenged payments do not grant credit.
- Wallet lock, order row lock, unique constraints and a single DB transaction
  cover the subscription/grant/ledger/payment result. Concurrent/repeated webhook
  deliveries do not double-credit. HTTP customer check uses the same service.
- Admin activation/capacity changes conflicting with a paid subscription become
  `needs_review`, without silently giving an invalid plan. Operators must review
  the order and provider dashboard; no automatic refund/replay is performed.
- A provider timeout can leave `creating` with no Snap token. Its order remains
  as evidence; retries never blindly recreate it. Check status using the original
  ID; if provider status is unavailable/not found, review in Midtrans before
  creating another payment. There is no automated retry worker/recovery console.
- Refund/chargeback notifications are recorded in provider status and flagged in
  owner history. They do not automatically remove already-spent funds or revoke
  entitlements. Handle these through reviewed operator reconciliation.
- Owner history is limited to the most recent 30 orders; balance ledger remains
  separately visible. No reconciliation polling worker or admin payment console
  is included in this initial integration.

## Verification before opening real payments

Run `npm run test:payments`, existing regressions and `npm run build` locally.
These use mocked provider/DB responses and local HTTP; they are not real Sandbox
or MySQL/MariaDB end-to-end tests. After explicit migration and Sandbox setup,
test pending -> settlement, expiry/cancellation, signature rejection, repeated
notification, member denial, separate-tenant denial, initial package and top-up.
Check the owner wallet and ledger against the Sandbox dashboard. Only switch to
Production after these pass and merchant/payment methods are approved by Midtrans.

Local verification on 28 October 2026: production frontend build passed; the
full offline regression run passed 410/410 tests, including 18 payment tests.
`npm ci --dry-run --ignore-scripts --no-audit --no-fund` also passed without
installing new dependencies (existing local Node 20/concurrently >=22 warning).
Actual Sandbox payment, external webhook delivery, migration execution and VPS
deployment remain unverified/unperformed in this implementation step.
