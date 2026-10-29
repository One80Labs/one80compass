# Beginner guide — Timeline / Gantt basics

The **Timeline view** is the Gantt-style chart on **Project Plan**. Use it to see when work sits on the calendar, drag dates, and show dependency connectors.

**Related:** [Dependencies and Blockers](faq:dependencies-blockers) · [Critical path](faq:critical-path) · [Plan hierarchy](faq:plan-hierarchy) · [Baselines](faq:baselines)

---

## Who can use this?

| Role | What you can do |
| --- | --- |
| **Contributor** / **Administrator** | Drag bars, create links, edit issues from the timeline |
| **View** | Scroll, search, toggle lines and critical path; cannot change dates or links |

---

## Concepts in one minute

| Term | Meaning |
| --- | --- |
| **Bar** | A task’s Start–Finish on the chart. No dates → no bar (or a placeholder row only). |
| **Dependency lines** | Global toggle for all Soft Dependency and Hard Blocker connectors. |
| **Hover-reveal** | When lines are **off**, hovering a bar temporarily shows **that** bar’s connectors and linked bars. |
| **Critical path** | Separate toggle that highlights the longest Hard Blocker chain. See [Critical path](faq:critical-path). |

---

## Open the Timeline

1. Open **Project Plan**.
2. Stay on **Timeline view** (first tab).
3. Use search (after a few characters) to filter rows; matching ancestors stay visible.

The plan is grouped by hierarchy (Epic → Feature → Task). See [Plan hierarchy](faq:plan-hierarchy).

### Expand or collapse an Epic

Epics start **collapsed** so the chart stays short.

1. Click the **orange dot** to the left of the Epic name to expand its Features and tasks.
2. Click the same dot again to collapse them.
3. Your expanded Epics are remembered in this browser.
4. A Timeline search that matches work under a collapsed Epic temporarily shows those rows.

---

## Move dates on a bar

1. Confirm you can write (Contributor or Administrator).
2. Drag the **middle** of a bar to move Start and Finish together, or use the ends to resize when the UI allows.
3. If later Hard Blockers would overlap, Compass may open **Later tasks are affected**.
4. **Approve the moves** or **Keep the later dates**.

Soft Dependencies never drive that review. Details: [Dependencies and Blockers](faq:dependencies-blockers).

---

## Dependency lines and hover

1. Click **Dependency lines** to show every connector.
2. Leave it **off** for a cleaner chart; **hover** a bar to peek at its links (blocker and soft).
3. Click a visible connector (when lines are on) to edit or remove the link.

---

## Critical path toggle

Use **Critical path** beside **Dependency lines** to highlight the longest Hard Blocker path. Soft links are ignored. Full guide: [Critical path](faq:critical-path).

---

## Common mistakes

| Mistake | Fix |
| --- | --- |
| No bars appear | Set Start and Finish on the issue (or add child tasks that roll dates up) |
| Drag does nothing | You may be View-only, or the row’s dates are derived from children |
| Hover shows nothing | That task has no links yet |
