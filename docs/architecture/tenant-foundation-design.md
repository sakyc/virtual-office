# Virtual Office Multi-Tenant Foundation Design

**Status:** Decision and implementation design; no implementation authorized.  
**Scope:** First SaaS foundation milestone: identity, organization/workspace tenancy, authorization, sessions, legacy-data isolation, and migration approach.  
**Out of scope:** Billing, BYOK, dynamic workers, workflow builder, React migration, durable job queue, and NestJS migration.

## 1. Evidence and Status Rules

This design uses `PRODUCT_SPEC.md`, `CURRENT_STATE_AUDIT.md`, and approved policies POL-001 through POL-005. It does not assert source-code capabilities beyond the audit evidence.

| Status | Meaning |
| --- | --- |
| `Approved` | Product decision explicitly established by policy. |
| `Proposed` | Technical recommendation; not yet approved. |
| `Pending Approval` | A required decision still needs human approval. |
| `Not Implemented` | Capability absent from current source code. |

## 2. Current-State Boundary

### Verified Current State

- `server/index.js` and `server/api.js` provide Express APIs with optional shared `x-access-code`, not user identity or role authorization.
- `server/schema.sql` defines only `clients`, `jobs`, `items`, and `revisions`; none has organization, workspace, user, or membership ownership.
- Static agents/jobs live in `shared/roster.js` and `shared/jobs.js`.
- Three.js 3D office is client-rendered by `src/stage.js` and `src/office.js`; visual worker state is currently client-local.

### Not Implemented

- User accounts, OIDC integration, sessions, organization/workspace records, memberships, RBAC, tenant-scoped queries, audit log, support-access grants, and versioned database migrations.
- Billing, BYOK, dynamic workers, workflow builder, durable execution queue, React migration, and NestJS migration.

## 3. Product Decisions

### 3.1 Approved Product Direction

- `Approved` - Virtual Office is a multi-tenant SaaS. Backend enforces isolation using organization, workspace, membership, and permission context.
- `Approved` - One web application contains permission-aware dashboard and Three.js Virtual Office 3D; both use shared backend/domain data.
- `Approved` - Express, MySQL/MariaDB, and Three.js remain during incremental migration.
- `Approved` - Authentication uses a managed OpenID Connect (OIDC) provider. Provider choice, issuer configuration, MFA policy, and integration details remain unresolved.
- `Approved` - Session baseline: absolute lifetime 24 hours; idle timeout 8 hours; session expires at first reached boundary; activity never extends absolute lifetime.
- `Approved` - All unowned legacy data is quarantined in an internal organization and dedicated workspace. It is never automatically shared with new customers.
- `Approved` - New organization creation also creates exactly one active default workspace; operation must be atomic/idempotent and must not leave a usable organization without active workspace.
- `Approved` - Customer-data support access is temporary, approved, scoped, recorded, automatically expires, revocable, and separate from platform-admin status.

### 3.2 Explicitly Out of Scope

- `Approved` - Do not design or implement billing, BYOK, dynamic workers, workflow builder, durable job queue, React migration, or NestJS migration in this milestone except recording a direct dependency.

## 4. Decision Register

