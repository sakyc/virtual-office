# Private, persistent office conversations

Implemented 2026-10-24. `/app/office` exposes Chat Baru, a conversation selector,
title editing, and archive. History is private to the authenticated user AND the
active organization/workspace, and is tied to one workspace agent. Another member,
including an organization owner, cannot read someone else's conversation through
these endpoints. There is no shared-access-code fallback on customer endpoints.

## Activation

`006_chat_history` adds only `chat_conversations` and `chat_messages`. It does not
change or import legacy browser chat, backfill data, or run at startup. Existing
001–005 sources remain unchanged. The application wires a SQL history store
explicitly; a missing 006 fails closed with a sanitized unavailable response,
never a silent switch back to temporary chat.

006 has been tested on a fresh, isolated local schema; it has NOT been applied to
the development database in this task. Before local activation follow
`migration-runbook.md`: verify the local target and current immutable history,
preserve a backup with a verified restore, then use the explicit migration CLI.
Do not run `server/schema.sql`, the old 004/005 one-shot operators, or startup to
apply 006. `npm run migrate:validate -- --confirm-non-production` now validates
the chat contract when history records 006 as applied. Never connect to production.

## Persistence and failure semantics

- Session and active membership are resolved by the existing tenant gate on EVERY
  history/chat request. Viewer/platform-only users cannot use these endpoints.
- New messages accept only conversation ID, agent ID, new user text, and the
  session/workspace scope binding. Client-supplied history, identity and tenant
  claims are rejected. Before calling AI the server loads only that conversation's
  last 18 completed messages, then appends the new user message (max 4000 chars).
- A transaction locks the owned conversation row and records a pending user turn
  BEFORE AI invocation. Two requests cannot reserve the same conversation at once.
  A five-minute lease recovers abandoned turns; generation is aborted at four
  minutes. Old/replaced/expired tokens cannot finalize a newer turn.
- Successful replies finalize the user+assistant pair atomically BEFORE SSE done.
  Provider failure or disconnection marks the pending user attempt failed. Failed
  and pending attempts are retained but are not returned as completed history and
  are never sent as prior context. SQL outages fail closed; no automatic retries.
  If finalization succeeds but the final network acknowledgement is lost, reload
  history before sending again. This is not an exactly-once provider protocol.
- History is paginated (50 conversations / 100 messages); older pages have explicit
  controls. Message ordering uses the numeric table ID, not its JSON string alias.
  Only the most recent completed turns are sent to AI, not the entire transcript.
- Archive is a soft status change, not deletion. Agents/divisions that are archived
  cannot receive chat or expose old history through this agent-specific UI. No
  retention/export/deletion or archived-history browser is implemented yet.
- Reads work without a provider key; sending does not. A request already authorized
  and streaming is aborted when its connection closes; session revocation is checked
  again on subsequent requests, not polled continuously during generation.
- Browser memory is cleared on session/workspace changes and page exit. Customer
  history is never stored in localStorage. Old shared-office behavior is untouched.
- Stored content is plaintext application data. Protect database/backups, apply
  access controls, and decide retention policy before public launch. Content and
  provider secrets are not emitted in operational logs.

## Verification

Offline: `npm run test:chat-history`, full `node --test --test-reporter=spec`, and
`npm run build` (no database/provider needed).

Explicit isolated MySQL verification in PowerShell:

```
node --input-type=module -e "process.env.CHAT_HISTORY_LOCAL_TEST='1'; await import('./scripts/verify-chat-history-local.mjs');"
```

The verifier refuses production mode, non-loopback targets, unexpected ports or
the absence of the known local Laragon MySQL executable. It checks the server data
directory, creates a unique `vo_chat_test_*` database, applies 001–006 there only,
and uses synthetic users/sessions with a mock provider. It never opens the configured
development database, calls a paid provider, deletes schemas, or logs credentials.

Successful run: `vo_chat_test_1792822332604_9592ba`, nine integration checks passed,
full schema `valid: true`, `differences: []`. Covered checksums, duplicate apply,
actual MySQL row-lock concurrency, store recreation, cross-user/workspace/org and
agent denial, stale lease recovery, unique/FK constraints, paginated messages,
server-only model context, authenticated HTTP/SSE persistence, failed replies,
rename/archive/CSRF/forged IDs, viewer denial and session revocation.

Two earlier isolated runs exposed a pagination ordering defect (string alias sort);
the numeric ordering fix passed the subsequent run. Their schemas remain preserved
as evidence: `vo_chat_test_1792822290588_bd1f87` and
`vo_chat_test_1792822315201_4bd5ec`. No development database was opened in any run.
Real browser appearance and real-provider generation remain unverified this task.

Regression before handoff: 202/202 tests passed under
`node --test --test-reporter=spec`; `npm run build` passed. No dependencies added.
