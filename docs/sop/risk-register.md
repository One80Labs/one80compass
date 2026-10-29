# Beginner guide — Risk Register

The **Risk Register** on Project Plan tracks schedule and delivery risks. Some rows appear automatically from **Hard Blocker** date conflicts; administrators can edit the written fields.

**Related:** [Dependencies and Blockers](faq:dependencies-blockers) · [Timeline / Gantt basics](faq:timeline-gantt) · [Critical path](faq:critical-path)

---

## Who can use this?

| Role | What you can do |
| --- | --- |
| **Administrator** | Edit risk title, severity, description, cleared date, and notes |
| **Contributor** / **View** | Read the register; Contributors still manage plan dates elsewhere |

---

## Concepts in one minute

| Term | Meaning |
| --- | --- |
| **Live conflict risk** | Created from a Hard Blocker schedule problem (overlap or unscheduled successor). |
| **Severity** | How serious the risk is (for example low / medium / high — use the list in the UI). |
| **Date cleared** | Optional date when the risk is considered cleared. |
| **Notes** | Free-text follow-up for the team. |

Soft Dependencies do **not** create schedule conflict risks.

---

## Open the Risk Register

1. Open **Project Plan**.
2. Choose the **Risk Register** tab.

---

## Read automatic conflict risks

1. If a Hard Blocker leaves a later task overlapping or unscheduled, a risk row can appear for that conflict.
2. Use **Timeline** or **Dependencies** to fix dates or links. See [Dependencies and Blockers](faq:dependencies-blockers).
3. After dates are healthy, clear or update the risk fields if you are an administrator.

---

## Edit a risk (administrator)

1. Open a row’s fields (title, severity, description, date cleared, notes).
2. Save. Title is required.
3. Set **date cleared** when the risk is no longer active; leave notes for the audit trail of what you did.

---

## Tips

- Fix the underlying Blocker or dates first; the register is the story, not the schedule engine.
- Pair with [Critical path](faq:critical-path) when you need to see which blockers drive the longest chain.
- Use [Baselines](faq:baselines) when leadership asks what changed since a frozen plan.

---

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Expected a soft Dependency to create a risk | Only Hard Blocker schedule conflicts feed the live list |
| Cannot edit fields | Ask an administrator |
| Risk still listed after fixing dates | Update or clear the row as admin; refresh the plan |