| ID | Decision | Rationale | Trade-off | Status | Required approver |
| --- | --- | --- | --- | --- | --- |
| DEC-001 | Use `Organization -> Workspace` hierarchy. | Organization is tenant/commercial boundary; workspace is operational/data boundary. | Adds two scopes to every protected request. | `Approved` | Product policy |
| DEC-002 | New organization gets one default workspace atomically and idempotently. | New tenant is immediately usable; no partially provisioned tenant. | Requires transaction/idempotency design. | `Approved` | Product policy |
| DEC-003 | Use managed OIDC for authentication. | Avoid custom password/identity lifecycle. | Provider dependency and integration work. | `Approved` | Product policy |
| DEC-004 | Use 24-hour absolute and 8-hour idle session limits. | Baseline limits user exposure. | Re-login frequency. | `Approved` | Product policy |
| DEC-005 | Quarantine legacy unowned data internally. | Prevent accidental customer disclosure while preserving relationships. | Legacy data is inaccessible to customers until disposition approved. | `Approved` | Product policy |
| DEC-006 | Platform admin has no automatic customer-data access. | Separates platform operation from customer privacy. | Support workflow needs separate grant process. | `Approved` | Product policy |
| DEC-007 | Customer support access requires approved, scoped, temporary audited grant. | Enforces least privilege and traceability. | More operational process. | `Approved` | Product policy |
| DEC-008 | Add `users`, organizations, workspaces, memberships, sessions, platform-admin, and support-grant data models. | Required durable identity and authorization context. | Schema/migration complexity. | `Proposed` | Engineering + security |
| DEC-009 | Use opaque server-side sessions in secure cookies after OIDC authentication. | Enables revocation and avoids browser token storage. | Requires session store and CSRF protection. | `Proposed` | Engineering + security |
| DEC-010 | Owner is organization-scoped; owners receive effective admin rights in every organization workspace. | Organization owners must manage all workspaces without duplicate grants. | Authorization resolver is more complex. | `Proposed` | Product + security |
| DEC-011 | Fixed initial roles: `owner`, `admin`, `member`, `viewer`; no custom roles. | Lowest safe RBAC surface for milestone one. | Less flexibility initially. | `Proposed` | Product |
| DEC-012 | Add ownership columns to current resource tables and scope every query by workspace. | Removes current global-object exposure and IDOR risk. | Existing APIs/frontends must migrate. | `Proposed` | Engineering + security |
| DEC-013 | Use versioned expand-contract database migrations; retire startup schema mutation after baseline. | Repeatable deployment and rollback. | Migration tooling/process required. | `Proposed` | Engineering + operations |
| DEC-014 | Keep old shared-code API only as temporary feature-flagged compatibility path. | Allows staged frontend cutover. | Legacy path is security risk; short lifetime required. | `Proposed` | Security + operations |
| DEC-015 | Compare managed OIDC providers before selection; issuer/MFA details remain open. | Required before auth implementation. | Vendor, price, and operational lock-in. | `Pending Approval` | Product + security + operations |
| DEC-016 | Default workspace is `Main workspace` with slug `main`; unique per organization. | Predictable, idempotent tenant provisioning. | Generic initial name. | `Approved` | Project owner |
| DEC-017 | Owners create/archive workspaces; final active workspace cannot be archived; custom roles and cross-workspace sharing deferred. | Simple safe governance boundary. | Less flexibility initially. | `Approved` | Project owner |
| DEC-018 | Support access is requested, dual-approved, scoped, four-hour maximum, audited, expiring, and revocable; emergency access deferred. | Customer privacy and accountable support. | Slower escalation. | `Approved` | Project owner |
| DEC-019 | Legacy data remains quarantined; retention/disposition not selected. | Avoid unapproved deletion/transfer. | Internal storage/governance cost. | `Pending Approval` | Product + legal + data owner |
| DEC-020 | Shared-code retirement requires authenticated tenant API, tests, monitoring, 14-day observation, and final Security/Operations approval. | Removes unsafe global access safely. | Longer cutover. | `Approved` | Project owner |

## 5. Tenant and Ownership Model

### 5.1 Hierarchy

```text
User
 ├─ platform_admins                         Platform authority only
 └─ organization_memberships
     └─ Organization
         └─ Workspaces
             └─ workspace_memberships
                 ├─ Clients
                 ├─ Jobs
                 │   └─ Items
                 │       └─ Revisions
                 └─ future workspace resources
```

### 5.2 Organization Ownership

`Proposed` rules:

- `owner` is an organization membership role, not merely a workspace role.
- An active owner has effective `admin` permissions in every active workspace under that organization.
- Effective owner access is calculated by backend authorization service; it is not dependent on duplicate workspace-membership rows.
- Organization must retain at least one active owner at all times.
- Owner transfer is one transaction: validate current owner and target active organization member; add/promote target owner; record audit event; only then permit prior-owner demotion or revocation.
- Backend locks relevant owner membership rows and rejects an operation that would reduce active-owner count below one.
- User suspension, owner removal, owner demotion, and organization-member revocation all use this last-active-owner protection.

`Approved`: owner may create and archive workspaces, but cannot archive final active workspace in organization.

`Pending Approval`: whether ownership transfer requires a specific MFA assurance level or a provider-neutral recent-authentication interval beyond standard session validation.

### 5.3 Workspace Membership

`Proposed` roles:

- `admin`: manages workspace configuration, workspace memberships, and destructive operational actions.
- `member`: creates/runs jobs, creates/revises/reviews items, updates checklists.
- `viewer`: reads authorized workspace resources only.

Rules:

- User must have active organization membership before workspace membership can be created.
- A workspace membership is inactive when revoked, user suspended, workspace archived, or organization suspended.
- Workspace selection in UI/header is never authorization. Each request revalidates active workspace membership or effective owner status.
- `Approved`: custom roles and cross-workspace resource sharing are deferred.

### 5.4 Workspace Lifecycle

`Approved` archive policy:

- Archive is not deletion. Existing jobs, items, revisions, and history remain retained and readable by users who retain authorization, subject to retention policy.
- Archived workspace rejects new chat/job execution and all other work-creating mutations.
- Read-only historical access remains available to authorized owner/admin/member/viewer roles.
- Restore/reopen behavior is `Pending Approval`; no implementation may assume it exists.
- Owner cannot archive final active workspace. Backend validates this under transaction/lock, not only in UI.

