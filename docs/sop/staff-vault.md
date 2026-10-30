# SOP — Staff vault

How One80 staff use the Compass staff vault: file evidence on a program, copy that program into Postgres, and draft a cited status report. Customers do not log into the vault. The live plan stays in Compass (DynamoDB). The vault is a rebuildable staff copy.

**Audience:** One80 administrators (`one80-admin` Cognito group).  
**Site:** https://one80compass.ai  
**In the app:** Sidebar → **FAQ** → **Staff vault** (`docs/sop/staff-vault-user-guide.md`).  
**Related:** [ADR 0012](../adr/0012-staff-vault.md)

---

## What the vault is for

| In Compass (live) | In the vault (staff copy) |
| --- | --- |
| Plan, issues, dates, catalogs | Copied work items, milestones, and Decision register records for one allowlisted program |
| Documents in S3 | Only files that have a vault source label and a stored current version |
| Status reports (draft → publish) | Draft text built from vault work items, Decision register rows, and filed chunks, with citations |

The draft does **not** change issue dates, status, or any other live plan field. Publish still uses the normal report review flow.

Ingest also copies the risk register, people, and the Decision register. Each register record keeps its decision id. The title is the statement. The body includes the current fields plus every comment and every history event. A linked work item becomes a decided relation from the decision to the work item. A duplicateOfId becomes a supersedes relation from the surviving decision to the duplicate. A plan item whose type is **Decision** is still stored as a decision.

---

## Roles and access

| Who | Can |
| --- | --- |
| Administrator (`one80-admin`) | Set document source labels, allowlist a project, run ingest, draft from vault |
| Contributor / View | Upload and open documents; cannot allowlist, ingest, or draft from vault |

Every vault row keeps `customerId` and `programId` (the Compass project id). Retrieval and drafts drop rows that belong to another customer or program.

---

## Prerequisites

1. Sign in at https://one80compass.ai as an administrator.
2. Open the Compass project you want in the vault (usually a Compass-owned project after import).
3. Have the files you want cited uploaded under **Documents**, with a current stored version (upload finished / status current).

---

## Procedure

### 1. Label evidence on Documents

1. Open the project → **Documents**.
2. For each file that should be searchable or citable, set **Vault source label**:

| Label | Use when |
| --- | --- |
| `compass-upload` | Ordinary Compass upload (notes, specs, decks as text-capable files) |
| `krisp` | Krisp transcript export filed on this project |
| `fireflies` | Fireflies transcript export filed on this project |
| `other` | Other staff-chosen artifact |
| *No vault label* | File stays out of the vault and out of drafts |

3. Save/leave the label selected (the documents table control patches the document).

**Rules that keep a file out of the vault**

- No source label (or label cleared)
- Soft-deleted document
- No current version, or version still pending upload
- Document belongs to another customer
- Searchable text comes from text, markdown, CSV, and JSON as stored. On ingest, `.xlsx` is read as CSV (one block per sheet, saved cell values) and `.docx` and `.eml` are read as Markdown. The file in Documents is not replaced. Images, video, `.xls`, `.doc`, and `.msg` do not produce chunks.

Live Krisp or Fireflies API sync is out of scope; file exports manually and label them.

### 2. Allowlist the program

Only allowlisted programs are copied.

**UI (preferred):** Open the project → **Documents** → **Staff vault** (administrators only). Toggle the program onto the allowlist.

**API:** An administrator can also call the API with a Cognito ID token:

```bash
# Replace TOKEN and PROJECT_ID
curl -sS -X PUT \
  "https://2ao8v0fqii.execute-api.us-east-2.amazonaws.com/projects/PROJECT_ID/vault-allowlist" \
  -H "authorization: Bearer TOKEN" \
  -H "content-type: application/json" \
  -d '{"enabled":true}'
```

Expected: `200` with `customerId`, `programId`, and `enabled: true`.  
Non-admin: `403`. Unknown project: `404`.

To remove the program from the allowlist, send `"enabled":false` (or turn the toggle off in Documents → Staff vault).

### 3. Ingest the program into the vault

**Auto-ingest (allowlisted programs):** Compass re-ingests an allowlisted program in the background:

