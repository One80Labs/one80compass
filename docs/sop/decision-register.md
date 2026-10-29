# Beginner guide — Decision Register

The **Decision Register** tracks outstanding questions and the decisions those questions become. Each item can stay tied to one Epic, Feature, or Task on the project plan.

A question and the decision it becomes are the same record. Changing **Kind** from Question to Decision keeps that record. It does not create a second row, and it does not create a plan issue.

**Related:** [Plan hierarchy](faq:plan-hierarchy) · [Risk Register](faq:risk-register)

---

## Who can use this?

| Role | What you can do |
| --- | --- |
| **View** | Read the register, open a row, read the source and history, and read Suggestions |
| **Contributor** | Add and update items, add comments, mark a duplicate, and accept or dismiss a suggestion |
| **Administrator** | Everything a contributor can do, plus archive an item (a reason is required) |

Contributors and administrators can also open the linked work item’s plan edit drawer from the register.

---

## Concepts in one minute

| Term | Meaning |
| --- | --- |
| **Question** | Something the team still needs answered. It can hold an answer. |
| **Decision** | The choice a question became. It records an outcome, a rationale, and who decided. |
| **Outstanding** | Still open. This is the list you see first. |
| **Resolved** | Answered or decided, and kept so you can read it later. |
| **Duplicate** | The same topic as another item. It points at the surviving item. |
| **Archive** | Removed from the working list. An administrator must give a reason. |
| **Target date** | The date to answer or decide by. Shown as mm-dd-yyyy (example: 10-22-2026). |
| **Overdue** | Outstanding, and the target date is before today. |
| **Affects** | What the item touches: Requirements, Direction, Timeline, Functionality, Resources. |
| **Blocks the work** | This outstanding item is in the way of the linked Epic, Feature, or Task. |
| **Work item** | The one Epic, Feature, or Task this row is about. |
| **Type 1** | A decision that is hard to undo. |
| **Type 2** | A decision that can be reversed. |

Type 1 and Type 2 apply only to decisions.

---

## Open the Decision Register

1. Select the project in the sidebar.
2. Choose **Decision Register** (it sits under **Project Plan**).
3. You can also open it from the **Decision Register** tile on the project home.

The page is a filterable list. It is not a board.

---

## Counts and Assigned to me

The header counts outstanding items, how many of those are overdue, and how many are blocking the linked work.

**Assigned to me** lists outstanding items assigned to you. Overdue items are first, then items by target date. Click a row to open it.

**Suggestions** sits between Assigned to me and the register. It lists remarks already labeled in Krisp or Fireflies transcripts in the vault. Accept adds a register row. Dismiss leaves the remark off the register. Neither creates an Epic, Feature, or Task.

---

## Suggestions

A suggestion is text wrapped in a mark inside a transcript that is already in the vault. The register does not connect to Krisp or Fireflies live.

Put the whole mark in one stretch of the transcript:

`[suggestion kind=question work="Decision Register" assignee="Ada Lovelace" date=2026-10-29 speaker="Ada" at=12:04] Should we keep the inbox separate? [/suggestion]`

| Attribute | Meaning |
| --- | --- |
| `kind` | Required. `question` or `decision`. A mark without a kind is skipped. |
| `work` | The work-item key (`COMP-79`) or the exact title. A match links the row. No match leaves the label as text. |
| `assignee` | A project member’s name or email. A match fills the assignee. |
| `date` | Target date as `YYYY-MM-DD`. The screen shows it as mm-dd-yyyy. A bad date is ignored. |
| `speaker` | Who said it. Stored on the source. |
| `at` | Where it sits in the transcript, such as a timestamp. |
| `label` | Omit it, or use `proposal`, for a normal suggestion. `hypothetical`, `rejected`, `already-rejected`, or `discussed` cannot be accepted. Any other label is treated as only discussed. |

View can read the quote, the source file, and the note (Hypothetical, Already rejected, or Only discussed). Contributors and administrators see **Accept** on a normal suggestion and **Dismiss** on every suggestion.

**Accept** opens a short form: statement, kind, work item, one assignee, and target date. The statement starts as the quote. If you change it, the register keeps the original quote as **Original suggestion** and records who accepted it. Accept does not create a plan issue.

**Dismiss** removes that remark from the inbox. It does not create a row. Editing the quote in the transcript later is a new suggestion.

An empty inbox says **No suggestions from labeled transcripts.** That is also what you see when the project is not on the vault allowlist.

---

## Filter the register

The register opens on **Outstanding**. Use the filters above the table. They combine.

| Filter | Choices |
| --- | --- |
| **Status** | Outstanding, Resolved, Duplicate, Archive, All statuses |
| **Kind** | All kinds, Question, Decision |
| **Assignee** | All assignees, or one person |
| **Blocking** | All, or Blocking |
| **Overdue** | All, or Overdue |

**Add** sits on the right of that row. Viewers do not see **Add**.

When the default filters match nothing, the table says **No outstanding items.** After you change a filter, an empty table says **No items match these filters.**

---

## Read the table