### 5.5 Platform Admin and Support Access

`Approved`: platform admin does not automatically access customer contents.

`Proposed` platform-admin model:

- Store platform privilege separately from customer membership in `platform_admins`.
- No public signup, invite, organization-owner action, or customer workspace action can create a platform admin.
- Provision through restricted internal process after verified identity mapping; capture grant reason, approver/reference, time, and revocation state.
- Platform administration grants platform operations only. Customer access needs a separate support-access grant.
- Platform-admin provisioning, revocation, and every support-access action produce immutable audit events.

`Proposed` support-access grant fields/behavior:

- target organization/workspace; target staff user; requested permission scope; reason; approving authority; granted timestamp; expiry; revocation timestamp/reason; emergency flag.
- Backend includes customer workspace in authorization context only while grant is active and scope allows requested action.
- Grant expires automatically and can be revoked immediately.
- Emergency grant, if approved in future, requires a separate reason code, short maximum duration, enhanced alerting, and post-event review.

`Approved` baseline support policy:

- Access is temporary and explicitly requested; requester cannot approve own request.
- Two distinct internal approvers are required: designated Support Lead plus Security/Privacy approver.
- Grant lasts maximum four hours, names one organization or workspace, and lists explicit permissions.
- Customer notification and customer authorization are default before customer-content access.
- Exception needs documented legal/security incident basis and appropriate approval.
- Audit every request, approval, grant, read, mutation, expiry, revocation, and denial relevant to support grant.
- Grant expires automatically and can be revoked immediately.
- Platform-admin role never supplies implicit customer-content access.
- Emergency access is not approved and remains unimplemented pending separate decision.

`Pending Approval`: customer-consent exception authority, audit-log retention, and any emergency-access policy.

## 6. Authentication and Session Design

### 6.1 Managed OIDC Provider Evaluation (DEC-015)

**Decision status:** `Pending Approval`. The following is current official-provider documentation review, not a provider selection.

