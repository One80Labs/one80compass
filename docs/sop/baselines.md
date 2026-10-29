# Beginner guide — Schedule baselines

A **baseline** is a snapshot of the plan’s tasks and their Start and Finish dates at one moment in time. You use it later to see what was added, removed, or newly scheduled.

**Related:** [Timeline / Gantt basics](faq:timeline-gantt) · [Dependencies and Blockers](faq:dependencies-blockers) · [Plan hierarchy](faq:plan-hierarchy)

---

## Who can use this?

| Role | What you can do |
| --- | --- |
| **Administrator** | Set Baseline 1; approve or reject later proposals |
| **Contributor** | Propose a later baseline (with an explanation) when no proposal is waiting |
| **View** | Open the Baselines tab and read comparisons |

---

## Concepts in one minute

| Term | Meaning |
| --- | --- |
| **Baseline 1** | First approved snapshot. An administrator sets it; it is approved immediately. |
| **Proposal** | A later snapshot waiting for an administrator to approve or reject (needs an explanation). |
| **Approved baseline** | Keeps its number; snapshots are not rewritten after they are saved. |
| **Comparison** | Live plan vs Baseline 1 (**Original**) or the **Latest** approved baseline. |

Tasks with no dates are stored with empty dates. Removed tasks stay out of progress calculations that use the baseline.

---

## Open Baselines

1. Open **Project Plan**.
2. Choose the **Baselines** tab.

---

## Set Baseline 1 (administrator)

1. When there are no approved baselines yet, choose **Set Baseline 1**.
2. Enter a short explanation if asked.
3. Confirm. Baseline 1 appears as **Approved**.

---

## Propose a later baseline (Contributor or Administrator)

1. When Baseline 1 (or later) already exists and nothing is waiting, choose **Propose a baseline**.
2. Enter an **explanation** (required).
3. Confirm. Status shows **Waiting** until an administrator decides.

Only one proposal can wait at a time.

---

## Approve or reject (administrator)

1. Open the waiting **Proposal**.
2. Enter an explanation for the decision.
3. **Approve** — assigns the next baseline number and keeps the snapshot.
4. **Reject** — keeps a record of the proposal but it is **not** a numbered baseline.

---

## Read the comparison

1. Under **Comparison**, pick **Original** (Baseline 1) or **Latest** when both exist.
2. Compass lists differences such as:
   - **Newly scheduled** — had no dates in the snapshot; has both now
   - **Added after baseline** — task not in the snapshot
   - **Removed since baseline** — in the snapshot, no longer on the live plan

Day-count “how many days did this move” variance for already-dated tasks is not the focus of this beginner view — use the labels above to spot scope and scheduling changes.

---

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Cannot set Baseline 1 | Ask an administrator |
| Propose is disabled | A proposal may already be Waiting, or you need write access |
| Expected GitHub to store the baseline | Baselines are Compass portal snapshots |
