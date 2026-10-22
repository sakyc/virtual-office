# Virtual Office - Product Specification (Draft)

**Status:** Draft for product review  
**Scope:** Product vision and initial architectural implications only  
**Non-goal of this document:** Assert that any planned capability exists in the current codebase.

## 1. Vision and Product Goals

Virtual Office is a public, multi-tenant SaaS platform for building, managing, and operating AI workforces. It gives customers one digital work environment where they can use AI workers, assign and monitor work, compose workflows, and inspect results.

The product has two equally important experiences, backed by the same domain data and backend services:

1. **Interactive 3D Virtual Office** - visualizes AI workers, activity states, interactions, and work in progress.
2. **Management Dashboard** - manages workers, jobs, workflows, configurations, outputs, members, usage, and subscriptions.

The objective is not a chatbot or a visual redesign. It is a maintainable platform for AI-powered digital work, usable by individuals through organizations.

## 2. Product Problems Addressed

| User problem | Product response |
| --- | --- |
| AI tools are fragmented and hard to coordinate as repeatable work. | Workers, jobs, workflow definitions, inputs, and outputs live in one workspace. |
| Teams cannot easily see AI work in progress or its outcome. | Dashboard provides operational management; 3D office provides a live, intuitive activity view. |
| Organizations need control over access, cost, and data. | Backend-enforced roles, tenant isolation, auditable usage, package entitlements, and controlled credentials. |
| Advanced users need adaptation without unsafe infrastructure access. | Bounded configuration of prompts, parameters, forms, workflows, branding, and workspace preferences. |

## 3. Target Users and Roles

Primary audiences are individuals, teams, and organizations using AI as digital workers. The platform must support multiple customer organizations with strict data isolation.

| Role | Intended responsibility |
| --- | --- |
| Platform Admin | Operate overall SaaS platform. |
| Organization Owner | Manage organization, members, subscription, and workspaces. |
| Workspace Admin | Manage workspace configuration and permitted work. |
| Member | Use workers and run permitted jobs. |
| Viewer | Read permitted data without changing configuration. |

Authorization must be evaluated and enforced by backend services for every protected operation. Frontend permission checks are usability aids only, never security boundaries.

## 4. Core User Experiences

### 4.1 Management Dashboard

Dashboard is operational control plane. Users can, according to their role and subscription entitlement:

- Select, configure, and use AI workers.
- Create or run jobs using controlled input forms.
- Define and run workflows connecting multiple workers.
- Inspect job state, outputs, failures, history, and consumption.
- Manage workspace settings, membership, and allowed branding/preferences.
- Review subscription status, limits, and transparent usage information.

### 4.2 Interactive 3D Virtual Office

3D office is a product experience, not separate data product. It represents relevant worker identity, availability, activity, interactions, and current work state from the same authoritative backend model used by dashboard.

It must not become sole way to operate critical functions. Equivalent operational information and actions required for accessibility, reliability, or administration remain available in dashboard.

### 4.3 Shared Product Expectations

- State changes made in either experience use shared domain APIs and are reflected consistently.
- Output visibility follows tenant, workspace, role, and resource permissions.
- Long-running work exposes meaningful status and result/error information.
- User-facing actions reveal applicable quota, entitlement, and expected cost constraints before or during execution as product policy requires.

## 5. MVP Scope

MVP establishes safe multi-tenant foundation and usable AI work execution. Exact prioritization needs product approval.

### In Scope for MVP (proposed)

- Organization and workspace boundaries.
- Backend-enforced authentication, role-based authorization, and tenant-scoped data access.
- Platform-provided worker templates and controlled job execution.
- Job input, execution lifecycle, output/history view, and basic error reporting.
- Dashboard for workers, jobs, results, members, usage, and subscription visibility.
- 3D office integrated as a module using shared worker/activity data, provided current Three.js implementation is technically suitable after audit.
- Configurable plans/entitlements and auditable AI usage recording.
- AI provider abstraction capable of platform credentials and BYOK without exposing secrets.

### Explicitly Outside MVP Unless Approved

- Arbitrary customer code execution.
- Direct customer access to platform secrets or internal infrastructure.
- Replacement of Express, MySQL/MariaDB, or Three.js solely for architectural preference.
- Desktop application distribution.
- Final commercial prices, quota amounts, overage rules, or billing-provider implementation.
- Claim that planned capabilities already exist in current source code.

## 6. Workers, Jobs, and Workflows

### Platform Templates

Base packages provide platform-curated worker templates, job templates, and configurations. Templates are managed as product-controlled capabilities and can be made available by plan or entitlement.

### Paid Customization

Eligible packages may allow customers to:

- Create and configure AI workers within allowed schemas.
- Change approved prompt fields and parameters.
- Create jobs and custom input forms.
- Compose workflows that pass controlled outputs between workers.
- Set permitted branding and workspace preferences.

Customization must remain declarative and validated. It must not grant arbitrary code execution, unrestricted network/infrastructure access, or raw secret access.

### Execution Model Requirements