- Upload completes (`…/versions/{versionId}/complete`) **and** the document already has a vault source label
- Document `sourceLabel` is set or changed to a vault label while a stored current version exists
- An administrator enables the program on the allowlist (`"enabled":true`). Disabling (`"enabled":false`) does not ingest.
- Every 15 minutes, EventBridge rule `VaultIngest` re-ingests every allowlisted program (plan, risks, people, Decision register records, plan items whose type is Decision, and already-filed documents) so plan-only edits land without a document upload. The sweep replaces prior vault rows for that program. One program failure does not stop the others. An empty allowlist is a no-op.

Auto-ingest is best-effort: a vault failure is logged and does **not** fail the upload, label, or allowlist API. Manual `POST …/vault-ingest` remains the way to force a refresh immediately.

**Manual ingest:** After labels and allowlist are set (or anytime you want to force a refresh immediately), run ingest. This replaces prior vault rows for that program (work items, milestones, Decision register records, filed files, chunks).

```bash
curl -sS -X POST \
  "https://2ao8v0fqii.execute-api.us-east-2.amazonaws.com/projects/PROJECT_ID/vault-ingest" \
  -H "authorization: Bearer TOKEN" \
  -H "content-type: application/json" \
  -d '{}'
```

Expected: `200` with `rowCount`, `relationCount`, and `chunkCount`.  
If the project is not allowlisted: `409` with message that the project is not on the vault allowlist.

**When to re-ingest manually**

- When you need the vault refreshed immediately, instead of waiting for the 15-minute `VaultIngest` sweep. Plan-only edits are included in that sweep. Enabling the allowlist also best-effort ingests that program.
- If auto-ingest was skipped (project not allowlisted yet) or appears stale in drafts

### 4. Draft a cited status report

1. Open the project → **Reports**.
2. Under **Draft from vault**, enter a **Question** (what the draft should answer).
3. Click **Draft from vault**.
4. Compass creates a normal report in status `draft` and opens it. Citations for filed chunks name the source label, document id, and version id. Work-item claims name the issue id. Decision register claims name the decision id and do not use a document source label.
5. If nothing in the vault supports the question, the body is exactly: `No filed source supports that.` Do not treat that as a finished status update.

### 5. List vault chunks (admin API / MCP)

Administrators can list filed chunks for an allowlisted program (used by the staff vault MCP and curl):

```bash
curl -sS \
  "https://2ao8v0fqii.execute-api.us-east-2.amazonaws.com/projects/PROJECT_ID/vault-chunks" \
  -H "authorization: Bearer TOKEN"
```

Expected: `200` with `{ "chunks": [ ... ] }` (embeddings omitted).  
Not allowlisted: `409`. Non-admin: `403`. Unknown project: `404`.

### 6. Review and publish (existing report flow)

1. Edit the draft if needed.
2. **Submit** → **Approve** → **Publish** (same as any status report).
3. Publish stores an immutable report version. The published markdown is also written under the documents bucket when that path is configured.
4. Starting a **revision** creates a new working draft and leaves the published copy unchanged.

---

## End-to-end checklist

- [ ] Administrator signed in
- [ ] Evidence files uploaded and current
- [ ] Each citable file has a vault source label
- [ ] Project allowlisted (Documents → Staff vault, or `PUT .../vault-allowlist`)
- [ ] Ingest succeeded (`POST .../vault-ingest` or auto-ingest)
- [ ] Draft from vault produced a report (or the “no filed source” message)
- [ ] Person reviewed citations before publish
- [ ] Publish completed through the normal report steps

---

## MCP registration (Cursor and Claude Desktop)

**Beginner walkthrough:** [vault-mcp-beginner.md](./vault-mcp-beginner.md) (install, token, Cursor/Claude setup, example prompts).

Package: `services/vault-mcp` (stdio MCP). It calls the **admin portal API** only — never Aurora or the vault secret.

**Env**

| Variable | Meaning |
| --- | --- |
| `ONE80COMPASS_API_URL` | API base URL (no trailing slash), e.g. `https://2ao8v0fqii.execute-api.us-east-2.amazonaws.com` |
| `ONE80COMPASS_ID_TOKEN` | Cognito ID token for an administrator (`one80-admin`) |

Replace `/absolute/path/to/One80compass` with your clone path.

### Cursor (`~/.cursor/mcp.json` or project MCP config)

