# Virtual Office - Current State Audit

**Audit date:** 2026-10-21  
**Method:** Static, read-only source inspection. `PRODUCT_SPEC.md` was read as target direction, not evidence of implementation.  
**Not performed:** Application run, test run, database connection, migration, dependency installation, deployment, or inspection of `.env` values.

## Evidence Labels

- **[Verified]** Directly observed in repository source or SQL files.
- **[Not verified]** Cannot be established from inspected source alone.
- **[Recommendation / inference]** Technical conclusion or next action; not claimed as existing behavior.

## Executive Summary

**[Verified]** Current application is a small, single shared Virtual Office for a digital-agency-style AI team. It is a Vite vanilla-JavaScript frontend with a Three.js isometric office, paired with an Express API and MySQL/MariaDB persistence. It has 23 hard-coded agents and 26 hard-coded job templates in `shared/roster.js` and `shared/jobs.js`.

**[Verified]** Main usable capabilities are: streamed single-agent chat, structured job generation, client briefs, an item board, approval/rejection/revision, output history, and browser-only export/media tools. Anthropic is the only implemented AI provider. Job output token counts are stored per job; no durable user identity, organization, workspace, role, entitlement, subscription, BYOK, workflow, or usage-ledger domain exists.

**[Verified]** Access control is one optional shared `x-access-code`, not authentication or authorization. All API callers who know it can list, create, alter, restore, or permanently delete all shared clients, jobs, items, and revisions. Database tables have no tenant/user/workspace keys. This is incompatible with public multi-tenant SaaS requirements in `PRODUCT_SPEC.md`.

**[Recommendation / inference]** Preserve Express, MySQL/MariaDB, and Three.js for an incremental migration. First implementation task should establish tenant-aware identity and backend authorization before exposing or expanding management functionality; otherwise every later resource risks inheriting global-data access.

## Actual Structure and Architecture

### Frontend

**[Verified]** Frontend uses Vite and native ES modules, not React or TypeScript: `package.json`, `vite.config.js`, `src/main.js`. `vite.config.js` proxies `/api` to local Express in development; production Express optionally serves `dist` in `server/index.js`.

**[Verified]** Main UI shell is a full-screen 3D office with division navigation, chat panel, job form panel, and board modal: `index.html`, `src/main.js:createStage`, `src/main.js:createPanel`, `src/main.js:createJobsUI`, `src/main.js:createBoard`.

**[Verified]** Available UI experiences:

- 3D office navigation, zoom, pan, hover, character selection: `src/stage.js:createStage`.
- Per-agent chat with local browser history and streamed replies: `src/panel.js:createPanel`, `src/chat.js:streamChat`.
- Client selector/create form and agent-specific static job forms/history: `src/jobs-ui.js:createJobsUI`.
- Board filtering, search, detail, checklist updates, approve/reject/revise/delete/restore, child-job continuation: `src/board.js:createBoard`.
- Browser-local social-image/video rendering and ZIP export for eligible output types: `src/studio.js:studioSection`.

**[Verified]** Browser stores chat histories, selected client ID, access code, and studio preferences in `localStorage`: `src/chat.js`, `src/jobs-ui.js`, `src/studio.js`. No server-side user profile/preferences are present.

**[Not verified]** No automated frontend tests, lint scripts, type checks, accessibility tests, or end-to-end tests are declared in `package.json`. This audit did not run build or test commands.

### Three.js Virtual Office

**[Verified]** Scene uses `THREE.WebGLRenderer`, `THREE.Scene`, orthographic isometric camera, lighting, raycasting, pointer drag/pinch/wheel navigation, and an animation loop: `src/stage.js:createStage`.

**[Verified]** `src/office.js:buildOffice` generates rooms from hard-coded divisions and agents in `shared/roster.js`; `src/character.js:createCharacter` creates reusable low-poly worker avatars with idle/working/done animations and selectable hit boxes.

**[Verified]** Chat and submitted job UI drive temporary visual worker status through `src/main.js:setStatus`. Chat uses `working` while awaiting stream and `done` briefly. Job UI sets `working` on submission and polls `/jobs/:id` every 2.5 seconds: `src/jobs-ui.js:poll`.

