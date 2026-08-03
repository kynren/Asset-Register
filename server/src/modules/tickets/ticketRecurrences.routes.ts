import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { logAudit } from "../../lib/auditLogger";

const router = Router();
router.use(verifyJwt);

const include = {
  template: { select: { id: true, name: true } },
  lastCreatedTicket: { select: { id: true, ticketNumber: true } },
  requester: { select: { id: true, firstName: true, lastName: true } },
};

const schema = z.object({
  name: z.string().min(1),
  templateId: z.number().int(),
  periodicityDays: z.number().int().min(1),
  createBeforeDays: z.number().int().min(0).optional(),
  nextCreationAt: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
});

router.get("/", requirePermission("helpdesk", "view"), async (_req, res) => {
  res.json(await prisma.ticketRecurrence.findMany({ include, orderBy: { nextCreationAt: "asc" } }));
});

router.post("/", requirePermission("admin", "create"), validateBody(schema), async (req, res) => {
  const recurrence = await prisma.ticketRecurrence.create({ data: { ...req.body, requesterId: req.user!.id }, include });
  await logAudit({ userId: req.user!.id, action: "ticketRecurrence.create", entityType: "TicketRecurrence", entityId: recurrence.id });
  res.status(201).json(recurrence);
});

router.patch("/:id", requirePermission("admin", "edit"), validateBody(schema.partial()), async (req, res) => {
  const recurrence = await prisma.ticketRecurrence.update({ where: { id: Number(req.params.id) }, data: req.body, include });
  await logAudit({ userId: req.user!.id, action: "ticketRecurrence.update", entityType: "TicketRecurrence", entityId: recurrence.id });
  res.json(recurrence);
});

router.delete("/:id", requirePermission("admin", "delete"), async (req, res) => {
  await prisma.ticketRecurrence.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "ticketRecurrence.delete", entityType: "TicketRecurrence", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

export default router;
