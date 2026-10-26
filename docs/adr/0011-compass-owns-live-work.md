# ADR 0011 — Compass owns live work

A project stores recordSource. While that value is github, GitHub Issues and Projects remain the source of truth for live work. When recordSource is compass, DynamoDB, the existing portal table, is the source of truth for live work. The git repository, pull requests, and CI stay on GitHub.

This supersedes the source-of-truth sentence in ADR 0003 for compass-owned projects only. A project that is still mapped to GitHub keeps ADR 0003 until it is imported.

Each PlanIssue stores title, description, status, issue type, parent, estimate (field name effort), start date, finish date, iteration, milestone, priority, labels, assignees, comments, and dependencies. Assignees are Compass customer members. Dependencies are predecessorIds: finish-to-start, blocked-by. Other relationships are stored on the issue, each with a kind.

Once recordSource is compass, Compass owns the project catalogs: status values and which of them mean Done, iterations (title, start, and duration), labels, issue types, priority options, and milestones (title and due date). Administrators in the one80-admin group create and edit those catalogs. Contributors cannot.

Import copies a GitHub project once, then sets recordSource to compass. Later Compass edits are not written back to GitHub in this phase.

A later staff vault may copy allowlisted programs and the files filed on them. Those files are Compass uploads, Krisp exports, Fireflies exports, and other artifacts. The vault is Postgres with pgvector. Every vault row keeps customerId. Customers do not log into that vault. That vault is not built in this slice.

Domain rules for hierarchy, schedule, dependencies, baselines, milestones, and progress stay in packages/domain.
