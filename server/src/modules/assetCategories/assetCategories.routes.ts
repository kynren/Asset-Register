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
  isShowAsset: z.boolean().optional(),
  isSwitchingDevice: z.boolean().optional(),
  collectionId: z.number().int().nullable().optional(),
  // null = reset to the generic default column set (see client/src/pages/assets/assetTableColumns.ts).
  tableColumns: z.array(z.string()).nullable().optional(),
});

const categorySelect = {
  id: true,
  name: true,
  isComputerAsset: true,
  isShowAsset: true,
  isSwitchingDevice: true,
  formTemplateId: true,
  formTemplate: { select: { id: true, name: true } },
  collectionId: true,
  collection: { select: { id: true, name: true } },
  tableColumns: true,
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

router.post("/:id/duplicate", requirePermission("admin", "create"), async (req, res) => {
  const id = Number(req.params.id);
  const source = await prisma.assetCategory.findUnique({ where: { id } });
  if (!source) throw new ApiError(404, "Category not found");

  let newName = `${source.name} (Copy)`;
  let suffix = 1;
  while (await prisma.assetCategory.findUnique({ where: { name: newName } })) {
    suffix += 1;
    newName = `${source.name} (Copy ${suffix})`;
  }

  const clone = await prisma.assetCategory.create({
    data: {
      name: newName,
      formTemplateId: source.formTemplateId,
      isComputerAsset: source.isComputerAsset,
      isShowAsset: source.isShowAsset,
      isSwitchingDevice: source.isSwitchingDevice,
      collectionId: source.collectionId,
    },
    select: categorySelect,
  });
  await logAudit({ userId: req.user!.id, action: "assetCategory.duplicate", entityType: "AssetCategory", entityId: clone.id, metadata: { sourceId: id } });
  res.status(201).json(clone);
});

export default router;