**[Verified]** 3D status is not authoritative, persisted, server-pushed, or tied to a worker execution record. On reload it resets to idle; job status is instead queried by frontend polling. Board badges are also polled: `src/main.js:refreshBadges`.

**[Recommendation / inference]** Three.js is fit to retain as a presentation module. Future worker/activity projection should consume tenant-authorized worker and execution read models, not direct static roster data or client-side polling alone.

### Backend Express

**[Verified]** `server/index.js` configures JSON parsing (1 MB), optional access-code middleware, per-IP in-memory rate limit, in-memory daily request cap, chat endpoint, API router, optional static `dist` serving, and database initialization.

**[Verified]** `server/api.js:createApiRouter` applies `requireAccess`, then rejects database-backed routes while `dbState.ready` is false. The `ah` wrapper maps expected errors to JSON and logs unexpected errors without returning raw stack traces: `server/api.js:ah`.

**[Verified]** Input controls include message role/content limits (`server/index.js:cleanMessages`), job-form allowlists/ranges/lengths (`server/api.js:cleanParams`), client limits, item revision/rejection limits, query limits, and parameterized SQL via `mysql2`: `server/api.js`.

**[Verified]** There is no login/session/JWT/OAuth middleware, no user/role context, no object-ownership policy, no entitlement middleware, no audit middleware, no centralized schema validation library, and no API versioning.

## Endpoint Map and Data Flow

| Endpoint | Verified behavior | Relevant source |
| --- | --- | --- |
| `GET /api/config` | Returns demo/access-code-needed flags; public. | `server/index.js` |
| `GET /api/verify` | Validates optional shared access code. | `server/index.js:requireAccess` |
| `POST /api/chat` | Streams Anthropic or demo chat SSE for static `agentId`; not persisted. | `server/index.js`, `src/chat.js:streamChat` |
| `GET/POST /api/clients` | Lists all clients or creates one shared client/brief. | `server/api.js` |
| `POST /api/jobs` | Validates static job definition, inserts a `generating` job, replies `202`, starts in-process generation. | `server/api.js:cleanParams`, `server/api.js:processJob` |
| `GET /api/jobs`, `GET /api/jobs/:id` | Lists agent-filtered or ID-selected jobs; no owner scope. | `server/api.js` |
| `GET /api/items/counts` | Returns draft/revising counts by static agent. | `server/api.js` |
| `GET /api/items`, `GET /api/items/:id` | Searches/lists global board items and fetches detail, revisions, parent/children. | `server/api.js:loadItem` |
| `POST /api/items/:id/revise` | Sets item `revising`, replies `202`, starts in-process AI revision. | `server/api.js:reviseItem` |
| `POST /api/items/:id/approve`, `/reject`, `/check`, `/restore` | Mutates global item status/checklist/deletion state. | `server/api.js` |
| `DELETE /api/items/:id` | Soft-deletes; `?permanent=1` permanently deletes an already soft-deleted item. | `server/api.js` |

**[Verified]** Job execution flow: UI sends static job ID/parameters -> `POST /api/jobs` inserts row -> `processJob` calls `generate` -> runner asks Anthropic to call `submit_items` -> transaction inserts one or more items and marks job done -> UI polls job and board. Paths: `src/jobs-ui.js`, `server/api.js:processJob`, `server/runner.js:generate`.

**[Verified]** Revision flow: board submits reason -> API changes item to `revising` -> background `reviseItem` calls runner -> transaction snapshots old content into `revisions`, updates item, and accumulates job tokens. Paths: `src/board.js`, `server/api.js:reviseItem`, `server/runner.js:revise`.

**[Verified]** Job execution is in the Express process and is not queue-backed. `server/db.js:initDb` marks unfinished `generating` jobs failed and `revising` items back to draft after a server restart. No retry/cancel/concurrency-control API exists.

## Database Inventory

**[Verified]** Runtime schema bootstrap reads `server/schema.sql` and executes `CREATE TABLE IF NOT EXISTS` statements at server start: `server/db.js:initDb`. A separate data-bearing SQL dump exists at `database/virtual_office.sql`; it contains four same-named tables plus sample/historical data.

