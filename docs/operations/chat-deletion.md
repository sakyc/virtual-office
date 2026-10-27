# Chat deletion

The office composer contains the model selector. Conversation history is a
collapsed disclosure near the composer, not an always-expanded header section.
Its selected-conversation controls provide rename and **Hapus chat**.

Deletion requires the browser's explicit confirmation. Cancel makes no request.
`DELETE /api/office/conversations/:id` requires the existing validated session,
server-resolved tenant membership and chat permission, same-origin JSON, and
exactly `{ "confirmDelete": true }`. Client identity fields and query parameters
are rejected. The existing organization/workspace/user ownership check and active
agent check run under a transaction and conversation row lock. Live pending turns
return 409. Child messages are deleted before the parent to respect migration
006's `ON DELETE RESTRICT` constraint; failure rolls back both operations.

Deletion permanently removes the conversation and its messages from the active
application database. It does not erase independently retained SQL backups or AI
usage/accounting records. It cannot be undone through the application. A repeated
delete or a deleted conversation read/send returns 404. No bulk deletion runs on
deployment, and no existing archived chats are purged or converted automatically.
The previous archive API remains compatible, but the office UI no longer offers
archive. Previously archived records stay in the database; no archive browser is
provided by this change.

No migration or new dependency is needed. Automated tests use mocks only; do not
test permanent deletion against an important conversation. Restart the API and
refresh the office to load the updated route and controls.
