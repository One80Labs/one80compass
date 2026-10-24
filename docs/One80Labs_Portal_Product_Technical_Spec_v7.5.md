# One80Labs Portal

*Consolidated product & technical specification  |  Version 7.5  |  Proposed phased delivery*

## 1. Purpose and decision record

Build a secure multi-customer portal replacing Confluence as the organized entry point to existing AWS Lambda applications and supporting four integrated project apps: Project Plan, Kanban Board, Documents, and Status Reports. The Project Overview is the project landing page. This specification consolidates confirmed product decisions; release allocations are delivery proposals, not changes to confirmed behavior.

Release approach: phased MVP. Confirmed by product owner on October 24, 2026. Specification baseline: v7.4 requirements plus approved phased delivery (v7.5 planning baseline).

## 2. Personas, tenants and authorization

- One80Labs administrators can manage customers, projects, initial application structures and permanent deletion. Architecture permits more administrators later.
- Customer employees authenticate individually, and by default all employees within an organization may access and collaborate on all that organization’s projects. Project-specific restrictions are a later enhancement.
- Employees may create, edit, soft-delete, restore, comment, approve ordinary content, and act on other employees’ contributions where authorized. Permanent deletion remains admin-only.
- Every API verifies customer membership and project assignment server-side; never rely solely on UI hiding or a client-supplied customer ID.
## 3. User experience and modules

| Module | Confirmed core experience |
| --- | --- |
| Navigation | Collapsible navigation; customer and project selection; tile-based menus; embedded workspace; secured project-specific links to Lambda applications. |
| Project Overview | Aggregates project health, milestones, Kanban, activity, links and editable employee notes. Overall health manually set Green/Yellow/Red; explanation optional; audited. |
| Project Plan | GitHub-connected structured task table and Gantt. Task dates, dependencies, hierarchy, milestones, weighted progress, interactive changes and review for dependent rescheduling. |
| Kanban | Two-way GitHub issue/Project workflow; board and expandable hierarchy view; side-panel issue editing; configured issue types; synchronized comments. |
| Status Reports | On-demand drafts, review/edit/approval, publish, history and previous versions; AI-assisted drafts delivered via Cursor → GitHub → GitHub Actions/Lambda → AWS review. |
| Documents | Secure uploads, metadata, versions, historical restoration, supported-format comparisons, read-only previews and approval to activate restored versions. |
| Recycle Bin | Shared per-project bin with filters, indefinite soft-delete retention, employee restoration, admin-only irreversible deletion, audit trail. |

## 4. Confirmed Project Plan rules

### 4.1 Progress and estimation

- Progress = sum(effective effort of Done active leaf issues) / sum(effective effort of all active leaf issues) × 100. Parent issue estimates do not contribute independently.
- Use a numeric story-point/effort-point field in GitHub Projects. A leaf issue lacking an estimate uses 1 point in the calculation without modifying its GitHub field; mark it as defaulted.
- Count all active leaf issues assigned to the specific GitHub Project, regardless of issue type, including custom types. Exclude archived and soft-deleted issues.
- Show “Not Started / No Tasks” and no percentage if no active leaf issues exist.
- Permit manual progress override with a required explanation, preserving calculated and overridden values, actor, timestamp and historical changes. Manual overall progress is independent of Green/Yellow/Red project health.
### 4.2 Hierarchy and status

- Parents roll up descendant leaf progress. Automatically mark parents Done when all descendants are Done; reopen affected ancestors when an existing leaf reopens or new incomplete child work is added.
- Block manual parent completion while any descendant is incomplete. Employees can mark leaves Done without checklists or mandatory fields.
- Leaf reopening explanation is optional; automatic transitions and initiating issue are audited.
- Milestones are separately managed: manual target date, computed forecast, late indication; once associated work is done mark Ready for Confirmation; employee confirms completion manually. Reopening a completed milestone requires an explanation and preserves completion history.
### 4.3 Scheduling and baselines

- An administrator explicitly establishes immutable Baseline 1 after review; it may include partly or wholly unscheduled tasks, recorded as such.
- Employees may propose future baselines with explanation; administrators approve or reject them. Preserve original, current and all intermediate approved baselines permanently.
- Allow comparisons against original or latest approved baseline. A task initially without dates but later scheduled is “Newly Scheduled” (no invented variance).
- A task absent from the chosen baseline is “Added After Baseline”; a task in the baseline but removed from the active plan is “Removed Since Baseline.” Removed tasks do not count toward current progress.
- Schedule date edits can trigger dependent rescheduling proposals; show preview and obtain approval rather than silently shifting dependents. If rejected, keep dates and flag conflicts.
## 5. Delete, restore and document version rules

