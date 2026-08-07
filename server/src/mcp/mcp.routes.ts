import { Router, Request, Response, NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { prisma, runWithTenant } from "../config/prisma";
import { resolveTokenSchema } from "../config/controlPlane";
import { createMcpServer } from "./server";

const router = Router();

interface McpRequest extends Request {
  mcpOwnerId?: number;
  mcpKeyId?: number;
}

// External MCP clients (Claude Desktop, Claude Code) authenticate with a per-user API key
// generated in Admin & Setup, not a browser JWT session — mirrors how the Python device agent
// authenticates with its own key instead of a user login.
async function verifyMcpKey(req: McpRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!key) return res.status(401).json({ error: "Missing MCP API key. Use Authorization: Bearer <key>." });

  const schemaName = await resolveTokenSchema(key);
  if (!schemaName) return res.status(401).json({ error: "Invalid or revoked MCP API key." });

  await runWithTenant(schemaName, async () => {
    const record = await prisma.mcpApiKey.findUnique({ where: { key } });
    if (!record || !record.isActive) return res.status(401).json({ error: "Invalid or revoked MCP API key." });

    prisma.mcpApiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date(), lastUsedIp: req.ip } }).catch(() => undefined);
    req.mcpOwnerId = record.ownerId;
    req.mcpKeyId = record.id;
    next();
  });
}

// Stateless mode: a fresh server + transport per request. This app's MCP usage is low-frequency
// tool calls, not long-lived streaming sessions, so there's no real cost to this simplicity and
// it avoids having to manage session lifecycle/cleanup across requests.
router.post("/", verifyMcpKey, async (req: McpRequest, res: Response) => {
  const server = createMcpServer(req.mcpOwnerId!, req.mcpKeyId);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

export default router;
