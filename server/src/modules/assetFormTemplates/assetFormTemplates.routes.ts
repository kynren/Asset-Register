import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { createFieldSchema, createTemplateSchema, reorderFieldsSchema, updateFieldSchema, updateTemplateSchema } from "./assetFormTemplates.schema";

const router = Router();
router.use(verifyJwt);

function slugify(label: string): string {
  const base = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "field";
}

async function uniqueFieldKey(templateId: number, label: string): Promise<string> {
  const base = slugify(label);
  let key = base;
  let suffix = 1;
  while (await prisma.assetFormField.findUnique({ where: { templateId_fieldKey: { templateId, fieldKey: key } } })) {
    suffix += 1;
    key = `${base}_${suffix}`;
  }
  return key;
}

const templateListSelect = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  categories: { select: { id: true, name: true } },
  _count: { select: { fields: true, categories: true } },
};

router.get("/", requirePermission("admin", "view"), async (_req, res) => {
  const templates = await prisma.assetFormTemplate.findMany({ select: templateListSelect, orderBy: { name: "asc" } });
  res.json(
    templates.map((t) => ({
      ...t,
      fieldCount: t._count.fields,
      categoryCount: t._count.categories,
      _count: undefined,
    }))
  );
});

router.get("/:id", requirePermission("admin", "view"), async (req, res) => {
  const template = await prisma.assetFormTemplate.findUnique({
    where: { id: Number(req.params.id) },
    include: { fields: { orderBy: { order: "asc" } }, categories: { select: { id: true, name: true } } },
  });
  if (!template) throw new ApiError(404, "Form template not found");
  res.json(template);
});

router.post("/", requirePermission("admin", "create"), validateBody(createTemplateSchema), async (req, res) => {
  const template = await prisma.assetFormTemplate.create({ data: req.body, include: { fields: true, categories: true } });
  await logAudit({ userId: req.user!.id, action: "assetFormTemplate.create", entityType: "AssetFormTemplate", entityId: template.id });
  res.status(201).json(template);
});

router.patch("/:id", requirePermission("admin", "edit"), validateBody(updateTemplateSchema), async (req, res) => {
  const id = Number(req.params.id);
  const template = await prisma.assetFormTemplate.update({ where: { id }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "assetFormTemplate.update", entityType: "AssetFormTemplate", entityId: id });
  res.json(template);
});

router.delete("/:id", requirePermission("admin", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  await prisma.assetFormTemplate.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "assetFormTemplate.delete", entityType: "AssetFormTemplate", entityId: id });
  res.json({ ok: true });
});

router.post("/:id/fields", requirePermission("admin", "edit"), validateBody(createFieldSchema), async (req, res) => {
  const templateId = Number(req.params.id);
  const template = await prisma.assetFormTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new ApiError(404, "Form template not found");

  const maxOrder = await prisma.assetFormField.aggregate({ where: { templateId }, _max: { order: true } });
  const fieldKey = await uniqueFieldKey(templateId, req.body.label);

  const field = await prisma.assetFormField.create({
    data: {
      templateId,
      label: req.body.label,
      fieldType: req.body.fieldType ?? "TEXT",
      required: req.body.required ?? false,
      options: req.body.options ?? undefined,
      fieldKey,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
  await prisma.assetFormTemplate.update({ where: { id: templateId }, data: { updatedAt: new Date() } });
  await logAudit({ userId: req.user!.id, action: "assetFormField.create", entityType: "AssetFormTemplate", entityId: templateId, metadata: { fieldId: field.id } });
  res.status(201).json(field);
});

router.patch("/:id/fields/:fieldId", requirePermission("admin", "edit"), validateBody(updateFieldSchema), async (req, res) => {
  const templateId = Number(req.params.id);
  const fieldId = Number(req.params.fieldId);
  const field = await prisma.assetFormField.update({
    where: { id: fieldId },
    data: {
      label: req.body.label,
      fieldType: req.body.fieldType,
      required: req.body.required,
      options: req.body.options ?? undefined,
    },
  });
  await prisma.assetFormTemplate.update({ where: { id: templateId }, data: { updatedAt: new Date() } });
  await logAudit({ userId: req.user!.id, action: "assetFormField.update", entityType: "AssetFormTemplate", entityId: templateId, metadata: { fieldId } });
  res.json(field);
});

router.delete("/:id/fields/:fieldId", requirePermission("admin", "edit"), async (req, res) => {
  const templateId = Number(req.params.id);
  const fieldId = Number(req.params.fieldId);
  await prisma.assetFormField.delete({ where: { id: fieldId } });
  await prisma.assetFormTemplate.update({ where: { id: templateId }, data: { updatedAt: new Date() } });
  await logAudit({ userId: req.user!.id, action: "assetFormField.delete", entityType: "AssetFormTemplate", entityId: templateId, metadata: { fieldId } });
  res.json({ ok: true });
});

router.patch("/:id/fields/reorder", requirePermission("admin", "edit"), validateBody(reorderFieldsSchema), async (req, res) => {
  const templateId = Number(req.params.id);
  const { orderedFieldIds } = req.body as { orderedFieldIds: number[] };

  await prisma.$transaction(
    orderedFieldIds.map((fieldId, index) => prisma.assetFormField.update({ where: { id: fieldId }, data: { order: index } }))
  );
  await prisma.assetFormTemplate.update({ where: { id: templateId }, data: { updatedAt: new Date() } });
  await logAudit({ userId: req.user!.id, action: "assetFormField.reorder", entityType: "AssetFormTemplate", entityId: templateId, metadata: { orderedFieldIds } });

  const fields = await prisma.assetFormField.findMany({ where: { templateId }, orderBy: { order: "asc" } });
  res.json(fields);
});

export default router;
