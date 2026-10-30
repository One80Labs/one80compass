# Beginner guide — Install and use the Staff Vault MCP

This guide walks you through connecting the **One80Compass staff vault MCP server** to Cursor or Claude Desktop so you can allowlist a program, ingest evidence, search filed chunks, list Decision register rows, and draft a cited status report — from the chat, without writing curl commands.

You do **not** need to know Postgres, Aurora, or AWS Lambda. The MCP server talks only to the Compass **admin API**.

**Related:** [Documents and labeling](faq:documents-labeling) · [staff-vault.md](./staff-vault.md) (how the vault works in Compass) · [services/vault-mcp/README.md](../../services/vault-mcp/README.md) (short engineer run sheet)

**Audience:** One80 **administrators** only (`one80-admin`). Contributors and View users can ignore this tile.

---

## What is an MCP server?

**MCP** (Model Context Protocol) lets an AI app (Cursor, Claude Desktop) call small, named **tools** on your machine.

Think of it like giving the assistant a remote control with six vault buttons. You ask in plain English; the assistant chooses a tool; the tool calls Compass as you (admin).

| Without MCP | With MCP |
| --- | --- |
| You run curl or click the Compass UI for each step | You ask Cursor/Claude to allowlist, ingest, search, or draft |
| Easy to mistype URLs and tokens | Tools know the API paths; you still supply a valid admin token once in config |

---

## Who can use this?

| Requirement | Why |
| --- | --- |
| One80 **administrator** (`one80-admin` Cognito group) | Vault allowlist, ingest, chunks, decisions, and draft are admin-only |
| Access to the One80compass git repo on your computer | The MCP process runs from `services/vault-mcp` in that clone |
| Node.js **18+** and npm installed | Used to start the MCP process (`npx tsx …`) |

Contributors and View users cannot use these tools (the API returns 403).

---

## Concepts in one minute

| Term | Meaning |
| --- | --- |
| **Program** / `program_id` | A Compass **project**. In the browser URL it looks like `/projects/YOUR-PROJECT-ID/…`. That id is what you pass as `program_id`. |
| **Staff vault** | A rebuildable **copy** of an allowlisted program plus labeled documents. Customers never log into it. |
| **Allowlist** | Turns vault copy on or off for one program. |
| **Ingest** | Replaces the vault copy for one allowlisted program. It copies plan work items, milestones, the risk register, people, labeled files, and the Decision register. Each register record keeps its decision id. A plan item whose type is **Decision** is still stored as a decision. |
| **Chunk** | A searchable text slice from a labeled filed document. Register rows are not chunks. List those with `vault_list_decisions`. |
| **Draft from vault** | Creates a normal Compass **status report** in `draft` with citations from plan work items, Decision register rows, and filed chunks. A register claim names the decision id and does not use a document source label. It does **not** change live issue dates or status. |

Before MCP will find evidence, someone must label documents and (usually) allowlist + ingest. See [staff-vault.md](./staff-vault.md) for the full UI procedure.

## What ingest copies

- Plan work items
- Milestones
- Risk register
- People
- Labeled files
- Decision register (statement, comments, history)

A plan item whose type is **Decision** is still copied as a decision row. Customers never see the vault.

---

## Before you start — checklist

1. [ ] Clone or pull the One80compass repo and note its **absolute path** (example: `/Users/you/One80compass`).
2. [ ] From that folder, run once: `npm install` (installs workspace deps, including the MCP package).
3. [ ] Confirm you can sign in at https://one80compass.ai as an **administrator**.
4. [ ] Open a project you care about and copy its **project id** from the URL (`/projects/…`).
5. [ ] Prefer: evidence files labeled under Documents, and Staff vault allowlist enabled in Compass (or you will enable it via MCP later).

---

## Step 1 — Get your API URL

The portal API base URL (no trailing slash), for example:

```text
https://2ao8v0fqii.execute-api.us-east-2.amazonaws.com
```

Ask a teammate or check your local web env (`VITE_API_URL`) if unsure. You will set this as `ONE80COMPASS_API_URL`.

---

## Step 2 — Get an admin ID token

