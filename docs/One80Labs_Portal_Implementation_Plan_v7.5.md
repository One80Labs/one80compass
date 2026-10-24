# One80Labs Portal

*Phased implementation plan & release gates  |  Version 7.5*

## 1. Delivery objective

Ship a secure, customer-ready replacement for the Confluence application directory, with basic integrated Documents, Project Plan, Kanban and Status Reports. Deliver in thin vertical slices; advanced capabilities remain committed backlog items, not MVP blockers.

## 2. Release boundaries

| Release | In scope | Exit / value |
| --- | --- | --- |
| R1 — MVP | Cognito/MFA, tenant isolation, administration, portal navigation, secure Lambda launch, Overview, Documents basic, GitHub-connected task table/Kanban, calculated progress + override, basic milestones, manual reports, soft delete, core audit. | Pilot customer can complete main workflows without Confluence. |
| R2 — Project Management | Full hierarchy rules, interactive Gantt, dependencies, baseline approval/history/variance, forecasting, advanced milestone confirmations. | Project schedule, progress and scope variance usable in customer reviews. |
| R3 — AI & Automation | Cursor/GitHub/Actions import, AI drafts, data-informed summaries, advanced report review and recurring analysis inputs. | On-demand AI-assisted report lifecycle is auditable. |
| R4 — Recovery & Governance | Selective descendant restoration, bulk partial success, inline conflict retries, advanced document diff/activation and governance features. | Rich recovery without overwriting active work. |

## 3. Workstreams and implementation order

### 01 — Foundation & Security

- Initialize repo, branching, CI pipeline, IaC and isolated dev/staging/prod environments
- Create Cognito pool, user invitation, MFA and membership checks
- Implement tenant-scoped API conventions, auth middleware and logging
- Build React shell, responsive navigation and protected routes
Exit gate: Admin can invite a customer user who sees only their customer/project.

### 02 — Portal & Application Directory

- Build customer/project CRUD for admins
- Build tile-based application directory and Project Overview
- Protect all linked Lambda apps against direct endpoint bypass
- Set up project health and notes with auditing
Exit gate: A customer can securely launch one authorized existing Lambda app.

### 03 — Documents & Audit

- Create private S3 bucket/prefix policy and signed access
- Implement upload/download/folders and core versions
- Implement Recycle Bin and individual restore
- Add append-only audit events and verification tests
Exit gate: Customer can upload, retrieve, version and restore a document.

### 04 — GitHub, Project Plan & Kanban

- Register GitHub App, access private customer repo/Project
- Persist exact project and item IDs
- Webhook processing, idempotency, reconciliation and visible sync results
- Deliver issue table, basic dates, effort fields, Kanban state updates
- Calculate effort-weighted progress and manual explained override
Exit gate: Portal and GitHub remain coherent across tested inbound/outbound edits.

### 05 — Status Reports

- Create draft author/edit/review/publish workflow
- Implement approval, publication history and Project Overview integration
- Test authorization and audit trail
Exit gate: A customer can publish a reviewed on-demand report.

### 06 — Pilot & Production Readiness

- Threat model tenant separation and portal-to-Lambda access
- Execute recovery, migration and GitHub failure tests
- Accessibility and mobile-responsive verification
- Monitor and alert on critical integrations
- Pilot with one test customer and retire associated Confluence links
Exit gate: Pilot operates end-to-end safely and supportably.

## 4. Architecture build decisions

- React/TypeScript frontend on Amplify; APIs through API Gateway and Lambda; Cognito; DynamoDB; S3. Infrastructure as code recommended.
- Backend-driven customer/project access. Separate the GitHub synchronization worker from request/response APIs.
- Use a GitHub App, reliable queue, webhook validation, retries, dead-letter queue and scheduled reconciliation.
- One repo per customer and one GitHub Project per customer project; avoid giving customers GitHub credentials merely to use the portal.
- Model baseline approval and immutable snapshots for Release 2 from day one by reserving stable entity IDs and audit conventions.
## 5. Quality gates before first customer

- Cross-tenant reads/writes fail for APIs and S3 objects.
- MFA works; admin permissions and customer employee collaboration behave as intended.
- Direct application endpoint access cannot bypass authentication.
- GitHub updates are idempotent, auditable, recoverable from missed webhooks and visible when pending or failed.
- Document versions and basic soft-delete/restore work.
- Manual status reports can be reviewed, approved, published and retrieved.
- Backup restore and rollback procedure are rehearsed; monitoring and alerts tested.
## 6. Suggested project operating rhythm

Use GitHub Projects for Epics, outcomes and small user stories. Slice work into independently testable capabilities with acceptance criteria. Work in one- or two-week delivery increments if helpful; avoid a speculative fixed completion date before estimating scope and developer availability. Track architecture decisions as ADRs and update the living specification as implementation discoveries arise.

## 7. Dependencies and risks

| Risk | Mitigation |
| --- | --- |
| Direct Lambda endpoint bypass | Inventory API Gateway URLs, Lambda URLs or CloudFront patterns; enforce auth at each resource, not merely on portal links. |
| GitHub data divergence | Webhook signature validation, queues, idempotency, reconciliation, per-item sync status and retries. |
| Cross-tenant leaks | Automated authorization, query and S3 object access tests. |
| GitHub Project capability gaps | Define AWS-side representation and explicit field mapping; validate native API behaviors early. |
| MVP scope creep | Protect the six exit gates; move advanced Gantt/baselines/AI/bulk recovery into later release backlog. |
| Audit and storage costs | Define operational metrics, alarms, backups, retention and cost alerts early. |