| Table | Purpose and relationships | Missing for SaaS target |
| --- | --- | --- |
| `clients` | Shared client name/brief. Referenced by `jobs.client_id` and `items.client_id`. | Organization/workspace owner, creator, access policy, audit metadata. |
| `jobs` | Job request, static agent/job type, JSON params, lifecycle, model, token totals. FK to client only. | Tenant/workspace/user, worker config version, queue/run attempt, provider credential source, cost/usage ledger. |
| `items` | Generated board output; parent/job/client links, JSON content, review lifecycle, soft delete. FKs to jobs/items/clients. | Tenant/workspace/access controls, immutable output/run references, retention policy. |
| `revisions` | Item snapshot and revision reason. FK to item. | Actor identity, authorization/audit event, tenant scope. |

**[Verified]** Existing lifecycle states are limited: job `generating|done|failed`; item `draft|revising|approved|rejected`, plus soft deletion. See `server/schema.sql`.

**[Verified]** No migrations/version table or migration framework exists. Runtime schema creation cannot evolve existing columns/constraints because it only uses `CREATE TABLE IF NOT EXISTS`: `server/db.js:initDb`, `server/schema.sql`.

**[Verified]** `database/virtual_office.sql` is a database export with data, not evidence that the active database contains that exact data or schema. Active DB state was not queried.

## Actual Feature Inventory

### Present

- **[Verified]** Static agent roster, visual divisions, role/focus/prompt profiles: `shared/roster.js`, `server/prompts.js:buildSystemPrompt`.
- **[Verified]** Static form-driven job templates/specification and output validation: `shared/jobs.js`, `server/jobSpecs.js`, `server/runner.js:sanitizeItem`.
- **[Verified]** Single-provider Anthropic chat, structured tool-based job generation, revision, demo fallback, static leader/team model selection: `server/index.js`, `server/runner.js`.
- **[Verified]** Client briefs passed as prompt context; parent board items can feed downstream static jobs: `server/api.js:processJob`, `server/runner.js:context`.
- **[Verified]** Token input/output totals per job and increments for revision: `server/api.js:processJob`, `server/api.js:reviseItem`.
- **[Verified]** Approval/rejection/checklist/revision/deletion/recovery board actions and revision history: `server/api.js`, `src/board.js`.

### Absent or Not Demonstrated

- **[Verified absent]** User accounts, organizations, workspaces, role/permission tables, membership, and resource authorization.
- **[Verified absent]** Worker creation/configuration UI/API/storage; roster and prompts are source-controlled static data.
- **[Verified absent]** User-defined jobs/forms; job definitions are static source data.
- **[Verified absent]** Workflow definitions/runs/orchestration; parent-item chaining is a UI convenience, not a persisted multi-step workflow engine.
- **[Verified absent]** Plan, subscription, entitlement, quota, overage, billing, invoice, or billing-provider logic.
- **[Verified absent]** BYOK storage/onboarding/revocation, credential encryption, or provider abstraction. Only Anthropic SDK/client is implemented.
- **[Verified absent]** Usage ledger/audit events; token columns do not associate usage with a user/org/workspace, cost, credential, or auditable event.
- **[Not verified]** Production reverse proxy, TLS, database user privileges, secret rotation, backups, monitoring, and deployment controls.

## Gaps Against `PRODUCT_SPEC.md`