The MCP server needs a Cognito **ID token** for your admin user. This is a long string that usually starts with `eyJ…`.

### Easy way (browser)

1. Sign in at https://one80compass.ai as an administrator.
2. Open DevTools → **Network**.
3. Click around in Compass so an API call runs (for example open Plan or Documents).
4. Select a request to the API host.
5. Under Request Headers, copy the value after `Authorization: Bearer ` (copy the token only, not the word `Bearer`).
6. Paste that value into your MCP config as `ONE80COMPASS_ID_TOKEN`.

### Important security notes

- Treat the token like a password. Do not commit it to git or paste it into tickets.
- Tokens expire (Compass also enforces a **2-hour** signed-in window from login). When tools start failing with auth errors, sign in again and paste a fresh token.
- Never put Aurora / database passwords in MCP config. Only the two env vars below.

---

## Step 3 — Install dependencies (one time)

In a terminal:

```bash
cd /absolute/path/to/One80compass
npm install
```

You should be able to run (this will exit quickly without env vars — that is OK for a smoke check of `tsx`):

```bash
npx tsx --version
```

---

## Step 4 — Register the MCP server

Replace:

- `/absolute/path/to/One80compass` with your real clone path  
- `PASTE_ADMIN_ID_TOKEN` with your token from Step 2  
- the API URL if yours differs  

### Cursor

Create or edit `~/.cursor/mcp.json` (or your project MCP config in Cursor Settings → MCP):

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

Then fully restart Cursor (or reload MCP servers from Settings) so it picks up the config.

You should see a server named **one80compass-vault** with tools available.

### Claude Desktop

Edit Claude’s config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

Use the same `mcpServers` block as above, then quit and reopen Claude Desktop.

---

## Step 5 — Confirm it works

In Cursor or Claude chat, ask something like:

> Using the one80compass-vault tools, check whether program `YOUR-PROJECT-ID` is on the vault allowlist.

Expected: a JSON-like answer with `customerId`, `programId`, and `enabled` true or false.

If the server fails to start, check the troubleshooting table below.

---

## How to use the tools (beginner recipes)

Always use a real Compass **project id** as `program_id`.

### 1. See allowlist status

**Ask:** “Is project `PROJECT_ID` allowlisted for the staff vault?”

**Tool:** `vault_get_allowlist`  
**Args:** `program_id`

### 2. Turn allowlist on (or off)

**Ask:** “Allowlist project `PROJECT_ID` for the staff vault.”  
**Ask:** “Remove project `PROJECT_ID` from the vault allowlist.”

**Tool:** `vault_set_allowlist`  
**Args:** `program_id`, `enabled` (`true` or `false`)

### 3. Ingest (refresh the vault copy)

**Ask:** “Ingest project `PROJECT_ID` into the staff vault.”

**Tool:** `vault_ingest`  
**Args:** `program_id`

You need allowlist **on** first (otherwise you get a conflict / 409). After ingest you should see counts such as `rowCount`, `relationCount`, `chunkCount`.

Ingest copies the live plan, milestones, the risk register, people, labeled files, and the Decision register. Each register record keeps its decision id. The title is the statement. The body includes the current fields plus every comment and every history event. A linked work item becomes a decided relation from the decision to the work item. A duplicateOfId becomes a supersedes relation from the surviving decision to the duplicate. A plan item whose type is **Decision** is still stored as a decision row. Drafts and `vault_list_decisions` can read those rows. A draft claim names the decision id and does not use a document source label. The live plan is not modified.

### 4. List or search chunks

**Ask:** “List vault chunks for project `PROJECT_ID`.”  
**Ask:** “Search vault chunks for project `PROJECT_ID` that mention ‘risk register’.”

**Tool:** `vault_list_chunks`  
**Args:** `program_id`, optional `query` (simple text filter on chunk body)

If `chunkCount` was 0 at ingest, label text files in Documents and ingest again ([staff-vault.md](./staff-vault.md)).

### 5. List Decision register rows

**Ask:** “List vault decisions for project `PROJECT_ID`.”

**Tool:** `vault_list_decisions`  
**Args:** `program_id`

