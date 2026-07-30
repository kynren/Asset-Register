import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server";
import type { ToolResult } from "./tools";

// The in-app assistant is an MCP client, not a direct Prisma caller — it reaches its
// capabilities the same way an external tool (Claude Desktop, Claude Code) would over
// /api/mcp, just over an in-memory transport pair instead of HTTP, so there's no network hop
// for something that only ever happens within this one process.
export async function callInternalTool(actingUserId: number, toolName: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const server = createMcpServer(actingUserId);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "kynren-assistant", version: "1.0.0" });

  try {
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    const result = await client.callTool({ name: toolName, arguments: args });
    const content = result.content as { type: string; text?: string }[] | undefined;
    const textBlock = content?.find((c) => c.type === "text");
    if (!textBlock?.text) return { answer: "The assistant's tool call returned no result." };
    return JSON.parse(textBlock.text) as ToolResult;
  } finally {
    await client.close();
    await server.close();
  }
}