| Required direction | Actual evidence | Gap |
| --- | --- | --- |
| One web app: dashboard + 3D office, shared data | One Vite app includes 3D/chat/jobs/board, and board/job APIs share DB. | Partial base. No management dashboard for workspace/admin/usage/subscription; 3D activity is client-local. |
| Multi-tenant organizations/workspaces | Four global tables lack org/workspace IDs; endpoints issue global queries. | Critical missing foundation. |
| Backend RBAC | Optional shared access code only. | Critical missing authentication/authorization. |
| Worker templates and controlled execution | Static roster/jobs and server-side Anthropic execution exist. | Useful seed, but no template lifecycle, entitlement gate, configuration versioning, or worker records. |
| Jobs with lifecycle/output/history | Jobs/items/revisions and limited statuses exist. | Partial base; no initiator, tenant scope, durable queue/retry/cancel/concurrency policy. |
| 3D worker activity from authoritative backend | UI status comes from local UI actions/polling. | Missing shared, permission-aware activity model and real-time policy. |
| Configurable customization | Source-code edits define workers, prompts, and forms. | Missing safe declarative configuration/validation/audit. |
| Workflows | Static parent-item continuation only. | Missing workflow model, orchestration, state, failure policy. |
| Subscription/entitlements/usage | Global in-memory daily cap and job token counters exist. | Missing product-level plans, scoped quotas, durable/auditable usage and billing behavior. |
| Platform key + BYOK provider layer | One `ANTHROPIC_API_KEY` server environment variable. | Missing provider-neutral abstraction and BYOK secret lifecycle. |

## Security and Technical Risks Based on Code Evidence

1. **Critical - Global read/write/delete access.** `server/api.js:createApiRouter` gates all DB routes only with `requireAccess`; every resource query is unscoped. A caller with optional shared code can change or permanently delete any data via item endpoints. This violates mandatory backend tenant/object authorization.
2. **Critical - Access control may be disabled.** `server/index.js:requireAccess` calls `next()` when `ACCESS_CODE` is blank. `.env.example` calls the setting mandatory for public use, but code does not fail closed. Production configuration was not inspected.
3. **High - Shared access code is not identity.** No user accountability, role separation, revocation per person, membership lifecycle, or audit actor exists. Code is retained in browser `localStorage`: `src/chat.js:setCode`.
4. **High - Work execution is in-process and non-durable.** `server/api.js:processJob` and `reviseItem` run after response in Express process. `server/db.js:initDb` marks interrupted work failed/reset on restart. Horizontal scaling, restarts, long execution, retry semantics, and concurrency limits are unsafe/undefined.
5. **High - Usage limits are process-local and global.** `server/index.js:rateLimit` and `dailyCap` use memory, apply by IP/global day rather than tenant/plan, increment before provider completion, and reset on restart. They cannot serve auditable quotas or predictable billing.
6. **Medium - Schema evolution is unsafe for SaaS growth.** Startup DDL only creates absent tables; no migration history/evolution exists: `server/db.js:initDb`. Database creation at startup also asks runtime credentials for `CREATE DATABASE`, broader than least privilege.
7. **Medium - AI output/data governance is absent.** Prompt context includes client briefs and board content (`server/runner.js:context`); no tenant boundary, data classification, redaction, retention, provider policy, or consent controls are implemented.
8. **Medium - Single provider/credential model.** `server/index.js` constructs one Anthropic client from environment. No BYOK isolation, provider allowlist, key encryption/revocation, model policy, or per-tenant usage attribution exists.
9. **Medium - No verified test safety net.** `package.json` has no test/lint/type-check scripts. Behavior around authorization, input validation, state transitions, and database migration lacks demonstrated automated coverage.
10. **Low/medium - Visualization truth divergence.** `src/main.js:setStatus` mutates client-only avatar state; refresh/reconnect creates inconsistent 3D status compared with persisted jobs. This is product-risk, not direct access-control bypass today.

## Decisions That Can Be Retained

- **[Recommendation / inference] Keep Express initially.** Current routing, middleware, error wrapper, parameterized SQL, and API separation are small enough to harden incrementally. NestJS migration gives little value before domain/security boundaries are defined.
- **[Recommendation / inference] Keep MySQL/MariaDB initially.** Existing relational `jobs -> items -> revisions` structure and transactions fit execution history. Add explicit migrations and tenant keys; no source evidence requires database replacement.
- **[Recommendation / inference] Keep Three.js as isolated 3D module.** Existing scene/interaction code is substantial and separate from API/database code. Replace static roster/status inputs with shared domain read models over time.
- **[Recommendation / inference] Reuse structured generation pattern.** Anthropic tool output plus `sanitizeItem`, job specs, and DB transactions provide a workable starting point for controlled template execution. Generalize only after configuration/authorization design.
- **[Recommendation / inference] Reuse board output/revision concept.** `items` and `revisions` show a useful review loop, but must become tenant-scoped and actor-audited before public use.

