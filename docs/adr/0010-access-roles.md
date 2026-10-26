# ADR 0010 — Contributor and View

A customer member is a Contributor or View. A Contributor can edit, add, and upload. View can open the same project screens and cannot change data. An administrator remains a separate Cognito group and can open and change every project.

Access is stored on the membership. The members list and the invitation set it. A membership saved earlier with the role name employee is read as Contributor. The API returns 403 `VIEW_ONLY` for a change from View, including uploads, issue edits, reports, and sync. Hiding a button is not the check.
