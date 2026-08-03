import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";

const router = Router();
router.use(verifyJwt);

const schema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
});

router.get("/", requirePermission("assets", "view"), async (_req, res) => {
  const collections = await prisma.assetCollection.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { categories: true } } },
  });
  res.json(collections.map((c) => ({ id: c.id, name: c.name, description: c.description, categoryCount: c._count.categories })));
});

router.post("/", requirePermission("admin", "create"), validateBody(schema), async (req, res) => {
  const collection = await prisma.assetCollection.create({ data: req.body });
  await logAudit({ userId: req.user!.id, action: "assetCollection.create", entityType: "AssetCollection", entityId: collection.id });
  res.status(201).json(collection);
});

router.patch("/:id", requirePermission("admin", "edit"), validateBody(schema.partial()), async (req, res) => {
  const collection = await prisma.assetCollection.update({ where: { id: Number(req.params.id) }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "assetCollection.update", entityType: "AssetCollection", entityId: collection.id });
  res.json(collection);
});

router.delete("/:id", requirePermission("admin", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  const categoryCount = await prisma.assetCategory.count({ where: { collectionId: id } });
  if (categoryCount > 0) {
    throw new ApiError(409, `This collection has ${categoryCount} categor${categoryCount === 1 ? "y" : "ies"} in it — move or delete them first.`);
  }
  await prisma.assetCollection.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "assetCollection.delete", entityType: "AssetCollection", entityId: id });
  res.json({ ok: true });
});

export default router;
