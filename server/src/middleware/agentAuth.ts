import { NextFunction, Request, Response } from "express";
import { prisma, runWithTenant } from "../config/prisma";
import { resolveTokenSchema } from "../config/controlPlane";

export async function verifyAgentKey(req: Request, res: Response, next: NextFunction) {
  const key = req.header("X-Agent-Key");
  if (!key) return res.status(401).json({ error: "Missing agent key" });

  // Raw key, not a hash, but resolved through the same control-plane token index — the agent
  // (or the network relay, which reuses this same middleware) has no other way to say which
  // tenant it belongs to.
  const schemaName = await resolveTokenSchema(key);
  if (!schemaName) return res.status(401).json({ error: "Invalid agent key" });

  await runWithTenant(schemaName, async () => {
    const record = await prisma.agentApiKey.findUnique({ where: { key } });
    if (!record || !record.isActive) {
      return res.status(401).json({ error: "Invalid agent key" });
    }
    next();
  });
}
