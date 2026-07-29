import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { logAudit } from "../../lib/auditLogger";

const router = Router();
router.use(verifyJwt);

const schema = z.object({ name: z.string().min(1) });

router.get("/", requirePermission("assets", "view"), async (_req, res) => {
  res.json(await prisma.assetCategory.findMany({ orderBy: { name: "asc" } }));
});

router.post("/", requirePermission("admin", "create"), validateBody(schema), async (req, res) => {
  const category = await prisma.assetCategory.create({ data: req.body });
  await logAudit({ userId: req.user!.id, action: "assetCategory.create", entityType: "AssetCategory", entityId: category.id });
  res.status(201).json(category);
});

router.patch("/:id", requirePermission("admin", "edit"), validateBody(schema), async (req, res) => {
  const category = await prisma.assetCategory.update({ where: { id: Number(req.params.id) }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "assetCategory.update", entityType: "AssetCategory", entityId: category.id });
  res.json(category);
});

router.delete("/:id", requirePermission("admin", "delete"), async (req, res) => {
  await prisma.assetCategory.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "assetCategory.delete", entityType: "AssetCategory", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

export default router;
