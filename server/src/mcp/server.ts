import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../config/prisma";
import { tools } from "./tools";

// Builds a fresh MCP server instance with every tool bound to a specific acting user, so any
// write actions a tool performs (e.g. create_ticket) are attributed to a real account — whether
// the caller is an external MCP client authenticated with that user's API key, or the in-app
// assistant acting on behalf of the currently logged-in user.
//
// `mcpKeyId` is only set for the former (see mcp.routes.ts) — the in-app assistant's in-process
// calls (client.ts) don't go through a key at all, so there's nothing meaningful to log a call
// history against, and passing it as undefined skips logging entirely.
export function createMcpServer(actingUserId: number, mcpKeyId?: number): McpServer {
  const server = new McpServer({ name: "kynren-asset-register", version: "1.0.0" });

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      // inputSchema is typed as the widened `Record<string, ZodTypeAny>` (see ToolDef in
      // tools.ts) since `tools` holds many differently-shaped schemas in one array — registerTool
      // tries to infer a precise arg type from it regardless, and chasing that through a widened
      // Record blows up into TS2589 (excessively deep type instantiation). Cast it away here since
      // the handler below already types `args` as `any` and does its own runtime validation.
      { description: tool.description, inputSchema: tool.inputSchema as any },
      async (args: any) => {
        let ok = true;
        try {
          const result = await tool.handler(args ?? {}, { actingUserId });
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        } catch (err) {
          ok = false;
          return { content: [{ type: "text" as const, text: JSON.stringify({ answer: `Error: ${(err as Error).message}` }) }], isError: true };
        } finally {
          if (mcpKeyId != null) {
            prisma.mcpAccessLog.create({ data: { keyId: mcpKeyId, toolName: tool.name, args: args ?? {}, ok } }).catch(() => undefined);
          }
        }
      }
    );
  }

  return server;
}
