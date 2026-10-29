# Beginner guide — Plan hierarchy

One80Compass organizes work as a tree: **Epic → Feature → Task** (and optional **Subtask** under a Task). The Timeline and Kanban respect that structure.

**Related:** [Timeline / Gantt basics](faq:timeline-gantt) · [Dependencies and Blockers](faq:dependencies-blockers) · [Baselines](faq:baselines) · [Project Plan ERD](faq:project-plan-erd)

---

## Who can use this?

| Role | What you can do |
| --- | --- |
| **Contributor** / **Administrator** | Add Epics, Features, Tasks, Subtasks; reorder siblings; edit parents |
| **View** | Browse the hierarchy on Timeline, Dependencies, and Kanban |

---

## Concepts in one minute

| Term | Meaning |
| --- | --- |
| **Epic** | Top-level outcome. New Epics use issue type EPIC. |
| **Feature** | Sits under an Epic. |
| **Task** | Delivery work under a Feature (or Epic). |
| **Subtask** | Child of a Task; created with no separate issue type in the add flow. |
| **Workstream** | Project root issue number in settings — not shown as a plan row. |
| **Rolled-up dates** | Parent Start/Finish can come from children once tasks exist under it. |

Action-item keys look like `COMP-12` when a project key is set in Settings → General.

---

## See the tree on Timeline

1. Open **Project Plan** → **Timeline view**.
2. Rows are grouped under Epics; expand/collapse as the UI allows.
3. Search filters the tree but keeps ancestors so you do not lose context.

More chart tips: [Timeline / Gantt](faq:timeline-gantt).

---

## Add work

1. Use **Add Epic**, **Add Feature**, **Add Task**, or **Add Subtask** on the plan (when you can write).
2. Choose the correct **parent** when the drawer asks (Feature under Epic, Task under Feature, Subtask under Task).
3. Fill title and the same kinds of fields you would set in the issue editor (status, dates, assignees when offered).
4. Save. The new row appears under its parent.

---

## Reorder siblings

1. On Timeline, drag a row onto another row that shares the **same parent** and **same kind**.
2. Compass saves the new order among those siblings.
3. You cannot drop a Task under a different Epic with that gesture — change **parent** in the issue editor instead.

---

## Edit parent or type

1. Open the issue (edit control on the row or Kanban card).
2. On Compass-owned projects, the drawer can change parent, type, labels, and blockers.
3. Avoid marking a parent **Done** while active children are still open — Compass blocks that.

---

## How hierarchy relates to links

- Parent/child is **structure**.
- Soft Dependency / Hard Blocker is **sequence**. They are separate. See [Dependencies and Blockers](faq:dependencies-blockers).

---

## Common mistakes

| Mistake | Fix |
| --- | --- |
| New Feature has no Epic | Pick an Epic parent in the add drawer |
| Reorder did nothing | Drop only onto a same-parent sibling of the same kind |
| Parent dates look wrong | Check child task dates — parents may roll up from children |