| Provider | Verified official facts | Fit/trade-off for Virtual Office |
| --- | --- | --- |
| Auth0 | Auth0 documents Authorization Code Flow with PKCE and MFA. [PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce), [MFA](https://auth0.com/docs/secure/multi-factor-authentication), [pricing](https://auth0.com/pricing). | Strong generic customer-identity candidate for Express/OIDC. Mature controls may be commercially heavier as MAU/security needs grow. |
| Clerk | Clerk positions managed authentication/user management and publishes pricing. [Docs](https://clerk.com/docs), [pricing](https://clerk.com/pricing). | Fast application onboarding and user-management UX. Its organization model must not replace Virtual Office backend organization/workspace authorization. Verify Express/OIDC/JWKS and MFA/recent-auth behavior in proof of concept. |
| WorkOS | WorkOS documents AuthKit and user-management onboarding. [AuthKit](https://workos.com/docs/authkit), [pricing](https://workos.com/pricing). | Strong B2B/enterprise direction, especially if SSO/directory integration becomes near-term need. May add enterprise-oriented cost/operational weight before that need exists. |
| Amazon Cognito | Cognito documents OAuth authorization endpoint and user-pool MFA; pricing is usage-based on AWS page. [Authorization endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html), [MFA](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html), [pricing](https://aws.amazon.com/cognito/pricing/). | Fits AWS-hosted operations and standard JWT/JWKS validation, but team owns more implementation and user-management UX than turnkey providers. |

**Verified facts:** cited documentation/pages describe each provider's published product capabilities. Pricing, included quotas, plan limits, regional availability, and commercial terms change; current quote must be obtained before approval. No fixed price estimate is recorded here.

**Technical recommendation (`Proposed`):** prefer **Auth0 for proof-of-concept evaluation**, with Cognito as alternative when AWS operations, cost control, and owned UX outweigh time-to-market. Retain WorkOS shortlist if enterprise SSO/directory sync is committed soon. Evaluate Clerk only if its Express integration, organization abstraction boundaries, and MFA/recent-auth behavior meet server-authoritative tenant requirements.

**Required proof-of-concept acceptance criteria before selection:**

- Authorization Code + PKCE works with existing Express deployment model.
- Backend independently validates issuer, audience, signature, expiry, nonce/state, and JWKS rotation.
- Provider supports required MFA/recent-auth flow or documented compensating control.
- Account recovery, user suspension, logout/revocation, and administrative lifecycle API meet requirements.
- Local `users` key remains `(provider_issuer, external_subject)`; provider organization/group claims never replace local tenant authorization.
- Pricing quote covers expected early-stage MAU and projected growth; exit path remains standard OIDC claims plus local ownership data.

**Required approval:** Product, Security, Operations select provider, allowed issuer(s), MFA/recent-auth policy, and commercial owner. No provider is approved by this recommendation.

### 6.2 OIDC Identity

`Approved`: use managed OIDC.

`Proposed` implementation:

- Use Authorization Code flow with PKCE.
- Express validates allowed issuer, audience, signature, expiry, nonce, and state.
- Identity key is `(provider_issuer, external_subject)`; email alone is not stable identity key.
- Map OIDC identity to local `users` record only after issuer is allowed.
- Do not store provider access token, refresh token, or ID token in browser storage unless future approved provider design requires protected server-side storage.

`Pending Approval`: provider/vendor, exact allowed issuer configuration, audience/client configuration, account-linking behavior, MFA/assurance claim requirements.

### 6.3 Session Lifecycle

`Approved` baseline:

- `absolute_expires_at = issued_at + 24 hours`.
- `idle_expires_at = last_seen_at + 8 hours`.
- Session is invalid when either expiry is reached; activity may update `last_seen_at`/idle expiry but never absolute expiry.
- Logout and revocation must invalidate session consistently.

`Proposed` implementation:

- Browser receives opaque random session token in `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
- DB stores one-way token hash only.
- Logout revokes current session. Account/session management may revoke all user sessions.
- User suspension, membership revocation, organization suspension, workspace archive, platform-admin/support-grant revocation cause authorization failure on next request; high-risk changes should also revoke matching sessions where technically applicable.
- Reauthentication is required for ownership transfer and platform/support privilege elevation once MFA/recent-auth policy is approved.

### 6.4 CSRF and Request Validation

`Proposed`:

- All `POST`, `PUT`, `PATCH`, and `DELETE` cookie-authenticated requests require CSRF token validation.
- Validate `Origin` and, as fallback, `Referer` on browser mutations.
- Keep API same-origin by default; do not enable broad CORS.
- Do not place session tokens, access codes, or secrets in URLs, logs, or browser local storage.
- SSE chat endpoint authenticates from session context and applies workspace authorization before agent selection.

### 6.5 Per-Request Authorization Context

For every protected request, backend must:

1. Read and hash session cookie.
2. Load non-revoked, non-expired session and active user.
3. Resolve active workspace from server-side session state or request workspace selector.
4. Verify active workspace and organization state.
5. Verify active workspace membership or active organization-owner membership.
6. Add active support grant only if its scope/time remains valid.
7. Resolve effective permissions.
8. Apply workspace predicate to every resource query before returning/mutating data.

Return `401` for absent/invalid session; `403` for known user without permission; use scoped resource query and generic `404` for resource ID absent or outside caller workspace.

## 7. Database Design

### 7.1 New Tables

`Proposed` definitions; SQL is intentionally not generated in this document.

#### users

| Column | Definition |
| --- | --- |
| `id` | `BIGINT UNSIGNED` primary key |
| `provider_issuer` | `VARCHAR(255) NOT NULL` |
| `external_subject` | `VARCHAR(255) NOT NULL` |
| `email` | `VARCHAR(320) NOT NULL` |
| `display_name` | `VARCHAR(150) NULL` |
| `status` | `active`, `suspended`, `deleted` |
| timestamps | `created_at`, `updated_at`, `last_login_at` |

Constraints/indexes: `UNIQUE(provider_issuer, external_subject)`, `INDEX(email)`, `INDEX(status, id)`. Do not add `UNIQUE(email)` until account-linking policy is approved.

#### organizations

| Column | Definition |
| --- | --- |
| `id` | `BIGINT UNSIGNED` primary key |
| `slug` | `VARCHAR(100) NOT NULL` |
| `name` | `VARCHAR(150) NOT NULL` |
| `status` | `active`, `suspended`, `deleted` |
| `created_by_user_id` | FK to `users`, `RESTRICT` |
| timestamps | create/update/delete timestamps |

Constraints/indexes: `UNIQUE(slug)`, `INDEX(status, id)`.

#### organization_memberships

| Column | Definition |
| --- | --- |
| `organization_id` | FK `organizations`, `CASCADE` |
| `user_id` | FK `users`, `RESTRICT` |
| `role` | fixed `owner` in first milestone |
| `created_by_user_id` | FK `users`, `RESTRICT` |
| timestamps | `created_at`, nullable `revoked_at` |

Constraints/indexes: primary key `(organization_id, user_id)`, `INDEX(user_id, organization_id, revoked_at)`, `INDEX(organization_id, role, revoked_at)`.

#### workspaces

| Column | Definition |
| --- | --- |
| `id` | `BIGINT UNSIGNED` primary key |
| `organization_id` | FK `organizations`, `RESTRICT` |
| `slug` | `VARCHAR(100) NOT NULL` |
| `name` | `VARCHAR(150) NOT NULL` |
| `status` | `active`, `archived` |
| `created_by_user_id` | FK `users`, `RESTRICT` |
| timestamps | create/update/archive timestamps |

Constraints/indexes: `UNIQUE(organization_id, slug)`, `INDEX(organization_id, status, id)`.

**Approved default provisioning policy (DEC-016):** creation transaction creates organization, founding owner membership, and exactly one active workspace with display name `Main workspace` and slug `main`. Repeated request identified by same idempotency key returns existing successful result; it must not create duplicate organization or default workspace. If transaction fails, transaction rolls back all three writes.

`Proposed` future manual-slug rules: lowercase ASCII kebab-case after Unicode normalization; maximum 100 characters; reject empty/reserved values; enforce unique `(organization_id, slug)`. On collision, return validation error and let caller select another slug rather than silently changing a user-selected name. Reserved-name list is `Pending Approval`.

#### workspace_memberships

| Column | Definition |
| --- | --- |
| `workspace_id` | FK `workspaces`, `CASCADE` |
| `user_id` | FK `users`, `RESTRICT` |
| `role` | `admin`, `member`, `viewer` |
| `created_by_user_id` | FK `users`, `RESTRICT` |
| timestamps | `created_at`, nullable `revoked_at` |

Constraints/indexes: primary key `(workspace_id, user_id)`, `INDEX(user_id, workspace_id, revoked_at)`, `INDEX(workspace_id, role, revoked_at)`.

#### sessions

| Column | Definition |
| --- | --- |
| `id` | `BIGINT UNSIGNED` primary key |
| `user_id` | FK `users`, `CASCADE` |
| `token_hash` | `BINARY(32) NOT NULL` |
| `active_workspace_id` | nullable FK `workspaces`, `SET NULL` |
| `created_at`, `last_seen_at` | timestamps |
| `idle_expires_at`, `absolute_expires_at` | timestamps |
| `revoked_at`, `revoked_reason` | nullable revocation metadata |
| `ip_hash`, `user_agent_hash` | optional privacy-reviewed hashes |

Constraints/indexes: `UNIQUE(token_hash)`, `INDEX(user_id, revoked_at, absolute_expires_at)`, `INDEX(active_workspace_id, revoked_at)`.

#### platform_admins

| Column | Definition |
| --- | --- |
| `user_id` | PK/FK `users`, `RESTRICT` |
| `granted_by_user_id` | nullable FK `users`, `RESTRICT` only for controlled bootstrap exception |
| `grant_reason` | required text/reference |
| `approval_reference` | nullable approved ticket/reference |
| grant/revoke fields | timestamps, actor IDs, revocation reason |

Constraint/index: `INDEX(revoked_at, user_id)`.

Support grants/audit-event schema is a `Proposed` dependency of support-access implementation; it must not be silently introduced without approval of DEC-018.

### 7.2 Existing Resource Ownership

`Proposed` additions:

| Table | Required columns | Required indexes |
| --- | --- | --- |
| `clients` | `organization_id`, `workspace_id`, `created_by_user_id`, `updated_by_user_id` | `(workspace_id, name, id)` |
| `jobs` | `organization_id`, `workspace_id`, `created_by_user_id` | `(workspace_id, created_at, id)`, `(workspace_id, agent_id, id)` |
| `items` | `organization_id`, `workspace_id`, `created_by_user_id`; optional `updated_by_user_id` | `(workspace_id, deleted_at, status, agent_id, id)`, `(workspace_id, job_id)`, `(workspace_id, parent_id)` |
| `revisions` | `organization_id`, `workspace_id`, `created_by_user_id` | `(workspace_id, item_id, id)` |

Backend invariants:

- Scope is derived from authorization context; browser request body cannot set ownership IDs.
- `jobs.client_id` and `jobs.parent_item_id` must be null or point to same workspace/organization.
- `items.job_id`, `items.client_id`, `items.parent_id` must all belong to same workspace/organization as item.
- `revisions.item_id` must point to same workspace/organization.
- MySQL foreign keys alone do not prove matching organization IDs across separate relationships. Service-layer validation and integration tests are mandatory; composite FK hardening can be evaluated later.

## 8. Authorization Matrix

| Capability | platform_admin | owner | admin | member | viewer |
| --- | ---: | ---: | ---: | ---: | ---: |
| Platform operations | Yes | No | No | No | No |
| Customer workspace read | Approved support grant only | Yes | Yes | Yes | Yes |
| Create/edit client | No default | Yes | Yes | Yes | No |
| Submit chat/job | No default | Yes | Yes | Yes | No |
| Read jobs/items/revisions | Approved support grant only | Yes | Yes | Yes | Yes |
| Revise item | No default | Yes | Yes | Yes | No |
| Approve/reject item | No default | Yes | Yes | Yes | No |
| Update checklist | No default | Yes | Yes | Yes | No |
| Soft delete/restore item | No default | Yes | Yes | No | No |
| Permanent delete item | No default | Yes | Yes | No | No |
| Manage workspace members | No default | Yes | Yes | No | No |
| Manage owners | No default | Yes; last-owner protected | No | No | No |
| Create/archive workspace | No default | Yes; final active workspace protected | No | No | No |

## 9. Existing Endpoint Authorization Requirements

| Existing endpoint/action | Required permission | Required server check |
| --- | --- | --- |
| `GET /clients` | `client:read` | filter active `workspace_id` |
| `POST /clients` | `client:create` | derive scope/actor from context |
| `POST /jobs` | `job:create` | selected client/parent item same active workspace |
| `GET /jobs` | `job:read` | workspace filter before agent filter |
| `GET /jobs/:id` | `job:read` | `id` plus active workspace; generic `404` out of scope |
| `GET /items/counts` | `item:read` | aggregate active workspace only |
| `GET /items` | `item:read` | scope items and joins by workspace |
| `GET /items/:id` | `item:read` | item, parent, children, revisions all scoped |
| revise item | `item:revise` | scoped row lock/read; actor recorded |
| approve/reject item | `item:review` | scoped item; member+ |
| checklist update | `item:update` | scoped item; member+ |
| soft delete | `item:delete` | scoped item; admin/owner |
| restore | `item:restore` | scoped item; admin/owner |
| permanent delete | `item:purge` | scoped already-deleted item; admin/owner; audit event |
| chat | `chat:run` | authenticated workspace before static agent selection |

IDOR rule: no resource loader may query only resource ID. Every loader accepts authorization context and applies workspace predicate before return/mutation. Do not disclose whether out-of-workspace IDs exist.

## 10. Legacy Data Quarantine and Verification

### 10.1 Approved Policy

- Unowned legacy data goes to internal organization and dedicated workspace.
- Preserve `clients`, `jobs`, `items`, `revisions`, and their relations.
- Do not expose records automatically to new customers.
- Moving/deleting legacy data requires separate approval.

### 10.2 Proposed Procedure

1. Create verified, encrypted backup before migration; record backup identifier, timestamp, schema version, row counts, and checksum.
2. Test restore into isolated non-production environment; record result before production change.
3. Create internal organization `Legacy Migration` and workspace `Imported Shared Office` in controlled transaction. Names are proposed, not product policy.
4. Create designated internal migration-owner account. Do not fabricate original historical actor identity.
5. Add ownership columns as nullable first; backfill every legacy record to same internal organization/workspace.
6. Preserve original record IDs and existing relationships.
7. Record migration provenance/audit event identifying administrative ownership assignment.
8. Reconcile row counts and validate relationships before making ownership columns non-null.
9. Keep legacy organization/workspace hidden from normal customer workspace discovery and without customer memberships.

### 10.3 Required Validation

Row reconciliation:

```text
clients source count   = clients assigned to legacy workspace
jobs source count      = jobs assigned to legacy workspace
items source count     = items assigned to legacy workspace
revisions source count = revisions assigned to legacy workspace
```

Relationship checks:

- Every non-null `jobs.client_id` points to same-workspace client.
- Every non-null `jobs.parent_item_id` points to same-workspace item.
- Every item job/client/parent relation remains in same workspace.
- Every revision points to same-workspace item.
- No ownership column remains null at enforcement stage.
- No resource organization conflicts with its workspace organization.
- Sample content/revision checks and, where feasible, deterministic checksum comparison confirm payload preserved.

Customer-access prevention:

- No customer membership in legacy organization/workspace.
- Workspace list queries exclude internal/quarantined organizations from customer sessions.
- Old shared-code path, if temporarily retained, is not permitted to reach customer-scoped workspace data.
- Platform staff access requires approved support grant; platform-admin role alone is insufficient.

### 10.4 Legacy Retention Options (DEC-019)

**Decision status:** `Pending Approval`. Quarantine is approved; retention length/disposition is not.

| Option | Privacy and recovery effect | Storage/operations effect | Required approval |
| --- | --- | --- | --- |
| Retain until documented ownership decision | Minimizes accidental deletion; extends period holding unowned potentially sensitive data. Best recovery posture. | Indefinite review/monitoring and storage obligation. | Product + Legal/Privacy + Data Owner |
| Fixed 90-day retention | Clear operational deadline; may be too short for ownership disputes or recovery. | Bounded storage and scheduled review/deletion workflow. | Product + Legal/Privacy + Data Owner |
| Longer documented business/legal retention | Preserves evidence/recovery where required; higher exposure window. | Requires retention register, review cadence, access controls, and legal basis. | Legal/Privacy + Data Owner + Product |

No option authorizes automatic transfer or deletion. Any transfer requires verified customer ownership, approved mapping/reconciliation plan, and audit event. Any deletion requires approved retention decision, backup/recovery validation, count/checksum reconciliation, and deletion audit.

## 11. Migration and Rollback Plan

### 11.1 Staged Migration

1. Approve pending product/security decisions required for identity and support access.
2. Introduce versioned migration tool/history; capture baseline of current schema. Do not execute migrations as part of this design task.
3. Add identity/tenant/session tables.
4. Add nullable ownership/actor columns to existing tables.
5. Take/test backup, quarantine/backfill legacy data, and run required reconciliation.
6. Add authenticated session middleware and authorization context behind feature flag.
7. Add scoped `/api/v1` route family and integration tests; old routes remain internal compatibility only.
8. Update frontend to use authenticated session/workspace context and scoped APIs.
9. Observe access failures/authorization logs and repair omissions.
10. Enforce non-null ownership, indexes, and approved foreign keys after validation.
11. Disable shared access code only when shutdown criteria pass.
12. In later contract release, remove old code path, `ACCESS_CODE`, `/api/verify`, and browser access-code storage.

### 11.2 Rollback Principles

- Before non-null/FK enforcement: rollback application release; retain additive nullable schema for forward recovery.
- During failed backfill: stop cutover, restore from tested backup or rerun known checkpoint; never expose partially scoped data.
- After non-null/FK enforcement: use forward fix or approved restore; do not blindly drop tenant columns.
- Rollback must never reopen shared public access to customer-scoped records.

### 11.3 Shared Access-Code Retirement

`Approved` baseline: final cutover needs Security and Operations approval; Product confirms user-facing readiness. Observation period is minimum 14 consecutive days after authenticated frontend rollout.

`Approved` shutdown preconditions:

- Authenticated `/api/v1` covers all production UI actions.
- Frontend no longer stores or sends `x-access-code`.
- Legacy data ownership/quarantine validation passes.
- Endpoint-level cross-workspace/IDOR tests pass.
- Support/team users have authenticated accounts.
- No successful legacy shared-code request reaches customer-scoped data during observation; investigate every legacy-route request.
- Monitoring captures authentication failures, authorization denials, legacy-route use, and tenant-boundary alerts.
- Integration tests cover allowed access, denied access, and same-ID cross-workspace attempts.
- Security and Operations approve cutover; Product confirms user-facing readiness.

`Approved` rollback conditions include confirmed cross-tenant access, material authentication failures, migration reconciliation errors, and critical authorization defects.

Rollback uses authenticated maintenance mode, a feature flag, or tested database recovery as appropriate. It must never restore unsafe public shared-code access to customer data.

## 12. Open Questions

| Question | Status | Needed decision |
| --- | --- | --- |
| Which managed OIDC provider and allowed issuer(s)? | `Pending Approval` | Product, security, operations |
| What MFA/assurance is required for normal login, owner transfer, platform administration, and support elevation? | `Pending Approval` | Security |
| Is email unique across identities, and how are identities linked? | `Pending Approval` | Product + security |
| Default workspace name/slug format? | `Approved` | `Main workspace` / `main`; reserved-name list remains pending |
| Can owners create/archive workspaces without platform approval? | `Approved` | Owner may; final active workspace protected |
| Who approves normal support access? Maximum duration? Customer consent? | `Approved` | Support Lead + Security/Privacy; four hours; customer notice/authorization default |
| Is emergency access available? If so, who can invoke it and what post-review applies? | `Pending Approval` | Security + operations |
| How long is quarantined legacy data retained? Who can approve transfer/deletion? | `Pending Approval` | Product + legal + data owner |
| What observation period, metric thresholds, and approvers govern shared-code shutdown? | `Approved` | 14 days; Security + Operations; Product readiness confirmation |

## 13. Tenant Foundation Implementation Sequence

### Phase 0: Approve Policy Contract

- **Purpose:** Freeze identity, owner, support, legacy, and cutover rules.
- **Dependencies:** Stakeholders named in decision register.
- **Risk:** Implementation hard-codes unapproved access semantics.
- **Acceptance criteria:** DEC-016/017/018/020 reflected in implementation plan; DEC-015 provider/issuer/MFA choice selected before phase 2; DEC-019 remains explicitly quarantined with no transfer/deletion action; approved RBAC matrix and support boundary recorded.

### Phase 1: Migration Baseline

- **Purpose:** Introduce reproducible, versioned schema change process.
- **Likely changes:** Migration tooling/configuration, `server/db.js`, deployment/runbook documents.
- **Dependencies:** Test database, backup/restore process, operations approval.
- **Risk:** Startup `CREATE TABLE IF NOT EXISTS` conflicts with migration ownership.
- **Tests:** Empty DB upgrade; current-schema upgrade; migration idempotency; failure/recovery path.
- **Acceptance criteria:** Schema version history exists; production schema evolution does not depend on untracked startup DDL.

### Phase 2: Identity, Session, and Tenant Tables

- **Purpose:** Add users, organization/workspace, memberships, sessions, platform-admin model.
- **Likely changes:** Versioned migrations, auth/session modules, `server/index.js`.
- **Dependencies:** DEC-015 provider/issuer/MFA decision; phase 1.
- **Risk:** Session fixation, token leakage, invalid issuer acceptance, weak revocation.
- **Tests:** OIDC validation; expired/idle/revoked session; suspended user; CSRF rejection; membership/workspace validation.
- **Acceptance criteria:** Protected endpoint can build valid authorization context; no browser-stored bearer/session token; session limits match POL-002.

### Phase 3: Legacy Quarantine Backfill

- **Purpose:** Give existing data explicit, non-customer scope while preserving relations.
- **Likely changes:** Versioned migration/backfill tooling and runbook only.
- **Dependencies:** Tested backup/restore; approved quarantine policy; phase 2. Final retention decision is not required to quarantine, but is required before any transfer/deletion.
- **Risk:** Relation corruption, row loss, accidental customer exposure.
- **Tests:** Row reconciliation, relationship validation, restoration rehearsal, hidden-workspace access denial.
- **Acceptance criteria:** All legacy records assigned to quarantine workspace; required validation passes; no customer can discover/read it.

### Phase 4: Authorization Service and Tenant-Scoped APIs

- **Purpose:** Replace global resource access with server-enforced workspace scope and RBAC.
- **Likely changes:** `server/api.js`, new authorization/repository modules, route tests.
- **Dependencies:** Phases 2-3.
- **Risk:** One unscoped query creates IDOR/cross-tenant exposure.
- **Tests:** Per-endpoint allow/deny; same ID cross-workspace attempts; owner/admin/member/viewer matrix; owner last-active protection.
- **Acceptance criteria:** Every current client/job/item/revision read/write has permission check plus workspace predicate; external out-of-scope resource resolves generic `404`.

### Phase 5: Authenticated Frontend Cutover

- **Purpose:** Move existing 3D/chat/job/board UI from shared code to session/workspace-aware API.
- **Likely changes:** `src/api.js`, `src/chat.js`, `src/main.js`, `src/jobs-ui.js`, `src/board.js`, authentication UI modules.
- **Dependencies:** Phase 4 scoped `/api/v1` endpoints.
- **Risk:** Legacy unauthenticated fallback, workspace confusion, loss of existing user flow.
- **Tests:** Browser/E2E login, workspace selection, role UI constraints, denied mutation, no `x-access-code` storage/transmission.
- **Acceptance criteria:** Standard UI uses authenticated scoped API only; frontend permissions are UX only, backend remains authority.

### Phase 6: Shared-Code Retirement

- **Purpose:** Remove temporary global-access mechanism safely.
- **Likely changes:** Old middleware/routes, `src/chat.js`, `.env.example`, operational runbook.
- **Dependencies:** Approved DEC-020 and all retirement preconditions.
- **Risk:** User lockout or accidental reopening of shared data.
- **Tests:** Legacy code rejected; authenticated routes work; cutover/rollback rehearsal.
- **Acceptance criteria:** Old access-code path disabled, then removed in approved contract release; audit/monitoring evidence retained.

## 14. First Implementation Task Recommended for Approval

**Task:** Phase 1 migration baseline: introduce a versioned migration framework and schema-version history without changing tenant tables or applying production migrations.

**Why first:** DEC-016/017/018/020 are now approved. Migration baseline is needed before identity/tenant schema work and does not depend on final OIDC provider selection. DEC-015 evaluation runs in parallel and blocks Phase 2.

**Acceptance criteria:**

- Operations approves migration tool, non-production test database, backup/restore rehearsal, and deployment runbook.
- Empty-schema and current-schema upgrade paths are reproducible; failed migration recovery is tested in non-production.
- Production schema evolution has version history and no longer relies on untracked startup DDL once cutover occurs.
- No tenant/identity schema, data backfill, or production migration is applied in this task.
- In parallel, Auth0/Cognito proof-of-concept results must support DEC-015 provider, issuer, and MFA/recent-auth approval before Phase 2 begins.
