# Workspace divisions and agents

Implemented 2026-10-24. Existing roster definitions remain reusable templates;
they are not automatically enrolled into customer workspaces. No existing jobs,
items, revisions, usage records, organizations or membership records are backfilled.

## Activation boundary

Office presentation now always renders all eight division room shells plus the
existing pantry. Unused rooms have a neutral "Ruangan kosong" sign and no agents,
desks, or template-specific props. Existing divisions retain their room and team;
archiving frees the room without removing its walls. Empty room navigation chips
focus the corresponding room, without creating any persisted division.

`shared/office-layout.js` also supports a locked-room presentation with a geometry
padlock for explicit capacity fixtures. No real subscription capacity exists yet:
the live office supplies no capacity and therefore does not show invented plan
locks. This helper is presentation only, never authorization. Before activating
subscription locks, resolve entitlements server-side and enforce division creation
under the existing workspace transaction lock, including an explicit downgrade
policy for already occupied rooms. Never infer allowances from browser input.
The existing four-agent-per-division limit is unchanged; no separate total-agent
subscription limit or real package names/prices are introduced.

`005_workspace_team.sql` is an additive, explicit migration. It creates only
`workspace_divisions` and `workspace_agents`. It was applied and verified locally
on 2026-10-24 (evidence below). For any other target, use the existing migration
runbook with a verified local/non-production target, backup/restore evidence,
and disposable-database verification before applying it to development data.
Never run schema.sql or the retired one-shot 004 utility to activate this feature.
The 004 utility now refuses a manifest containing newer migrations BEFORE any DB
connection, since its generic runner would otherwise apply more than 004.

The migration validator recognizes 005 from migration history and checks its
columns, lifecycle enums, nullable archived slot, ordered indexes/uniqueness, and
composite division ownership foreign key. Offline tests do not prove MySQL DDL
execution, locking, rollback or migration recovery on a real server.

On targets where 005 is not applied, team reads/writes and workspace agent chat fail closed with
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

## Local activation evidence — 2026-10-24

The owner explicitly requested application and testing. Target `virtual_office`
was identified as loopback 127.0.0.1:3306, MySQL 8.0.30, local PID 21220 at the time,
`C:/laragon/bin/mysql/mysql-8.0.30-winx64/bin/mysqld.exe`, with data directory
`C:/laragon/data/mysql-8/`. This is evidence for this run, not blanket permission
for another target or execution.

Executed with approval scoped to that child process:

```
node --input-type=module -e "process.env.LOCAL_TEAM_MIGRATION_APPROVED='1'; await import('./scripts/apply-local-team-migration.mjs');"
```

The operator utility uses the existing approval guard, migration lock, history and
checksum validation. It refuses an unexpected manifest or any source history other
than final 001–004; do not rerun it after 005 is applied.

- Fresh isolated database `vo_team_fresh_1792819701524`: applied 001 through 005;
  complete schema contract `valid: true`, `differences: []`; duplicate apply returned
  `[]`; a second migration-lock contender was denied.
- Twelve real SQL/loopback HTTP integration checks passed: empty initial team,
  real session requirement, forged scope/Origin rejection, copying one template,
  custom-agent create/edit, cross-workspace/organization denial, unique-slot and
  composite-tenant FK constraints, concurrent agent capacity, viewer denial,
  selected-model mock chat with SQL usage recording (11 input / 7 output), archive
  retention/slot reuse/chat denial, and session revocation.
- Failure rehearsal `vo_team_failure_1792819701524`: an intentionally failing,
  in-memory `006_isolated_failure_probe` was recorded as failed; rerun was refused.
  This probe is NOT a real migration, is not in the manifest, and never ran on
  development. The database/history is retained as test evidence.
- Backup `D:/VetendCode/database-backups/virtual-office-team-kntPYt/before-005.sql`,
  30,064 bytes, SHA-256
  `405ad706a625b5cf43cfd76c99060acda24ab9f23bcc424b28659afda8a5d921`.
- Restore `vo_team_restore_1792819701524` matched all 13 original tables, column
  definitions, ordered indexes, foreign keys/rules, table engines/collations,
  row counts and full-row content digests. Applying only 005 on this restore passed
  full schema validation and preserved existing table data/structure.
- Development then applied ONLY `005_workspace_team`. Full schema validation
  returned `valid: true`, `differences: []`; read-only status had no diagnostics
  and matching checksums. Both new team tables remained empty; no fixtures or
  automatic legacy enrollment were written to development.
- Migration 005 SHA-256:
  `03bd0765af5212ccbf7411c3275d4c9fd2ca64c091cc679d87c7f4709509c790`.
- Complete sanitized evidence:
  `D:/VetendCode/database-backups/virtual-office-team-kntPYt/verification.json`.

An earlier run stopped BEFORE development apply because the live application
updated only `sessions.last_seen_at`/`idle_expires_at`. Its backup/evidence and all
test databases remain preserved under `virtual-office-team-7IHxtN`. The cause was
verified read-only. The controlled subsequent run held `LOCK TABLES sessions READ`
on a separate local connection for about 3.6 seconds during backup/restore/apply,
using a fresh baseline snapshot. The lock was released, no process was terminated,
authentication was not disabled, and all preexisting rows matched the pre-backup
snapshot after apply (excluding the intentional new migration-history record).

No real AI/provider call was made, no startup schema execution was invoked, no
development account was provisioned and no legacy ownership was transferred.
Keep backups outside Git: they contain private authentication/application data.

Final regression: `node --test --test-reporter=spec` passed 186/186 tests, with
zero failures or skipped tests; `npm run build` passed. This includes two offline
operator guards proving missing approval and production mode refuse before any
database access. A live browser/real-provider custom-agent chat was not exercised.