## Decisions Requiring Further Evaluation

- **[Not verified]** Actual production topology, proxy trust configuration, TLS/CORS/CSP headers, logging/observability, DB privileges, backup/restore, and secret-management controls.
- **[Recommendation / inference]** Define identity provider/session strategy and exact RBAC matrix before changing endpoints.
- **[Recommendation / inference]** Decide organization/workspace relationship, client ownership/sharing, execution retention, and whether every item belongs to one workspace.
- **[Recommendation / inference]** Select queue/worker runtime and execution idempotency/cancel/retry/concurrency semantics before scaling jobs.
- **[Recommendation / inference]** Define provider abstraction, supported providers/models, BYOK encryption and key lifecycle, data handling, and metering/cost basis before implementing subscription UX.
- **[Recommendation / inference]** Evaluate React + TypeScript only after core domain/API boundaries are stabilized. Current UI works as native JS but dashboard growth likely benefits from component/state/type discipline.

## Recommended Implementation Sequence

1. Define tenant identity, organization/workspace membership, fixed RBAC matrix, and authorization policy; add migration system and tenant-aware schema.
2. Implement authentication/session middleware and centralized backend authorization; migrate existing clients/jobs/items/revisions into explicit tenant/workspace scope with a safe data migration plan.
3. Separate execution dispatch from HTTP process with durable job-run records and queue/worker semantics; preserve current output/revision behavior behind a domain service.
4. Create provider/credential abstraction, platform-key policy, encrypted BYOK lifecycle, model allowlists, and durable usage ledger.
5. Add worker templates/configuration versions and user-defined controlled job forms; replace hard-coded source configuration progressively.
6. Build management dashboard modules for members, workspace settings, workers/jobs/workflows, outputs, usage, and subscriptions with permission-aware APIs.
7. Model workflows and orchestration after job-run semantics are stable.
8. Connect Three.js worker/activity display to authorized execution/activity data; add real-time transport only after activity/read-model requirements are agreed.
9. Add unit/integration/e2e coverage, security tests, operational monitoring, and staged migration/rollout controls throughout.

## First Implementation Task (Do Not Implement Yet)

**Task:** Establish multi-tenant identity and backend authorization foundation: introduce explicit organizations, workspaces, users/memberships, fixed initial roles, and an authorization middleware/service; scope all existing client/job/item/revision reads and writes to authorized workspace context.

**Reason:** This removes current global-object exposure and supplies required ownership context for every later capability: workers, workflows, usage, subscriptions, BYOK, dashboard, and 3D activity.

**Dependencies:** Product-approved role/permission matrix; organization/workspace ownership and sharing rules; chosen authentication/session provider; migration strategy for existing unscoped rows; test database environment.

**Risks:** Incorrect migration can orphan or disclose current records; authorization omissions can leave IDOR paths; all current frontend API calls need authenticated workspace context; existing anonymous single-office UX will change.

**Acceptance criteria:**

- Every protected API request has verified user identity and selected/derived authorized workspace context.
- Server rejects unauthenticated, cross-organization, cross-workspace, and insufficient-role access for every existing client/job/item/revision endpoint.
- Database has migration-managed organization/workspace/membership ownership relations and tenant-scoped indexes/foreign keys as approved.
- Existing data receives documented ownership treatment or is explicitly excluded from migration.
- API/integration tests cover at least allowed and denied access for each protected resource/action; test results are reported only after tests are actually run.
- No secret/API key is returned to browser, and no UI-only permission check is relied on for enforcement.

## Audit Integrity

**[Verified]** This audit created only `CURRENT_STATE_AUDIT.md` in workspace. No application source, dependency manifest, database schema/data file, migration, or deployment file was modified by this audit. A SHA-256 inventory of 29 files under `src`, `server`, `shared`, and `database` was captured after inspection; no runtime/test/migration command was executed.
