# WhatsApp activation and seven-day Trial subscription

## Scope and user flow

Landing **Coba demo** -> `/demo` -> `/register?demo=1` (or login)
-> send OTP -> verify OTP -> automatic separate activation message to the same
registered WhatsApp number -> enter activation code -> private demo office.
Normal registration, paid subscriptions and Midtrans remain separate.

Defaults are intentionally small and fixed for this first implementation:

- Seven days (168 hours) from successful activation, not registration or OTP
  verification; no recurring reset. The credit grant uses the exact stored access
  deadline. A reload, another login, resending or replaying activation never changes it.
- Rp3,000 AI credit, debited using existing reservation/actual-cost settlement.
- Six existing division templates: Proposal Writer, Ads Copywriter, Social Media,
  Web QA, Developer Helper and Reporting. Their existing roster contains 21 agents
  total, with a maximum of four per division. Agents use the team model tier.
- One human member, no task WhatsApp notifications and no demo top-up.
- All currently selectable models in the dynamic admin catalog are available,
  with the same approved pricing and provider-access checks as paid use. Disabled,
  expired or unpriced models are denied. Higher-cost models consume the Rp3,000
  budget faster. There is no separate model ID or allowlist for demo accounts.
- Fresh account only: activation does not modify existing organizations or teams.
- No fake task outputs or paid provider calls are generated at provisioning.

To purchase a paid package in the demo organization, keep only the desired number
of active divisions using team archive controls before choosing a smaller package.
For example Starter requires at most one active division. Archived data is retained;
there is no automatic deletion/downgrade selector. Existing capacity checks and
verified Midtrans fulfillment remain authoritative. Demo does not insert any row
into `billing_subscriptions`, so it does not block first paid activation. Trial
credit expires at the original deadline even after purchase; it is not refilled.
Active paid entitlement takes priority over demo capacity and expiry rules.

## Blitzmes contract verified from local source

Read-only reference:
`C:\laragon\www\blitzmes-main\core\server\app\controllers\api.controller.js`
method `sendMessage`, and `core/server/app/routes/api.js`.

Fixed HTTPS POST `https://api.blitzmes.com/api/send-message` with JSON
`{api_key, receiver, data:{message}}`. The sender converts `+62...` account format
to digits-only `62...`. A successful response must have HTTP 2xx and boolean
`status: true` (`message: "Message sent."`). HTTP 200 alone is not success.
Redirects are rejected, requests time out after 15 seconds, and no raw gateway
error/payload/credential is exposed to the browser or application logs.
Gateway acceptance is not a delivery receipt. Failed/uncertain sends invalidate
that code but retain the cooldown/send quota. Users can request a replacement;
there is no automatic network retry that could send duplicate messages.

The referenced gateway logs message payloads/previews. Restrict access and retention
of those gateway logs because OTP/activation messages contain temporary secrets.
No code or configuration in the Blitzmes project is changed by this feature.

## Security

- Session-derived user only, same-origin JSON writes, no body tenant/phone claims.
- OTP: five minutes, five attempts. Activation code: random 80-bit suffix, 24 hours,
  five attempts. Separate purpose-bound, per-user HMAC hashes, no raw code in DB.
- Sending OTP does not reserve the phone permanently. Successful verification
  claims a unique normalized phone digest; a second account cannot verify a claim
  for that phone. Digest identity is stable when the code secret is rotated.
- Once per account and verified phone. Resending never renews activation/credit.
- Persistent per-account send cooldown of 60 seconds, ten sends in a rolling
  24-hour window anchored at the first send; both kinds share the budget.
  Additional bounded in-process IP/account request limits apply. This does not
  prevent all multi-phone abuse; monitor costs before opening a public campaign.
- Per-user transaction lock serializes verification/activation. Activation creates
  tenant, memberships, six teams, expiring grant and ledger entry atomically.
  Activation rechecks the active session. Expired trial cannot reserve new AI work;
  existing held work can settle. Insufficient available balance denies new work.
- No paid subscription, schema reset, shared demo account or global access code.

## Trial subscription status and expiry