The program must be allowlisted (otherwise you get a conflict / 409). Each row keeps its decision id. This tool does not change the live plan.

### 6. Draft a cited status report

**Ask:** “Draft a vault status report for project `PROJECT_ID` answering: What progress did we make this week?”

**Tool:** `vault_draft_status`  
**Args:** `program_id`, `question`

This creates a Compass report in **draft** with citations. A claim about a Decision register record names the decision id and does not use a document source label. Open Reports in the UI, review citations, then submit → approve → publish as usual. The draft **cannot** change live plan fields.

---

## Suggested first end-to-end session

1. Label at least one text document on the project (Documents → vault source label).  
2. Ask MCP to **allowlist** the project.  
3. Ask MCP to **ingest**.  
4. Ask MCP to **list chunks** (confirm you see text).  
5. Ask MCP to **draft** with a clear question.  
6. Open the new draft in Compass and review before publish.

---

## Tool quick reference

| Tool name | What it does | Required inputs |
| --- | --- | --- |
| `vault_get_allowlist` | Read allowlist flag for one program | `program_id` |
| `vault_set_allowlist` | Enable or clear allowlist | `program_id`, `enabled` |
| `vault_ingest` | Copy plan work items, milestones, the risk register, people, labeled files, and the Decision register (statement, comments, history). Plan items typed Decision are still copied | `program_id` |
| `vault_list_chunks` | List/search filed chunks for one program | `program_id` (+ optional `query`) |
| `vault_list_decisions` | List Decision register rows copied into the vault. Administrator only; the program must be allowlisted | `program_id` |
| `vault_draft_status` | Create a cited report draft in Compass. A register claim names the decision id and does not use a document source label | `program_id`, `question` |

---

## Troubleshooting

| What you see | Likely cause | What to do |
| --- | --- | --- |
| MCP server missing / red in Cursor | Bad path, Node/npm missing, or config JSON typo | Fix absolute path; run `npm install`; validate JSON; restart Cursor |
| “ONE80COMPASS_API_URL is required” / ID token required | Env not set in mcp config | Add both env vars under `env` |
| Not admin / 403 | Token is not `one80-admin` | Sign in as administrator; copy a new token |
| Auth failed after it worked earlier | Token or 2-hour session expired | Sign in again; paste a fresh ID token; restart MCP |
| 409 on ingest, list chunks, or list decisions | Program not allowlisted | Run `vault_set_allowlist` with `enabled: true` |
| Zero chunks | No labeled stored text files | Label text, markdown, CSV, or JSON; finish upload; ingest again |
| Decision register missing from a draft | Allowlist is off, or ingest has not run since the register changed | Allowlist the program, run `vault_ingest`, then `vault_list_decisions` |
| Draft says nothing supports the question | Empty vault or odd question | Ingest; widen the question; confirm labels |
| Fear of changing the live plan | — | Draft/report tools do not write issue dates or status |

---

## What not to do

- Do not share or commit your ID token.  
- Do not put database passwords or vault secrets in MCP config.  
- Do not use another customer’s `program_id` hoping to see their data — filters drop foreign rows; if anything leaks, stop and escalate.  
- Do not publish a vault draft without reading the citations.  
- Do not expect Contributors to run this MCP successfully.

---

## Optional — run the server yourself (advanced)

Usually Cursor/Claude starts the process for you. To start it manually (for debugging):

```bash
cd /absolute/path/to/One80compass
export ONE80COMPASS_API_URL="https://2ao8v0fqii.execute-api.us-east-2.amazonaws.com"
export ONE80COMPASS_ID_TOKEN="eyJ…"
npm start -w @one80compass/vault-mcp
```

Logs appear on **stderr**. Leave stdout alone — that channel is for MCP protocol traffic.

---

## Revision

| Date | Change |
| --- | --- |
| 2026-10-29 | Initial beginner install and use guide for staff vault MCP |
| 2026-10-30 | Ingest copies the Decision register (statement, comments, and history) and keeps each decision id. Draft claims name that id and do not use a document source label. Plan items typed Decision are still copied |
