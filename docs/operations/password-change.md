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

Verification: `node --test test/password-routes.test.js test/account-routes.test.js`.
Tests use SQL doubles and local HTTP listeners, not a real database or provider.
Real-database transaction behavior and browser interaction remain unverified.
This feature does not implement forgotten-password recovery, email verification,
email changes, or any subscription functionality.