- Jobs and workflow runs need stable identifiers, lifecycle status, timestamps, initiator/context, and result/error references.
- Inputs, outputs, and execution metadata require tenant/workspace ownership and access rules.
- Worker/provider requests must be created through backend services, never directly from browser with privileged credentials.
- Retry, cancellation, retention, concurrency, and workflow failure semantics are not yet decided.

## 7. Subscription, Entitlements, and Usage

Virtual Office uses SaaS subscriptions with configurable plans and entitlements. Entitlements determine which features, templates, customization surfaces, and resource limits are available.

Usage recording must support auditability: link consumption to organization/workspace, actor or initiating process where applicable, worker/job/workflow run, provider/model, timestamp, and applicable billing or quota basis. Exact metering dimensions remain undecided.

Both platform-managed API credentials and Bring Your Own Key (BYOK) are required product directions. Provider access must pass through an abstraction layer that resolves authorized credential source and applies policy without returning secret material to client applications.

## 8. Security and Data Isolation Principles

1. **Tenant isolation by default.** Every tenant-owned record and query is scoped to an organization; workspace-scoped records also enforce workspace membership and permission.
2. **Backend is authority.** Backend validates authentication, authorization, entitlements, ownership, and input policy before every protected read or mutation.
3. **Least privilege.** Roles grant only required access. Platform administration is isolated from customer organization administration.
4. **Secrets stay server-side.** Encrypt and restrict provider credentials, including BYOK. Never expose raw keys, internal service credentials, or infrastructure access to browser or workers.
5. **Safe customization.** Treat prompts, forms, workflow definitions, and provider parameters as constrained data with validation, allowlists, limits, and audit trails.
6. **Auditable operations.** Record relevant permission changes, configuration changes, execution events, credential lifecycle events, and consumption events. Retention and privacy policy remain to be defined.
7. **Input and output protection.** Validate inputs; protect outputs from cross-tenant disclosure; define handling for sensitive data, exports, logs, and provider transmission before launch.
8. **No trust in visualization.** 3D presence/activity state cannot bypass authorization or disclose work details beyond viewer permissions.

## 9. Initial Architecture Implications

These are architectural constraints and evaluation criteria, not a claim about current implementation.

- Web is first distribution target. Dashboard and 3D office should be modules in one web application, sharing identity, navigation, domain APIs, and real-time/state synchronization where needed.
- React + Vite + TypeScript is candidate dashboard stack. Adoption requires source audit; it is not assumed to be current state.
- Existing Three.js should be retained and integrated as 3D office module if audit confirms maintainability, performance, and product fit.
- Existing Express backend remains in place until audit produces an approved migration plan. NestJS is an option, not mandated architecture.
- Existing MySQL/MariaDB remains data-store baseline unless a strong technical reason and migration plan justify change.
- Domain boundaries should distinguish at minimum: identity/access, organizations/workspaces, worker templates/configurations, jobs/executions, workflows, outputs, subscriptions/entitlements, usage/metering, credentials/provider access, and audit activity.
- AI provider integrations need a provider-neutral service boundary for credential selection, request validation, model capability policy, usage capture, error normalization, and secret handling.
- Migration must be incremental: characterize current behavior, protect compatibility, add tests, introduce boundaries, migrate in small reversible steps.

## 10. Established Decisions vs. Pending Decisions

### Established Product Direction

- Product becomes public SaaS AI Workforce Platform.
- Both 3D Virtual Office and Management Dashboard are first-class experiences in one web application.
- Multi-organization support, strict isolation, and backend-enforced authorization are required.
- Controlled customization is package/entitlement dependent; arbitrary code and direct internal access are prohibited.
- Subscription, auditable consumption, platform credentials, and BYOK are required directions.
- First target is web; desktop is later consideration only.
- Existing Express, MySQL/MariaDB, and potentially suitable Three.js implementation are retained pending audit and approved migration rationale.

### Proposals Requiring Approval

- MVP feature ordering and release criteria listed in this document.
- Exact RBAC permission matrix, including whether roles are fixed or custom roles are later supported.
- Organization-to-workspace hierarchy and cross-workspace sharing rules.
- Real-time update approach and acceptable activity/status latency for 3D office.
- Worker/job/workflow schemas, execution lifecycle, retry/cancel rules, retention policies, and concurrency limits.
- Provider list, model allowlists, data residency requirements, BYOK onboarding/revocation UX, and credential encryption/key-management approach.
- Metering units, quota behavior, overages, pricing, invoicing, billing provider, and subscription lifecycle rules.
- Audit-log coverage, retention, export, privacy/compliance obligations, and incident response policy.
- Branding boundaries, customization limits, and template publishing/review process.

## 11. Validation Needed Before Technical Roadmap

Next phase maps actual source code to this specification without assuming feature availability. The resulting technical audit should identify:

- Existing frontend, Three.js, backend, database, auth, and provider-integration capabilities.
- Actual data model and current tenant/workspace boundaries, if any.
- Security gaps against required backend authorization, secret handling, and isolation principles.
- Dependencies and risks of preserving or incrementally evolving Express, MySQL/MariaDB, and Three.js.
- A phased implementation roadmap with test, migration, and rollout strategy.

No source-code changes, dependency changes, database migrations, or deployment actions are authorized by this specification draft.
