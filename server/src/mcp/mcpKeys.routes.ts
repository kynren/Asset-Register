import { Router } from "express";
import { currentSchemaName, prisma } from "../config/prisma";
import { registerToken } from "../config/controlPlane";
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

// Same "connected app" detail summary as ApiConnection's — first real usage vs. createdAt, most
// recent tool call, and a total count. Still owner-scoped like every other route here: an MCP key
// is self-service and per-user, not admin-managed.
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.mcpApiKey.findUnique({ where: { id } });
  if (!existing || existing.ownerId !== req.user!.id) throw new ApiError(404, "Key not found");

  const [firstCall, lastCall, callCount] = await Promise.all([
    prisma.mcpAccessLog.findFirst({ where: { keyId: id }, orderBy: { occurredAt: "asc" } }),
    prisma.mcpAccessLog.findFirst({ where: { keyId: id }, orderBy: { occurredAt: "desc" } }),
    prisma.mcpAccessLog.count({ where: { keyId: id } }),
  ]);

  res.json({ ...existing, key: `${existing.key.slice(0, 10)}...`, firstUsedAt: firstCall?.occurredAt ?? null, lastCall, callCount });
});

router.get("/:id/logs", async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.mcpApiKey.findUnique({ where: { id } });
  if (!existing || existing.ownerId !== req.user!.id) throw new ApiError(404, "Key not found");

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));

  const [items, total] = await Promise.all([
    prisma.mcpAccessLog.findMany({
      where: { keyId: id },
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mcpAccessLog.count({ where: { keyId: id } }),
  ]);

  res.json({ items, page, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

router.post("/", async (req, res) => {
  const key = generateApiKey();
  const label = (req.body?.label as string) || undefined;
  const record = await prisma.mcpApiKey.create({ data: { key, label, ownerId: req.user!.id } });
  await registerToken(key, currentSchemaName(), "mcp");
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
