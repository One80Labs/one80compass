#!/usr/bin/env -S npx tsx
/**
 * Staff vault MCP entry (stdio) for Cursor / Claude Desktop.
 *
 * Startup: loadConfig → assertAdminToken → createPortalClient → buildTools.
 * Protocol traffic stays on stdout; diagnostics go to stderr only.
 *
 * Uses the low-level Server + tools/list|tools/call handlers because tools.ts
 * exposes JSON Schema; McpServer.registerTool expects Zod shapes.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { assertAdminToken } from "./auth.js";
import { loadConfig } from "./config.js";
import { createPortalClient } from "./portal-client.js";
import { buildTools, type ToolDefs } from "./tools.js";

const SERVER_NAME = "one80compass-vault";
const SERVER_VERSION = "0.1.0";

/** Map tool defs to MCP Tool descriptors (JSON Schema inputSchema preserved). */
function toMcpTools(defs: ToolDefs): Tool[] {
  return defs.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema as Tool["inputSchema"],
  }));
}

async function main(): Promise<void> {
  const config = loadConfig();
  const session = assertAdminToken(config.idToken);
  // stderr only — stdout is the MCP JSON-RPC channel
  console.error(`[${SERVER_NAME}] admin session ok (${session.email})`);

  const client = createPortalClient(config);
  const toolDefs = buildTools(client);
  const byName = new Map(toolDefs.map((t) => [t.name, t]));

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        "Admin-only staff vault tools. Scoped by program_id. Portal HTTP only — no Aurora secrets in this process.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toMcpTools(toolDefs),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const tool = byName.get(name);

    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
      };
    }

    try {
      const result = await tool.handler(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${SERVER_NAME}] ${name} failed: ${message}`);
      return {
        isError: true,
        content: [{ type: "text" as const, text: message }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[${SERVER_NAME}] stdio ready (${toolDefs.length} tools: ${toolDefs.map((t) => t.name).join(", ")})`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