Each row shows:

| Column | What you see |
| --- | --- |
| **Statement** | The question or decision, in one line |
| **Kind** | Question or Decision |
| **Status** | Outstanding, Resolved, Duplicate, or Archive |
| **Assignees** | People on the item |
| **Target date** | mm-dd-yyyy. Overdue rows also say **Overdue** and use the warning highlight |
| **Affects** | The areas you checked on the item |
| **Work item** | The linked Epic, Feature, or Task. A dash means none is linked |

Click the row to open the item.

The pencil to the left of the **Work item** name opens that item’s edit drawer on the project plan (the same drawer you use from the Timeline or Kanban). Clicking the work item name, or anywhere else on the row, still opens the decision. Viewers see the name without the pencil.

---

## Add an item (contributor)

1. Choose **Add**.
2. Write the **Statement**. It is required.
3. Leave **Kind** as Question, or set it to Decision if the choice is already made.
4. Set **Status** to Outstanding or Resolved.
5. Set **Raised by**, **Raised on**, **Assignees**, **Needed from**, and **Target date**.
6. Check any **Affects** areas that apply.
7. Check **Blocks the linked work** when this outstanding item is in the way of the plan item.
8. Choose one **Work item**, or leave **No work item**.
9. Record a **Source** when you have one: kind (Manual, Document, Email, Transcript, or Teams), quote, speaker, location, when, and a document from this project.
10. For a question, write the **Answer** when you have it. For a decision, fill the decision fields below.
11. Save.

Dates you type in a date field are stored as a calendar day. The register shows them as mm-dd-yyyy.

---

## Turn a question into a decision

1. Open the question.
2. Change **Kind** to **Decision**.
3. Write the **Outcome** and **Rationale**.
4. Set **Decision type** to **Type 1 — hard to undo** or **Type 2 — reversible**, or leave it unset.
5. Set **Decided by** and **Decided on**.
6. Use **Consulted**, **Assumptions**, **What would change this decision**, and **What this decision does not mean** when the team needs that record.
7. Set **Status** to **Resolved** when the decision is made, or leave it **Outstanding** while it is still open.
8. Save.

Kind stays Decision after you save. The same row is updated. A second register item is not created.

---

## Comments and history

Contributors can read comments on an open item and add one with **Add comment**.

**History** lists changes to status, kind, assignee, target date, outcome, rationale, the work-item link, and the moment a question became a decision. Each line names who changed it and when.

---

## Mark a duplicate (contributor)

1. Open the repeat item.
2. Under **Duplicate of**, choose the item that should remain.
3. Choose **Mark as duplicate**.

Open the surviving item when you need the decision itself. The duplicate points at that item.

Archived items are not offered as the surviving item.

---

## Archive an item (administrator)

1. Open the item.
2. Enter an **Archive reason**.
3. Choose **Archive**.

The register will not archive the item without a reason. To see archived rows, set **Status** to **Archive**.

---

## On the plan edit screen

Open an Epic, Feature, or Task from the project plan. When register rows point at that work item, the edit drawer shows a count, such as **1 Decision Register row** or **3 Decision Register rows**.

- One linked row: click the count to open that item beside the work item.
- More than one: each statement is its own button, with space between them. Click a statement to open that item beside the work item.

The work item drawer shifts left and the decision drawer opens on the right, so both stay on screen. Closing one drawer leaves the other open. Closing the work item leaves the question or decision on screen by itself. Closing the question or decision leaves the work item drawer open. Each drawer asks only about its own unsaved edits. Clicking the dimmed page closes the decision drawer and leaves the work item open.

When an outstanding item blocks that work, the drawer says **An outstanding decision blocks this work.**

From the register, the pencil beside the **Work item** name opens this same plan edit drawer.

---

## What this screen does not do

- There are no email alerts when a target date passes. Overdue items are marked on the register.
- A transcript remark does not enter the register until a person accepts it. Accept does not create a plan issue.
- Linking a work item does not create an Epic, Feature, or Task.
- Source kinds (Email, Transcript, Teams) are a label you record. The register does not connect to those systems. Suggestions read Krisp and Fireflies text that is already in the vault.

---

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Looked for decisions on the Project Plan page | Open **Decision Register** in the sidebar. The plan edit screen shows a count and a blocking warning |
| Clicked the work item name and expected the plan drawer | Use the pencil to the left of the name. The name and the rest of the row open the decision |
| Expected a duplicate to stand on its own | Open the surviving item the duplicate points at |
| Cannot archive | Ask an administrator, and include the reason you want recorded |
| Waited for an email when a target date passed | Check the register. Overdue items are marked there |
| Changed filters and the list looked empty | Set **Status** back to **Outstanding**, or choose **All statuses** |
| Tried to turn a decision back into a question | Kind stays Decision after the change. Add a new question if you need one |

---

## Revision

| Date | Change |
| --- | --- |
| 2026-10-29 | Initial beginner guide for the Decision Register |
| 2026-10-29 | Filters, work-item pencil, comments, history, and the plan edit drawer |
