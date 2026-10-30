# Beginner guide — Staff vault

Use this when you want a **cited status draft** from a Compass project. The staff vault is a copy of one program plus the files you file on it. Customers never see the vault. A draft does **not** change issue dates, status, or any other live plan field.

**Related:** [Documents and labeling](faq:documents-labeling) · [Install & Use MCP](faq:install-use-mcp) (administrators)

Operator steps with API examples stay in `docs/sop/staff-vault.md`. This page is the in-app walkthrough.

---

## Who can use this?

| Role | What you can do |
| --- | --- |
| **View** | Read this guide. You cannot label files, allowlist, ingest, or draft from the vault. |
| **Contributor** | Upload documents. You cannot set a vault source label, allowlist, ingest, or draft from the vault. |
| **Administrator** | Set vault source labels, allowlist the project, run ingest, and draft from the vault. Approve and publish are administrator actions. |

Everyone who is signed in can open this tile. The buttons live only on an administrator account.

---

## Concepts in one minute

| Term | Meaning |
| --- | --- |
| **Staff vault** | A rebuildable staff copy of one allowlisted project. The live plan stays in Compass. |
| **Source label** | Administrator tag on a document. Unlabeled files stay out of the vault. |
| **Allowlist** | Turns the vault copy on for this project. Off means nothing from this project is copied. |
| **Ingest** | Copies the current plan and labeled files into the vault. A new ingest **replaces** the previous copy for this project. |
| **Draft from vault** | Creates a normal status report in **draft**, with citations. You still review it before publish. |

The copy includes work items, milestones, risks, people (assignees), and decisions (issues whose type is **Decision**), plus labeled files that have a stored current version.

---

## 1. File the evidence

1. Open the project → **Documents**.
2. Upload the file and wait until it has a current version (for example `v1`).
3. As an administrator, set **Vault source label** on each file that should be citable:

| Label | Use when |
| --- | --- |
| `compass-upload` | Notes, specs, or other text you uploaded in Compass |
| `krisp` | A Krisp transcript export filed on this project |
| `fireflies` | A Fireflies transcript export filed on this project |
| `other` | Another staff-chosen text file |
| **No vault label** | Keep the file out of the vault and out of drafts |

Leave the label empty to exclude a file. Soft-deleted files are excluded. Text, markdown, CSV, and JSON can be searched as stored. Excel `.xlsx` is searched as CSV, and Word `.docx` and email `.eml` are searched as Markdown. The uploaded file stays unchanged. Screenshots, video, and older `.xls`, `.doc`, and `.msg` files can be labeled and still produce no searchable text.

Live Krisp or Fireflies connections are not part of this release. Export the file, upload it, and label it.

---

## 2. Allowlist the project

1. Stay on **Documents**.
2. In **Staff vault** (administrators only), turn on **Allowlist this project for vault ingest**.

Turning the allowlist **on** starts a background copy of that project. Turning it **off** stops future copies and does not run ingest. A failed background copy does not undo the allowlist; use **Run vault ingest** if you need to try again.

---

## 3. Ingest

**Run vault ingest** copies the plan, the Decision register, and labeled files immediately and shows how many rows, relations, and chunks were saved. Use it when you want the vault refreshed now.

Compass also copies an allowlisted project in the background when:

- A labeled upload finishes
- An administrator sets or changes a vault source label on a file that already has a stored version
- An administrator turns the allowlist on
- About every 15 minutes, so plan-only edits (issues, risks, people, the Decision register, and plan items whose type is Decision) land without a new document upload

Background ingest is best-effort. If a draft looks stale, click **Run vault ingest**.

---

## 4. Draft a cited report

1. Open the project → **Reports**.
2. Under **Draft from vault**, type a **Question** (what the draft should answer).
3. Click **Draft from vault**.
4. Compass opens a new report in status **draft**. Read the citations before you treat it as an update.
5. If nothing filed supports the question, the body is exactly: `No filed source supports that.` That is an empty result, not a finished status update.

Citations name the source label, document, and version. Claims about plan work name the issue.

Ingest also copies each Decision register record. The record keeps its decision id, the title is the statement, and the body includes the current fields plus every comment and every history event. A draft claim about that record names the decision id and does not use a document source label. Plan items whose type is Decision are still copied. The live plan is not modified.

---

## 5. Review and publish

1. Edit the draft if needed, then **Save draft**.
2. **Submit for review**.
3. An administrator chooses **Approve**, then **Publish**.
4. Publish stores a fixed copy. To change it later, start a revision. That opens a new draft and leaves the published copy as it was.

Publish still does not write dates or status back onto the live plan.

---

## End-to-end checklist

- Signed in as an administrator
- Evidence uploaded, with a current version
- Each citable file has a vault source label
- **Allowlist this project for vault ingest** is on
- **Run vault ingest** finished, or a background copy has run
- **Draft from vault** opened a report (or the “no filed source” message)
- A person checked the citations
- Approve and publish used the normal report steps

---

## Common mistakes

| What you see | What to do |
| --- | --- |
| No **Staff vault** panel or **Draft from vault** | Sign in as an administrator |
| Ingest says the project is not allowlisted | Turn on **Allowlist this project for vault ingest**, then run ingest again |
| Ingest reports 0 chunks | Label a stored text, `.xlsx`, `.docx`, or `.eml` file and ingest again |
| Draft says “No filed source supports that.” | Widen the question, confirm the file is labeled and current, then ingest again |
| A plan edit is missing from the draft | Run **Run vault ingest**, or wait for the 15-minute refresh |
| You expected the live issue dates to change | The vault draft never edits the live plan |
