# Workspace office chat

The embedded React office uses `/api/office/chat/context` and
`POST /api/office/chat`, not the gated legacy `/api/chat` endpoint.
Both new endpoints resolve the existing server session and active workspace
membership through the tenant gate. Owners, admins and members may chat;
viewers and platform-only administrators cannot.

The context returns an opaque, process-local HMAC binding for the server session,
user, organization and workspace. It is not a login token and cannot replace
session validation. The POST must carry this binding; changed contexts return
409. Unknown request fields, including client-supplied tenant IDs, are rejected.
Writes also require JSON and the exact `APP_ORIGIN` (local default
`http://localhost:5173`; no implicit production default). Existing rate and
daily limits apply before AI invocation.

Conversation text is held only in the office tab's memory. It is not loaded
from legacy localStorage, stored in a database, or shared with other members.
Opening/sending chat rechecks scope; a changed session/workspace resets memory
and refuses to resend old history. Reloading the page clears conversation.
Server restart invalidates bindings. Multi-instance deployment would need a
shared signing strategy or sticky routing and separate review.

Only the last 19 alternating messages are sent, with at most 4000 characters
per user message and 16000 per assistant message. The service forwards this
explicit text to the configured AI provider; it does not look up clients,
jobs, items, revisions or other customer content, execute tools, or save job
outputs. Use Perintah and Board for persistent work. No automatic demo reply
is returned when the AI client is unavailable. Provider failures are sanitized.

Verification on 2026-10-23: `node --test --test-reporter=spec` passed 145/145
offline tests; `npm run build` passed. Tests use real HTTP handlers with mock
database connections/provider streams and exercise the browser chat client.
No live database, external AI provider or browser UI login was used for this
verification. Existing migration files, schema, data and startup initialization
are unchanged. Real-provider responses and browser interaction remain unverified.

Focused regression command: `npm run test:office-chat`.