```json
{
  "mcpServers": {
    "one80compass-vault": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/One80compass/services/vault-mcp/src/index.ts"],
      "env": {
        "ONE80COMPASS_API_URL": "https://2ao8v0fqii.execute-api.us-east-2.amazonaws.com",
        "ONE80COMPASS_ID_TOKEN": "PASTE_ADMIN_ID_TOKEN"
      }
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "one80compass-vault": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/One80compass/services/vault-mcp/src/index.ts"],
      "env": {
        "ONE80COMPASS_API_URL": "https://2ao8v0fqii.execute-api.us-east-2.amazonaws.com",
        "ONE80COMPASS_ID_TOKEN": "PASTE_ADMIN_ID_TOKEN"
      }
    }
  }
}
```

Refresh the ID token when Cognito session expires. Do not put vault DB credentials in MCP env.

---

## What not to do

- Do not expect Contributors to allowlist, ingest, or draft from vault.
- Do not label a file for another customer’s program.
- Do not treat an unlabeled document as vault evidence.
- Do not ask the draft to change plan dates or status; it cannot and must not.
- Do not publish a draft that cites nothing without human review of that empty result.
- Do not use live Krisp/Fireflies connectors yet; file exports only.
- Do not embed Aurora / vault secrets in MCP configuration.

---

## Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| `403` on allowlist, ingest, chunks, decisions, or draft | Not in `one80-admin` | Use an administrator account |
| `409` on ingest, vault-chunks, or vault-decisions | Project not allowlisted | Enable in Documents → Staff vault (or `PUT` with `enabled: true`) |
| `chunkCount` is 0 | No labeled stored text, or the file type has no extractor | Label a stored text, `.xlsx`, `.docx`, or `.eml` file; confirm upload completed; re-ingest |
| Draft says “No filed source supports that.” | Question unmatched, or vault empty for this program | Re-ingest; widen the question; confirm files are labeled and filed on this project |
| Draft missing a file you expect | Wrong label, deleted file, or ingest not re-run | Fix label; re-ingest |
| Cite another customer’s document | Must not happen; filters drop foreign rows | If seen, stop and escalate; do not publish |
| MCP auth failures | Expired or non-admin ID token | Refresh `ONE80COMPASS_ID_TOKEN`; confirm `one80-admin` |

---

## Architecture (staff summary)

```
Compass UI / API / vault-mcp
  → reads plan + documents (DynamoDB + S3)
  → invokes vault Lambda only (no vault DB password on the API or MCP)

Vault Lambda + Aurora PostgreSQL (pgvector)
  → allowlist, persist ingest rows, list chunks and decision rows for drafts and MCP
```

Decision record: [ADR 0012 — Staff vault](../adr/0012-staff-vault.md).  
Engineer notes: [services/vault/README.md](../../services/vault/README.md).  
MCP package: [services/vault-mcp](../../services/vault-mcp).

---

## Release backlog

Tracked in the [unified release plan](../product/One80Compass_Unified_Release_Plan.md):

- **Phase 10:** Staff vault MCP (`services/vault-mcp`) — **Done**
- Allowlist/ingest UI in Compass — **Done** (Documents → Staff vault for admins)
- Upload/label auto-ingest, allowlist-enable ingest, and EventBridge cron — **Done**
- Richer ontology (risks, decisions, people) + multi-hop retrieval — **Done**

## Revision

| Date | Change |
| --- | --- |
| 2026-10-26 | Initial SOP after vault deploy and Lambda wiring |
| 2026-10-27 | Added Phase 10 MCP to release backlog |
| 2026-10-27 | Auto-ingest on labeled upload / label change for allowlisted programs |
| 2026-10-27 | Marked allowlist UI, ontology, and multi-hop complete; EventBridge cron residual |
| 2026-10-29 | Allowlist UI Done note; GET vault-chunks; MCP registration for Cursor/Claude; Phase 10 In progress |
| 2026-10-29 | Phase 10 Staff vault MCP marked Done |
| 2026-10-29 | Linked beginner MCP guide (`vault-mcp-beginner.md`) |
| 2026-10-29 | 15-minute EventBridge sweep (`VaultIngest`) and allowlist-enable ingest; upload/label, allowlist-enable, and EventBridge cron **Done** |
| 2026-10-29 | In-app user guide `docs/sop/staff-vault-user-guide.md` on FAQ → Staff vault |
| 2026-10-30 | Ingest copies Decision register records (statement, comments, and history) and keeps each decision id. Draft claims name that id and do not use a document source label. Plan items typed Decision are still copied |
