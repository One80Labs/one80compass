# Beginner guide — Dependencies and Blockers

This guide explains how to link tasks on the **Project Plan** so the schedule shows what must finish (or start) before something else can proceed.

You do **not** need to know GitHub Projects or DynamoDB. Everything below is done in the Compass browser UI.

**Related:** [Timeline / Gantt basics](faq:timeline-gantt) · [Critical path](faq:critical-path) · [Plan hierarchy](faq:plan-hierarchy) · [Baselines](faq:baselines)

---

## Who can use this?

| Role | What you can do |
| --- | --- |
| **Contributor** or **Administrator** | Create, edit, and remove links; set lag and link kind; opt into auto-reschedule |
| **View** | See links, dependency lines, and warnings; cannot change them |

---

## Concepts in one minute

| Term | Meaning |
| --- | --- |
| **Soft Dependency** (blue) | A visual “relates to” link. It does **not** change schedule rules, conflicts, or GitHub `blockedBy`. |
| **Hard Blocker** (red) | A real schedule constraint. The later task must respect the earlier task’s dates. Syncs with GitHub `blockedBy` when the project still uses GitHub. |
| **Lag / lead** | Extra days after (lag) or before (lead) the normal constraint day. Only Hard Blockers. Default is **0**. |
| **Link kind** | How the two bars constrain each other: **FS** (finish-to-start, default), **SS**, **FF**, or **SF**. Only Hard Blockers. |
| **Dependency review** | A dialog that lists proposed date moves for later tasks. You Approve or Keep the later dates. |

---

## Soft Dependency vs Hard Blocker

| | Soft Dependency | Hard Blocker |
| --- | --- | --- |
| Color on Timeline | Blue | Red |
| Affects schedule conflicts | No | Yes |
| Appears in critical path | No | Yes |
| Lag / link kind | No | Yes |
| Auto-reschedule option | No | Yes (optional) |

Use a **Dependency** when you only want a reminder line. Use a **Blocker** when the later work truly cannot start (or finish) until the earlier work meets the rule.

---

## Create a link on the Timeline

1. Open **Project Plan** → **Timeline view**.
2. Turn on **Dependency lines** if you want to see all connectors (optional — see [Timeline / Gantt](faq:timeline-gantt) for hover-reveal when lines are off).
3. On a scheduled bar, drag from the **link handle** on the right end of the bar to another task’s bar.
4. In **Link these tasks**, choose:
   - **Dependency** — soft link only, or
   - **Blocker** — Hard Blocker.
5. For a Blocker you can also set **link kind** (FS / SS / FF / SF) and **lag days** (use a negative number for lead).
6. Confirm. The connector appears when dependency lines are shown (or on hover when they are hidden).

If the link would loop (A blocks B blocks A), Compass refuses it.

---

## Edit or remove a link

1. With **Dependency lines** on, click a connector.
2. In **Task link**, change type, kind, or lag, or choose **Remove link**.
3. Or open **Project Plan** → **Dependencies** and manage **Blocked by** / related rows there (including lag on blockers).

---

## Link kinds (Hard Blocker only)

| Kind | Plain language |
| --- | --- |
| **FS** (default) | Later task **starts** the day **after** the earlier task **finishes** (then apply lag). |
| **SS** | Later task **starts** on or after the earlier task **starts** (then apply lag). |
| **FF** | Later task **finishes** on or after the earlier task **finishes** (then apply lag). |
| **SF** | Later task **finishes** on or after the earlier task **starts** (then apply lag). |

Soft Dependencies always draw finish → start and never use these kinds.

---

## Lag and lead (Hard Blocker only)

- **Lag `2`** means “two extra days after the normal constraint.”
- **Lead `-1`** means “one day earlier than the normal constraint.”
- Leave lag at **0** for classic finish-to-start behavior.

Set lag in the link dialog or on the **Dependencies** tab (blur/save on the lag field).

---

## Optional auto-reschedule when creating a Blocker

By default, creating a Blocker that overlaps later dates **warns only**. Dates do **not** move by themselves.

1. Drag a Blocker link when dates would overlap (or break the FS-style rule).
2. Read the warn message.
3. Optionally check **Also propose moving later tasks** (default is **unchecked**).
4. Create the Blocker.
5. If you opted in and later tasks need moves, the same **Later tasks are affected** dialog used for date edits appears.
6. Choose **Approve the moves** or **Keep the later dates**.

Soft Dependency create never shows this checkbox.

Changing a task’s Start/Finish later can also open that same review dialog — Approve still writes the proposed dates; Keep later dates leaves the overlap visible.

---

## Where else links show up

- **Dependencies** tab — list and manage blockers and soft links without drawing on the Gantt.
- **Critical path** — only Hard Blockers; see [Critical path](faq:critical-path).
- **Risk Register** — live schedule conflicts from blockers can appear as risks; see [Risk Register](faq:risk-register).

---

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Expected a blue Dependency to push dates | Use a **Blocker**, or drag dates and use dependency review |
| Cannot see any lines | Turn on **Dependency lines**, or hover a bar (hover-reveal) |
| Lag field missing | You chose Soft Dependency — switch to Blocker |
| Review dialog did not appear on create | Leave **Also propose moving later tasks** unchecked by default; check it when you want proposals |
