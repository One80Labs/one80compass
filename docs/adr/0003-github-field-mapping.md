# ADR 0003 — GitHub field mapping for R1

GitHub remains the source of truth for issue title, status, and effort. One80Compass stores a projection plus portal-owned fields: soft delete, health, and the progress override.

A portal project stores a GitHub owner, repository, and project number. Reconciliation reads a repository project with that number when one exists. Otherwise it reads the organization project with that number, and keeps only issues from the mapped repository. The test board `https://github.com/orgs/One80Labs/projects/1` is that second case: owner `One80Labs`, repository `one80compass`, project number `1`.

Until a customer Project uses different names, Project settings default to:

- Status field name: `Status` (single select)
- Effort field name: `Effort` (number)
- Columns: `Todo`, `In Progress`, `Done`
- Done statuses: `Done`

After the first successful sync, board columns are replaced by the GitHub Status options. If the project has no number field named Effort, the number field Estimate is stored as the effort field.

A leaf with an empty effort counts as 1 point inside the progress calculation. That default is not written back to GitHub. Dependencies and dates stay out of R1. The board moves status only; it does not show hierarchy or a Gantt chart.

GitHub milestone titles are copied with the issue and shown read-only on Overview. Target dates, forecasts, and manual confirmation stay in R2.

The browser never receives the GitHub App private key or installation token. The webhook secret stays on the API Lambda.
