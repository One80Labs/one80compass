# ADR 0009 — Plan rows follow Epic

The project plan is grouped by GitHub issue type. A Workstream is one issue number saved with the project mapping. It is the parent of new Epics and it is not a row on the plan.

An Epic is a GitHub issue whose type is Epic. The name match ignores capitalization, so a type named EPIC is an Epic. A Feature is optional and is a GitHub issue of type Feature under one Epic. An Issue has no GitHub issue type. It nests under a Feature, an Epic, or the Workstream. A Sub-issue has no GitHub issue type and nests under an Issue. Indent is Epic 0, Feature 1, Issue 2, Sub-issue 3, including an Issue that sits directly under an Epic.

Timeline, Gantt, and List use that order. A task with no Epic ancestor is shown under Outside an Epic. The Kanban board stays grouped by status.

Adding a row creates the GitHub issue, sets Epic or Feature when that kind needs a type, links the parent, and adds the issue to the mapped project. A parent is still marked Done in GitHub when every task under it is Done.
