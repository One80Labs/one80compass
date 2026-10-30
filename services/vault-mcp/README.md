# @one80compass/vault-mcp

Stdio MCP server (`one80compass-vault`) that exposes staff vault tools to Cursor / Claude.

**Admin-only.** Requires a Cognito ID token with `one80-admin`. Talks to the portal admin API only — **no Aurora credentials or vault secrets** in this process.

## Required env

| Variable | Purpose |
| --- | --- |
| `ONE80COMPASS_API_URL` | Portal API base URL (no trailing slash) |
| `ONE80COMPASS_ID_TOKEN` | Cognito ID token for a `one80-admin` user. Treat it as a secret. It lasts about one hour. This process checks the admin group and `exp` only; API Gateway verifies the signature. |

## Run

From the monorepo root:

```bash
export ONE80COMPASS_API_URL="https://….execute-api.us-east-2.amazonaws.com"
export ONE80COMPASS_ID_TOKEN="eyJ…"

# workspace script
npm start -w @one80compass/vault-mcp

# or directly
npx tsx services/vault-mcp/src/index.ts
```

Logs go to **stderr**; stdout is reserved for MCP JSON-RPC.

## Tools

`vault_list_decisions` lists Decision register rows copied into the vault for one allowlisted program. Admin-only. It calls `GET /projects/{projectId}/vault-decisions` and requires `program_id`. It does not change the live plan.

## Cursor `mcp.json` snippet

```json
{
  "mcpServers": {
    "one80compass-vault": {
      "command": "npx",
      "args": ["tsx", "services/vault-mcp/src/index.ts"],
      "cwd": "/absolute/path/to/One80compass",
      "env": {
        "ONE80COMPASS_API_URL": "https://….execute-api.us-east-2.amazonaws.com",
        "ONE80COMPASS_ID_TOKEN": "eyJ…"
      }
    }
  }
}
```

SOP / release sequencing live under `docs/` (Agent Docs); this README is run-only.
