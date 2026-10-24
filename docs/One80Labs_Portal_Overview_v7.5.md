# One80Labs Portal — consolidated overview

Version 7.5 planning package | 2026-10-24

## Mission
Replace Confluence with a secure multi-customer application and project workspace. Four project apps: Project Plan, Kanban Board, Documents and Status Reports; Project Overview and Recycle Bin support them.

## Confirmed tenancy
One80Labs administrators manage customers and projects. Customer employees collaborate across all projects in their own customer organization by default. Server-side authorization is mandatory; permanent deletion is admin-only.

## Source of truth
GitHub Issues/Projects: live work and native fields. DynamoDB/Cognito: tenant, authorization, approvals and audit. S3: documents and immutable large baseline snapshots. AWS: official published status reports. Baselines are approved immutable AWS snapshots, optional read-only GitHub exports.

## Project Plan rules
Effort-weighted progress counts only active leaf issues attached to the project GitHub Project regardless of type; unestimated leaves count as 1. No leaves → Not Started / No Tasks, no percentage. Manual percentage override requires reason and audit. Parents roll up leaves, auto-complete when descendants all Done, auto-reopen when new or reopened incomplete descendants appear; invalid parent completion blocked. Milestones are manually confirmed and require reason when reopened.

## Baselines
Admin manually creates initial baseline; unscheduled tasks allowed. Employees propose rebaselines, admin approves. Original/current/intermediate immutable versions retained. Classifications: Newly Scheduled (previously unscheduled), Added After Baseline (new issue), Removed Since Baseline (removed issue). Missing baseline dates do not generate fictional date variance.

## Recovery and documents
Indefinite Recycle Bin and document version retention unless admin permanently deletes. Task remove, task restore, leaf reopen, and restored-version activation have optional explanations; manual progress override and milestone reopen explanations mandatory. Bulk restore supports partial success and failed-only retry. Restored document never overwrites current; require explicit activation review; compare supported text formats and metadata otherwise.

## Releases
R1: Secure portal plus basic Documents, Plan, Kanban, Status Reports, soft deletion and audit. R2: interactive Gantt, hierarchy, milestones and baselines. R3: Cursor/GitHub AI-assisted reports. R4: advanced restoration, comparisons and governance.

## Details
See the Product & Technical Specification DOCX and Implementation Plan DOCX for full acceptance and engineering boundaries. GitHub-ready tasks in the CSV file.