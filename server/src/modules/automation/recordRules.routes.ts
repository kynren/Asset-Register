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

// entityType -> which module permission gates its rules — kept here rather than trusting the
// client, same spirit as dataExplorer.ts's SOURCES.module gate.
const ENTITY_MODULE: Record<string, ModuleName> = {
  Asset: "assets",
  StockItem: "stock",
};

function moduleFor(entityType: string): ModuleName {
  const module = ENTITY_MODULE[entityType];
  if (!module) throw new ApiError(400, `Unknown rule entity type: ${entityType}`);
  return module;
}

async function requireModulePermission(req: Request, module: ModuleName, action: "view" | "create" | "edit" | "delete") {
  if (req.user!.roleName === "System Admin") return;
  if (!(await hasPermission(req.user!.roleId, module, action))) throw new ApiError(403, `Not permitted to ${action} ${module} rules`);
}

const conditionSchema = z.object({ field: z.string().min(1), operator: z.string().min(1), value: z.string() });
const actionSchema = z.object({ field: z.string().min(1), value: z.string() });

const createSchema = z.object({
  entityType: z.string().min(1),
  name: z.string().min(1),
  isActive: z.boolean().optional(),
  order: z.number().int().optional(),
  trigger: z.enum(["ON_CREATE", "ON_UPDATE", "ON_CREATE_OR_UPDATE"]).optional(),
  conditions: z.array(conditionSchema),
  actions: z.array(actionSchema),
});

const updateSchema = createSchema.partial().omit({ entityType: true });

router.get("/", async (req, res) => {
  const entityType = String(req.query.entityType ?? "");
  const module = moduleFor(entityType);
  await requireModulePermission(req, module, "view");
  res.json(await prisma.recordRule.findMany({ where: { entityType }, orderBy: { order: "asc" } }));
});

router.post("/", validateBody(createSchema), async (req, res) => {
  const module = moduleFor(req.body.entityType);
  await requireModulePermission(req, module, "create");
  const rule = await prisma.recordRule.create({ data: req.body });
  await logAudit({ userId: req.user!.id, action: "recordRule.create", entityType: "RecordRule", entityId: rule.id });
  res.status(201).json(rule);
});

router.patch("/:id", validateBody(updateSchema), async (req, res) => {
  const existing = await prisma.recordRule.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) throw new ApiError(404, "Rule not found");
  const module = moduleFor(existing.entityType);
  await requireModulePermission(req, module, "edit");
  const rule = await prisma.recordRule.update({ where: { id: existing.id }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "recordRule.update", entityType: "RecordRule", entityId: rule.id });
  res.json(rule);
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.recordRule.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) throw new ApiError(404, "Rule not found");
  const module = moduleFor(existing.entityType);
  await requireModulePermission(req, module, "delete");
  await prisma.recordRule.delete({ where: { id: existing.id } });
  await logAudit({ userId: req.user!.id, action: "recordRule.delete", entityType: "RecordRule", entityId: existing.id });
  res.json({ ok: true });
});

export default router;
