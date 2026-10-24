# Workspace divisions and agents

Implemented 2026-10-24. Existing roster definitions remain reusable templates;
they are not automatically enrolled into customer workspaces. No existing jobs,
items, revisions, usage records, organizations or membership records are backfilled.

## Activation boundary

`005_workspace_team.sql` is an additive, explicit migration. It creates only
`workspace_divisions` and `workspace_agents`. It has NOT been applied or tested
against a real database in this implementation task. Use the existing migration
runbook with a verified local/non-production target, backup/restore evidence,
and disposable-database verification before applying it to development data.
Never run schema.sql or the retired one-shot 004 utility to activate this feature.
The 004 utility now refuses a manifest containing newer migrations BEFORE any DB
connection, since its generic runner would otherwise apply more than 004.

The migration validator recognizes 005 from migration history and checks its
columns, lifecycle enums, nullable archived slot, ordered indexes/uniqueness, and
composite division ownership foreign key. Offline tests do not prove MySQL DDL
execution, locking, rollback or migration recovery on a real server.

Until 005 is applied, team reads/writes and workspace agent chat fail closed with
a sanitized unavailable response. The office does not substitute the static roster
on error. Unchanged legacy records remain stored; they do not become customer agents.
Existing native authentication/session configuration and initDb are not changed.

## Entry points

- `/app/team` (Agent menu): add custom divisions or copy one template; add/edit
  employee name, role, instructions and server-approved default model tier.
- Onboarding confirmation: choose empty office, one template, or one custom division
  with an initial employee. Choice is stored in the same transaction as workspace
  creation. Repeated onboarding never overwrites an existing team's configuration.
- `/app/office`: tenant mode loads its own team from `/api/team`, using the existing
  Three.js room shell, furniture, characters, camera and animation code. Only
  selected rooms/employees are built. Pantry and the base floor remain. Empty
  divisions are supported. Names are inserted as text, never HTML.
- Chat resolves the active agent and model tier from the server-side workspace
  query. Static IDs, archived agents/divisions and foreign workspace IDs are denied.
  Custom instructions grant no tools, membership, data access or other privileges.

## Authorization and data retention

All API calls use the existing real-session tenant gate. Owner/admin can mutate;
members/viewers can list. Viewers still cannot chat. Platform-only roles have no
customer-content access. JSON mutation requests require the configured exact Origin.
Request bodies cannot select organization, workspace, user, permission or arbitrary
model IDs. Only the server's `leader` and `team` model choices are accepted.

Mutation transactions lock the active workspace row before counting or changing
configuration, serializing concurrent additions and archives. Capacity is currently
8 active rooms and 4 active employees per room to fit existing geometry, NOT an
approved subscription entitlement. Archived rooms release their unique nullable
slot. Agent/division IDs remain immutable and archives use UPDATE, never DELETE.
Archiving a division also archives its agents in the same transaction.

## Deliberately not included

Persistent/multi-thread chat, per-conversation model overrides, custom job templates,
dynamic task execution/review snapshots, balance deductions, subscription limits,
top-up/payment and price labels are separate work. Existing structured jobs and
review history still use their existing template definitions; they are not claimed
to run against custom agents. A custom agent currently supports text-only chat.
Model options display actual configured model names without unverified price or
quality claims. Archiving does not cancel a provider request already admitted.

Offline verification: `node --test test/workspace-team.test.js`,
`npm run test:onboarding`, full `node --test`, and `npm run build`. Three.js room
construction is tested without WebGL using fixture canvas, including empty,
custom and copied-template teams; this does not establish visual browser parity.
