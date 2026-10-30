# Beginner guide — Documents and labeling

Use **Documents** to upload files, keep versions, and (when you are an administrator) set a **vault source label** so staff tools can cite the file later.

**Related:** [Install & Use MCP](faq:install-use-mcp) (administrators) · [Plan hierarchy](faq:plan-hierarchy) · [Baselines](faq:baselines)

---

## Who can use this?

| Role | What you can do |
| --- | --- |
| **Contributor** / **Administrator** | Upload, add versions, soft-delete, restore |
| **View** | Browse and open documents they are allowed to see |
| **Administrator only** | Set vault **source labels**; run vault allowlist / ingest / draft (see staff vault SOP) |

Customers never log into the staff vault. Labeling only prepares files for staff AI workflows.

---

## Concepts in one minute

| Term | Meaning |
| --- | --- |
| **Document** | A named file record for the project (folders optional). |
| **Version** | Each upload creates or adds a version (`v1`, `v2`, …). |
| **Recycle bin** | Soft-deleted documents. You can **restore** them. |
| **Source label** | Administrator filing tag. **Unlabeled** files stay out of the staff vault. |

---

## Upload a document

1. Open **Documents**.
2. Stay on **All documents**.
3. Choose **Upload document**.
4. Pick the file and complete the upload until the row shows a current version (for example `v1`).

To add another file on the same document, open it and upload a **new version** (same pattern as the list upload, scoped to that document).

---

## Find, open, and organize

1. Use the search box to filter by name.
2. Use folder crumbs when folders exist for the project.
3. Open a row to download or work with versions on the detail screen.

---

## Soft-delete and restore

1. On **All documents**, move a document to the recycle bin (confirm when asked).
2. Open the **Recycle bin** tab.
3. Choose **Restore** to bring it back.

Permanent deletion is not part of the beginner workflow in this release.

---

## Vault source labels (administrator)

1. On a document row or detail, set the **source label** from the choices your project uses for filing.
2. Leave the label empty to keep the file **out** of the staff vault.
3. After labels (and usually allowlist + ingest), staff can search or draft with citations.

Full staff procedure: see the **Staff vault** SOP in the repo (`docs/sop/staff-vault.md`). Chat-based tools: [Install & Use MCP](faq:install-use-mcp).

Contributors can still upload; they cannot allowlist, ingest, or draft from vault.

---

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Upload stuck / no version number | Finish the upload flow until status is current |
| MCP / vault draft finds no chunks | Label a stored text, `.xlsx`, `.docx`, or `.eml` file, ensure a current version, then ingest (admin) |
| Cannot set a source label | You need the administrator role |
