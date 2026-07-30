import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { tools } from "./tools";

// Builds a fresh MCP server instance with every tool bound to a specific acting user, so any
// write actions a tool performs (e.g. create_ticket) are attributed to a real account — whether
// the caller is an external MCP client authenticated with that user's API key, or the in-app
// assistant acting on behalf of the currently logged-in user.
export function createMcpServer(actingUserId: number): McpServer {
  const server = new McpServer({ name: "kynren-asset-register", version: "1.0.0" });

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args: any) => {
        try {
          const result = await tool.handler(args ?? {}, { actingUserId });
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        } catch (err) {
          return { content: [{ type: "text" as const, text: JSON.stringify({ answer: `Error: ${(err as Error).message}` }) }], isError: true };
        }
      }
    );
  }

  return server;
}
