# Post-deployment status — 28 October 2026

The owner reports deployment succeeded. This document is not an independent remote
E2E verification. No remote DB/service changes are made by local code edits.

## Auth rate limits behind Apache

Native login/register and password changes previously keyed their IP budget by
`req.socket.remoteAddress`. Behind Apache all visitors shared a loopback IP, so
one visitor could exhaust everyone else's IP allowance. Both now use Express's
resolved `req.ip`, with socket fallback, never raw forwarding headers.

Express trusts only directly connected loopback proxies instead of a blanket hop
count. Production must bind `HOST=127.0.0.1`; Apache must overwrite X-Forwarded-For
with REMOTE_ADDR and X-Forwarded-Proto with https, as checked in deploy/apache.
Do not add a CDN/proxy without reviewing the complete forwarding trust chain.
The limits remain 30 per IP and 10 per account over 15 minutes, shared by native
login/register. Password-change limits are scoped to its limiter and resolved user.
The limiter is process-local: restart resets it; multi-instance/distributed limits
are not implemented. No session, password, role, tenant policy or DB schema change.

Local HTTP regression tests cover independent proxied visitors, cross-IP account
exhaustion, nearest-untrusted-hop handling and ignored headers when trust is off.
They do not authenticate to the deployed service or generate paid AI requests.

## Dependency security repair

Audit identified GHSA-27r3-jxmh-p828 (high, compressed request body DoS) in
Express's transitive `body-parser@2.3.0`. A targeted
`npm update body-parser --ignore-scripts --no-audit --no-fund` updated only that
installed package to 2.4.0 within Express's existing `^2.3.0` declaration.
No root manifest dependency declaration changed. npm also reclassified the dev
flags for @types/node and undici-types in lockfile metadata; versions unchanged.
`npm audit --omit=dev --json` afterward reports zero high/critical and four
moderate findings in ajv and its Rushstack/Umzug ancestry. These are not claimed
fixed or proven unreachable; the parent pins ajv `~8.13.0`, so a forced override
is not included in this limited repair. Review a supported parent upgrade next.

The local Node 20 runtime emits an existing engine warning for concurrently
(requires Node >=22). The deployed Node 22 runtime meets that requirement.
Apply the committed lockfile using `npm ci` on the VPS, not npm audit fix.

## Remaining work (not completed by deployment)

- Remediate the remaining moderate dependency audit findings with parent compatibility tests.
- Durable task/revision execution. Controlled shutdown is now implemented in
  `graceful-shutdown.md`, but crash recovery and durable resume are still absent.
- Backup restore rehearsal and operational recovery documentation.
- Payment gateway selection, checkout and verified/idempotent webhooks. Manual
  subscription activation and wallet administration are not automatic payments.
- WhatsApp provider setup, phone verification, notifications and secure review
  actions. A plan's WhatsApp flag is not a working messaging service.
- Password recovery/email verification and invitation delivery integration.
- Verify deployed owner/admin/member flows, model catalog and tariff readiness,
  wallet usage, task review, session revocation and cross-tenant denials.

Production changes require a separate deployment; code updates do not apply
migrations. Keep the existing single-worker runner and avoid restarts with active
paid work until execution recovery is addressed.