The customer sees **Trial** in Langganan & Saldo and the dashboard balance card,
with remaining days and an exact expiry in WIB. `/api/billing` exposes
`subscriptionStatus: "trial"` while valid and `"trial_expired"` afterward.
Expired history is presentation-only: it never grants AI or capacity entitlements.
At the stored deadline the backend denies new AI work and the remaining trial
credit expires. Accounts, teams, conversations and task history are not deleted.
There is no expiry cron required to enforce this rule.

Trial remains in `demo_access`, not `billing_subscriptions`; paid entitlement
takes priority and is not revoked when the old trial ends. Route `/demo`, existing
environment names and migration 018 stay compatible. No new migration is needed
for the duration/status update if 018 is already applied.

The seven-day duration applies to **new activations after deployment**. Existing
trials retain their previously stored deadline (including older three-day grants),
so deploying this change does not renew trials, refill balances or rewrite paid data.

## Deployment (not performed automatically)

Deploy code as `vetencode`. Do not run builds or PM2 as root.
Before applying migration, make a non-empty database backup as root:

```bash
install -d -m 700 /root/karyora-db-backups
KARYORA_DEMO_BACKUP=$(mktemp /root/karyora-db-backups/before-demo-XXXXXX.sql)
mariadb-dump --single-transaction --quick --routines --triggers vetencode_karyora > "$KARYORA_DEMO_BACKUP" &&
test -s "$KARYORA_DEMO_BACKUP" &&
printf 'Backup: %s\n' "$KARYORA_DEMO_BACKUP"
```

Only after backup success, run from the project directory as `vetencode`:

```bash
node scripts/upgrade-deployment-demo.mjs --apply --confirm-production --database vetencode_karyora --backup-confirmed
node scripts/upgrade-deployment-demo.mjs --validate --confirm-production --database vetencode_karyora
```

The guarded upgrade permits only complete, checksum-valid 001–017 history -> 018.
It validates the existing schema before DDL, checks for orphaned tables, and does
not blindly retry interrupted DDL. Stop and inspect any failure. It creates one
new table (`demo_access`); it never edits old migration SQL or customer data.
Already applied 018 can be validated without another apply. The old 017-specific
upgrade command is not the command for this release.

Configure private `.env` (do not paste real values into chats or commit them):

```dotenv
DEMO_ENABLED=1
BLITZMES_API_KEY=YOUR_PRIVATE_API_KEY
DEMO_CODE_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
```

Generate the secret locally on VPS with `openssl rand -hex 32`, then store it in
`.env` with permissions 600 owned by `vetencode`. Do not use a `VITE_` prefix.
Rotating the secret invalidates outstanding codes; it does not grant new trials.
`APP_ORIGIN` must be the exact HTTPS application origin. Never copy the API key
from docs/screenshots into source. Rotate any key already disclosed in chat.

After schema validation and configuration:

```bash
npm run build && pm2 restart deploy/ecosystem.config.cjs --update-env && pm2 save
```

## Verification and limitations

`npm run test:demo` uses mocked gateway/database calls and local HTTP/React SSR.
It sends no WhatsApp messages and creates no real database objects. Existing AI
billing tests also exercise multiple approved demo models and their actual prices,
disabled-model and low-balance denial, expiry denial, human capacity,
reservation and settlement with stand-ins. These are not MariaDB end-to-end proof.

Before public use, test `/demo` with a fresh real account on the deployed server:
OTP arrives on the registered phone -> wrong OTP preserves input -> correct OTP
produces a different activation message -> activate once -> six teams visible ->
chat using an active catalog model debits credit -> resending/reloading cannot refill credit.
Check gateway disconnected/invalid key, code expiry, duplicate phone, and trial
expiry/insufficient balance. Then test paid conversion and smaller-package capacity.
Do not claim live gateway delivery or production migration success from unit tests.

To stop new demo operations set `DEMO_ENABLED=0` and restart the correct PM2 owner.
This also denies trial AI access; it does not remove historical teams/messages or
affect paid entitlement. Individual Trial has no admin scheduling or background
cleanup. The separate one-account **scheduled demo** is managed at `/admin/demo`;
see [scheduled-demo.md](scheduled-demo.md). It has its own feature flag and does
not replace or extend individual Trial deadlines.
