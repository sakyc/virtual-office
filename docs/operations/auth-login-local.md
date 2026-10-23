# Local native login and registration

Native email/password is the default (`AUTH_PROVIDER=native`). `/login` and
`/register` contain credential forms and use the existing server session,
profile, workspace selection and tenant gates.

## Local setup

1. Use an identified local non-production database with migrations 001 and 002.
   Preserve a backup before modifying a non-disposable database.
2. Review pending migration 003 with the migration runbook's existing target
   approval variables. Run `npm run migrate:status -- --db --confirm-non-production`,
   then `npm run migrate:apply -- --apply --confirm-non-production` and
   `npm run migrate:validate -- --confirm-non-production` only in that approved shell.
   These are operator actions, never startup actions.
3. Set `AUTH_PROVIDER=native` and `APP_ORIGIN=http://localhost:5173` locally.
   An absent AUTH_PROVIDER also selects native, regardless of old Auth0 flags.
   No Auth0 credentials are needed.
4. Restart `npm run dev`, visit `/register`, create a local account and onboard.
   Log out, log in, select the workspace and check the Board.

Use the exact APP_ORIGIN in the browser. localhost and 127.0.0.1 are different
origins. Auth POSTs require that Origin and application/json. Production
configuration requires an explicit HTTPS origin and Secure cookies.

Migration 003 adds only native_credentials with a unique normalized email and
a user foreign key. No existing identities or customer ownership are changed.
The optional old Auth0 backend can still be selected with AUTH_PROVIDER=auth0;
the current frontend credential forms are for native authentication.

## Security and behavior

- Passwords require 12+ characters, maximum 256 UTF-8 bytes, and are not trimmed.
  Storage uses scrypt N=32768, r=8, p=1, a 16-byte random salt and a 32-byte key.
  Comparisons use timingSafeEqual; unsupported stored parameters are rejected.
- At most four KDF operations run concurrently. Login and signup share
  per-account and direct-socket-IP limits of 10 and 30 attempts per 15 minutes.
  In-memory counters are bounded and reset on process restart. Proxy users
  may share an IP limit; use shared durable limits before scaling out.
- Native users have issuer urn:virtual-office:native and a random subject.
  Email matching never links or takes over an existing Auth0 identity.
- Registration commits user, credential and session atomically. Duplicate
  normalized emails roll back without orphan users or sessions.
- Unknown user, wrong password and suspended-user login share one diagnostic.
  Raw database errors, credentials and password hashes are not returned.
- Session issuance retains the existing opaque token and SHA-256 token hash,
  24-hour absolute and 8-hour idle expiry, HttpOnly/SameSite=Lax cookies and
  Secure cookies in production. Successful reauthentication revokes the old
  browser session; logout uses the existing session revocation service.
- Registration assigns no organization, workspace, role or customer ownership.
  Onboarding and workspace selection still require a server-resolved session.

## Remaining verification and release limits

On 2026-10-23, the approved local Laragon database `virtual_office` was backed
up and restored to `vo_native_restore_1792725188620`. Its original four tables
were empty. Columns, types, nullability, defaults, indexes and foreign-key
definitions matched the restored copy and an independently applied baseline.
Baseline 001 was then adopted and migrations 002 and 003 applied first to the
isolated restore and then to the development target. Both validations returned
`valid: true` with no differences; history checksums matched all three sources.
Backup: `D:/VetendCode/database-backups/virtual-office-native-xMZLPe/before-native.sql`.
See `native-auth-local-verification.md` for evidence and verification limits.

Email ownership is not verified. Email delivery, password reset, recovery, MFA,
breached-password screening and persistent shared abuse controls are not yet
implemented. This is not a completed public SaaS authentication release.
Never use unverified email as authorization or invitation evidence. Select an
email delivery mechanism before implementing email verification and recovery;
never display reset tokens in responses or logs.
