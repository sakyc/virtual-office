# Native password change

Profile/settings includes a password-change form for existing native accounts.
`POST /api/account/password` accepts only `currentPassword` and `newPassword`.
It requires the configured exact application Origin, JSON, a live server session,
the current password, and the existing signup password policy (maximum 256 UTF-8 bytes).
The new password must differ from the old one. External-provider-only accounts cannot
create a native credential through this endpoint.

The handler locks the credential and rechecks the session inside a transaction,
updates the salted scrypt hash and password-change timestamp, and revokes all
sessions belonging to that server-resolved user. Only after commit does it clear
the session cookie and send the browser to `/login`. No schema migration is needed.
Failure rolls back credential/session writes and returns sanitized messages.

Attempts are limited to 10 per user and 30 per source IP over 15 minutes using
the existing in-process limiter. This is not a distributed production rate limit.
An ambiguous network failure can occur after commit; the user should try logging
in with the new password rather than assuming the password stayed unchanged.

Each of the three password fields has an independent, accessible eye toggle.
Field-specific errors distinguish an incorrect current password, invalid new
password, and confirmation mismatch. Error responses use bounded known codes;
raw provider/database errors never render in the form. Inputs are retained on
validation, network, and server errors, including login/register failures. They
remain only in mounted component memory, never browser storage or logs, and are
cleared on successful submission/unmount. Leaving/reloading the page loses them.

Verification: `node --test test/password-routes.test.js test/password-settings.test.js test/account-routes.test.js`.
Tests use SQL doubles and local HTTP listeners, not a real database or provider.
Real deployed-database transaction behavior remains unverified. Browser interaction
was verified against `scripts/serve-password-ui-fixture.mjs` on loopback 5226:
confirmation mismatch and wrong-old-password responses preserve all fields,
each eye toggle affects only its field, and mocked success redirects to login.
The fixture imports no DB/provider/session services and changes no real password.
This feature does not implement forgotten-password recovery, email verification,
email changes, or any subscription functionality.
