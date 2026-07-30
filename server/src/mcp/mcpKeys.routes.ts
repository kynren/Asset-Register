import { Router } from "express";
import { prisma } from "../config/prisma";
import { verifyJwt } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { generateApiKey } from "../lib/passwords";
import { logAudit } from "../lib/auditLogger";

const router = Router();
router.use(verifyJwt);

// Self-service: any logged-in user can generate a key for their own account, the same way a
// personal access token works — it acts as that user, not as an admin-granted credential. Tool
// calls run with direct database access rather than passing through this app's RBAC checks, so
// treat an MCP key with the same care as the account's own password.
router.get("/", async (req, res) => {
  const keys = await prisma.mcpApiKey.findMany({ where: { ownerId: req.user!.id }, orderBy: { createdAt: "desc" } });
  res.json(keys.map((k) => ({ ...k, key: `${k.key.slice(0, 10)}...` })));
});

router.post("/", async (req, res) => {
  const key = generateApiKey();
  const label = (req.body?.label as string) || undefined;
  const record = await prisma.mcpApiKey.create({ data: { key, label, ownerId: req.user!.id } });
  await logAudit({ userId: req.user!.id, action: "mcpKey.create", entityType: "McpApiKey", entityId: record.id });
  // Full key value is only ever returned once, at creation — same convention as the agent keys.
  res.status(201).json(record);
});

router.patch("/:id", async (req, res) => {
  const existing = await prisma.mcpApiKey.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing || existing.ownerId !== req.user!.id) throw new ApiError(404, "Key not found");

  const record = await prisma.mcpApiKey.update({ where: { id: existing.id }, data: { isActive: Boolean(req.body.isActive) } });
  await logAudit({ userId: req.user!.id, action: "mcpKey.update", entityType: "McpApiKey", entityId: record.id });
  res.json({ ...record, key: `${record.key.slice(0, 10)}...` });
});

export default router;
