import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { logAudit } from "../../lib/auditLogger";
import { ApiError } from "../../middleware/errorHandler";

const router = Router();
router.use(verifyJwt);

const include = { fields: true };

const templateSchema = z.object({
  name: z.string().min(1),
  itilType: z.enum(["INCIDENT", "REQUEST", "PROBLEM", "CHANGE"]).optional(),
  isDefault: z.boolean().optional(),
});

// Replaces every TemplateField row in one call — same delete-all-then-recreate convention
// tickets.controller.ts's syncAssignments uses for TicketAssignee/TicketAssignedTeam.
const fieldsSchema = z.object({
  fields: z.array(
    z.object({
      fieldKey: z.string().min(1),
      mode: z.enum(["HIDDEN", "MANDATORY", "READONLY", "PREDEFINED"]),
      predefinedValue: z.string().nullable().optional(),
    })
  ),
});

router.get("/", requirePermission("helpdesk", "view"), async (_req, res) => {
  res.json(await prisma.ticketTemplate.findMany({ include, orderBy: { name: "asc" } }));
});

router.get("/:id", requirePermission("helpdesk", "view"), async (req, res) => {
  const template = await prisma.ticketTemplate.findUnique({ where: { id: Number(req.params.id) }, include });
  if (!template) throw new ApiError(404, "Ticket template not found");
  res.json(template);
});

router.post("/", requirePermission("admin", "create"), validateBody(templateSchema), async (req, res) => {
  const template = await prisma.ticketTemplate.create({ data: req.body, include });
  await logAudit({ userId: req.user!.id, action: "ticketTemplate.create", entityType: "TicketTemplate", entityId: template.id });
  res.status(201).json(template);
});

router.patch("/:id", requirePermission("admin", "edit"), validateBody(templateSchema.partial()), async (req, res) => {
  const template = await prisma.ticketTemplate.update({ where: { id: Number(req.params.id) }, data: req.body, include });
  await logAudit({ userId: req.user!.id, action: "ticketTemplate.update", entityType: "TicketTemplate", entityId: template.id });
  res.json(template);
});

router.put("/:id/fields", requirePermission("admin", "edit"), validateBody(fieldsSchema), async (req, res) => {
  const templateId = Number(req.params.id);
  const { fields } = req.body as z.infer<typeof fieldsSchema>;

  await prisma.$transaction([
    prisma.ticketTemplateField.deleteMany({ where: { templateId } }),
    ...(fields.length ? [prisma.ticketTemplateField.createMany({ data: fields.map((f) => ({ ...f, templateId })) })] : []),
  ]);
  await logAudit({ userId: req.user!.id, action: "ticketTemplate.fields_update", entityType: "TicketTemplate", entityId: templateId });

  const template = await prisma.ticketTemplate.findUnique({ where: { id: templateId }, include });
  res.json(template);
});

router.delete("/:id", requirePermission("admin", "delete"), async (req, res) => {
  await prisma.ticketTemplate.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "ticketTemplate.delete", entityType: "TicketTemplate", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

export default router;
