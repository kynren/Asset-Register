import { Request, Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { hasPermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { logAudit } from "../../lib/auditLogger";
import { ApiError } from "../../middleware/errorHandler";
import { ModuleName } from "../../constants/modules";

const router = Router();
router.use(verifyJwt);

// entityType -> which module permission gates its columns — same convention as
// recordRules.routes.ts's ENTITY_MODULE (kept here rather than trusting the client).
const ENTITY_MODULE: Record<string, ModuleName> = {
  Asset: "assets",
  StockItem: "stock",
};

function moduleFor(entityType: string): ModuleName {
  const module = ENTITY_MODULE[entityType];
  if (!module) throw new ApiError(400, `Unknown custom-column entity type: ${entityType}`);
  return module;
}

async function requireModulePermission(req: Request, module: ModuleName, action: "view" | "create" | "edit" | "delete") {
  if (req.user!.roleName === "System Admin") return;
  if (!(await hasPermission(req.user!.roleId, module, action))) throw new ApiError(403, `Not permitted to ${action} ${module} custom columns`);
}

router.get("/", async (req, res) => {
  const entityType = String(req.query.entityType ?? "");
  const module = moduleFor(entityType);
  await requireModulePermission(req, module, "view");
  res.json(await prisma.customColumn.findMany({ where: { entityType }, orderBy: { order: "asc" } }));
});

const createSchema = z.object({
  entityType: z.string().min(1),
  name: z.string().min(1).max(60),
  fieldType: z.enum(["TEXT", "NUMBER", "DATE", "BOOLEAN"]).optional(),
  order: z.number().int().optional(),
});

router.post("/", validateBody(createSchema), async (req, res) => {
  const module = moduleFor(req.body.entityType);
  await requireModulePermission(req, module, "create");
  const column = await prisma.customColumn.create({ data: { ...req.body, createdById: req.user!.id } });
  await logAudit({ userId: req.user!.id, action: "customColumn.create", entityType: "CustomColumn", entityId: column.id });
  res.status(201).json(column);
});

const updateSchema = z.object({ name: z.string().min(1).max(60).optional(), order: z.number().int().optional() });

router.patch("/:id", validateBody(updateSchema), async (req, res) => {
  const existing = await prisma.customColumn.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) throw new ApiError(404, "Custom column not found");
  const module = moduleFor(existing.entityType);
  await requireModulePermission(req, module, "edit");
  const column = await prisma.customColumn.update({ where: { id: existing.id }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "customColumn.update", entityType: "CustomColumn", entityId: column.id });
  res.json(column);
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.customColumn.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) throw new ApiError(404, "Custom column not found");
  const module = moduleFor(existing.entityType);
  await requireModulePermission(req, module, "delete");
  await prisma.customColumn.delete({ where: { id: existing.id } });
  await logAudit({ userId: req.user!.id, action: "customColumn.delete", entityType: "CustomColumn", entityId: existing.id });
  res.json({ ok: true });
});

const valueSchema = z.object({ value: z.string().nullable() });

router.patch("/:id/values/:entityId", validateBody(valueSchema), async (req, res) => {
  const column = await prisma.customColumn.findUnique({ where: { id: Number(req.params.id) } });
  if (!column) throw new ApiError(404, "Custom column not found");
  const module = moduleFor(column.entityType);
  await requireModulePermission(req, module, "edit");

  const entityId = Number(req.params.entityId);
  const value = await prisma.customColumnValue.upsert({
    where: { customColumnId_entityId: { customColumnId: column.id, entityId } },
    create: { customColumnId: column.id, entityId, value: req.body.value },
    update: { value: req.body.value },
  });
  res.json(value);
});

export default router;
