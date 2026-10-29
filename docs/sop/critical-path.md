# Beginner guide — Critical path

This guide shows how to highlight the **critical path** on the Project Plan Timeline — the longest chain of **Hard Blocker** work that drives how long the schedule takes.

**Related:** [Dependencies and Blockers](faq:dependencies-blockers) · [Timeline / Gantt basics](faq:timeline-gantt) · [Baselines](faq:baselines)

---

## Who can use this?

Everyone who can open **Project Plan** (View, Contributor, Administrator). The toggle only changes what **you** see; it does not edit dates.

---

## Concepts in one minute

| Term | Meaning |
| --- | --- |
| **Critical path** | The longest Hard Blocker chain by schedule length (task durations plus any lag). |
| **Hard Blocker** | Red schedule link. Soft (blue) Dependencies are **ignored**. |
| **Highlight** | Critical bars get a deep-red inset ring; critical blocker edges darken when dependency lines are on. |

Unscheduled tasks (missing Start or Finish) are skipped. Soft links never participate.

---

## Turn critical path on

1. Open **Project Plan** → **Timeline view**.
2. In the Timeline toolbar, click **Critical path** (next to **Dependency lines**).
3. Bars on the critical path highlight. Turn the button off to clear the highlight.

Your choice is remembered in this browser (`localStorage`).

Tip: turn on **Dependency lines** as well if you want to see which red connectors sit on that path. See [Timeline / Gantt](faq:timeline-gantt).

---

## How to read it

- Highlighted work is on a longest path through the **blocker** graph.
- Shortening a critical task (or its lag) is what usually shortens the overall schedule.
- Blue soft Dependencies do not affect this calculation — convert to a Blocker if the link should matter. See [Dependencies and Blockers](faq:dependencies-blockers).

---

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Nothing highlights | Add Hard Blockers and give tasks Start and Finish dates |
| Expected a soft Dependency on the path | Soft links are excluded by design |
| Highlight disappeared next visit | Toggle **Critical path** on again (preference is per browser) |