- Task removal and restoration explanations are optional. All actions audited; deleted items kept in project Recycle Bin indefinitely until admin permanent deletion. Restored tasks retain their previous completion status.
- Restore a task to its original project and parent if possible; if parent missing, employee may restore original parent, choose another valid active parent or restore at root. Validate hierarchy cycles and project ownership.
- Restoring a deleted parent displays descendants for optional selective restoration. Bulk restoration allows partial success, per-item audit, inline conflict resolution and retry of failed items only.
- A restored document may be renamed or added as a compatible version of an existing document; never directly overwrite the active file. Employee review and explicit activation confirmation are required.
- Provide side-by-side text/Markdown difference for supported formats and metadata comparisons for other formats; explanations on activation are optional. Retain all historical versions until admin explicitly permanently deletes them.
## 6. Storage and source-of-truth architecture

| Data family | Authoritative store | Notes |
| --- | --- | --- |
| Live issues, statuses, estimates and native Project fields | GitHub Issues / Projects | One private repository per customer; one GitHub Project per customer project. GitHub Project membership maps issue to portal project. |
| Customer/project settings, membership and roles | DynamoDB + Cognito | Backend permission checks enforce isolation. |
| Health, overrides, report approvals, Recycle Bin, audit | DynamoDB | Use append-only audit events and retention controls. |
| Documents and binary versions | S3 | DynamoDB indexes versions and metadata. |
| Approved baseline snapshots | DynamoDB + S3 | Immutable version snapshots; S3 for large payloads. Optional read-only GitHub exports. |
| Published reports | AWS | Draft input can originate in GitHub, but AWS holds official published versions. |

## 7. Logical entities

Customer, UserMembership, Project, ApplicationLink, ProjectSettings, ProjectHealthEvent, ProgressOverrideEvent, Document, DocumentVersion, StatusReport, ReportVersion, ApprovalEvent, RecycleBinEntry, AuditEvent, GitHubSyncState, Baseline, BaselineProposal, Milestone and dependency/scheduling metadata. All tenant-scoped records include validated customerId and projectId (where applicable).

## 8. API and integration boundaries

- Frontend: React hosted in AWS Amplify. Cognito authentication; API Gateway + Lambda business services; DynamoDB for metadata; S3 for files and immutable snapshots.
- GitHub App integration with least-privilege permissions; webhooks for incoming activity and GitHub APIs for outgoing updates. Queue ingestion, validate webhook signatures, deduplicate events, retry failures and perform periodic reconciliation.
- Do not expose GitHub App credentials, customer repository data or S3 objects directly to unprivileged browsers. Use short-lived scoped access URLs where appropriate.
- GitHub native models may not fully represent dependencies, soft deletion or all scheduling fields; portal-managed metadata and reconciliation logic bridge the gap.
- Large changes and restoration need idempotency keys, stable identifiers and clear partial-failure results.
## 9. Nonfunctional requirements and acceptance

- Customer A must never access Customer B’s records or files; enforce with automated cross-tenant tests.
- Every important change has actor, time, target, prior/new state and correlation ID; avoid exposing secrets or unnecessarily sensitive content in audit payloads.
- Use encryption at rest and in transit; least-privilege IAM; S3 versioning, backups and recovery tests; MFA for privileged access.
- Monitor Lambda/API error rates, GitHub sync lag and failures, import queues and authentication issues. Provide a visible sync-state indicator and support procedures.
- Usable desktop-responsive UI; keyboard support and accessible labels for major flows.
## 10. Decisions / implementation details still to validate

- Select exact GitHub Projects custom field schema and status-to-Done mapping, including nonstandard workflows.
- Document which metadata lives in GitHub versus AWS, particularly dependency links and milestones; define recovery/reconciliation semantics.
- Confirm protection approach for Lambda application endpoints against direct bypass of portal authorization. A portal link alone does not secure an endpoint.
- Specify file comparison formats, maximum upload sizes and customer storage quotas before advancing Documents enhancements.
- Confirm operational cost envelope, retention/compliance obligations and production environment ownership.
