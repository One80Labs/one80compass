# ADR 0009 — Plan rows follow Epic

The project plan is grouped by GitHub issue type. A Workstream is one issue number saved with the project mapping. It is the parent of new Epics and it is not a row on the plan.

An Epic is a GitHub issue whose type is EPIC. The name match ignores capitalization. A Feature is optional and is a GitHub issue of type Feature under one Epic. A Task is a GitHub issue of type Task. It nests under a Feature, an Epic, or the Workstream. A Subtask has no GitHub issue type and nests under a Task. Indent is Epic 0, Feature 1, Task 2, Subtask 3, including a Task that sits directly under an Epic.

The Timeline uses that order. A task with no Epic ancestor is shown under Outside an Epic. The Kanban board stays grouped by status.

Adding a row creates the GitHub issue, sets the issue type to EPIC, Feature, or Task, and sends the same GitHub fields the edit drawer uses for that type: description, status, effort, iteration, assignee, comments, and Start and Finish. An Epic or Feature keeps the dates entered at creation until a Task or Subtask is added under it. Then those dates are replaced by the span of those tasks. A Subtask is created with no type. A parent is still marked Done in GitHub when every task under it is Done.
