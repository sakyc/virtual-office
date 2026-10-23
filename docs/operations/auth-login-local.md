# Local login and registration

The React routes `/login` and `/register` share the landing page typography,
brand mark and palette. Credentials are entered only in Auth0 Universal Login.
Registration uses `/auth/login?screen_hint=signup`; enable database-connection
signups in Auth0 to offer account registration.

With the existing Vite proxy, configure the Auth0 Regular Web Application with
Allowed Callback URLs `http://localhost:5173/auth/callback` and the matching
`AUTH0_CALLBACK_URL`. Use `http://localhost:5173` for local application origins.
Do not mix `localhost` and `127.0.0.1` across the login transaction.
Use the existing `.env.example` Auth0 variables, supply owner-managed values
locally, set `AUTH0_ENABLED=1`, and restart the backend. Keep secrets out of Git.

After the callback issues the existing opaque session cookie, it redirects to
`/login/complete`. This React route loads `/auth/me`: no memberships leads to
`/onboarding`, an active workspace leads to `/app`, and available workspaces
without an active selection produce a workspace picker. Selection posts to the
existing membership-validated `/auth/active-workspace` endpoint. These browser
decisions do not authorize API access; the backend session and tenant gates do.

`GET /auth/status` exposes only whether authentication is enabled, with
`Cache-Control: no-store`. It does not probe Auth0 or a database and does not
certify that provider credentials are valid. Disabled or unavailable login is
shown with a retry action and no session is fabricated.

Verify real login, signup, callback, workspace selection and logout locally
after configuring Auth0 and an isolated migrated database. Automated tests use
fixtures only; they do not prove real-provider login works.
