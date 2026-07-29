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
  formTemplateId: z.number().int().nullable().optional(),
  isComputerAsset: z.boolean().optional(),
});

const categorySelect = {
  id: true,
  name: true,
  isComputerAsset: true,
  formTemplateId: true,
  formTemplate: { select: { id: true, name: true } },
};

router.get("/", requirePermission("assets", "view"), async (_req, res) => {
  res.json(await prisma.assetCategory.findMany({ select: categorySelect, orderBy: { name: "asc" } }));
});

router.get("/:id", requirePermission("assets", "view"), async (req, res) => {
  const category = await prisma.assetCategory.findUnique({
    where: { id: Number(req.params.id) },
    select: {
      ...categorySelect,
      formTemplate: { select: { id: true, name: true, fields: { orderBy: { order: "asc" } } } },
    },
  });
  if (!category) throw new ApiError(404, "Category not found");
  res.json(category);
});

router.post("/", requirePermission("admin", "create"), validateBody(schema), async (req, res) => {
  const category = await prisma.assetCategory.create({ data: req.body, select: categorySelect });
  await logAudit({ userId: req.user!.id, action: "assetCategory.create", entityType: "AssetCategory", entityId: category.id });
  res.status(201).json(category);
});

router.patch("/:id", requirePermission("admin", "edit"), validateBody(schema.partial()), async (req, res) => {
  const category = await prisma.assetCategory.update({ where: { id: Number(req.params.id) }, data: req.body, select: categorySelect });
  await logAudit({ userId: req.user!.id, action: "assetCategory.update", entityType: "AssetCategory", entityId: category.id });
  res.json(category);
});

router.delete("/:id", requirePermission("admin", "delete"), async (req, res) => {
  await prisma.assetCategory.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "assetCategory.delete", entityType: "AssetCategory", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

export default router;
