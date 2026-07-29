import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";

export async function verifyAgentKey(req: Request, res: Response, next: NextFunction) {
  const key = req.header("X-Agent-Key");
  if (!key) return res.status(401).json({ error: "Missing agent key" });

  const record = await prisma.agentApiKey.findUnique({ where: { key } });
  if (!record || !record.isActive) {
    return res.status(401).json({ error: "Invalid agent key" });
  }

  next();
}
