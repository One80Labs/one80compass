# ADR 0003 — GitHub field mapping for R1

GitHub remains the source of truth for issue title, status, and effort. One80Compass stores a projection plus portal-owned fields: soft delete, health, and the progress override.

Until a customer Project uses different names, Project settings default to:

- Status field name: `Status` (single select)
- Effort field name: `Effort` (number)
- Columns: `Todo`, `In Progress`, `Done`
- Done statuses: `Done`

A leaf with an empty effort counts as 1 point inside the progress calculation. That default is not written back to GitHub. Dependencies and dates stay out of R1. The board moves status only; it does not show hierarchy or a Gantt chart.

GitHub milestone titles are copied with the issue and shown read-only on Overview. Target dates, forecasts, and manual confirmation stay in R2.

The browser never receives the GitHub App private key or installation token. The webhook secret stays on the API Lambda.
