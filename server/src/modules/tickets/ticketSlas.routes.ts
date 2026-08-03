import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { logAudit } from "../../lib/auditLogger";

const router = Router();
router.use(verifyJwt);

const schema = z.object({
  name: z.string().min(1),
  ttoMinutes: z.number().int().min(0).nullable().optional(),
  ttrMinutes: z.number().int().min(1),
});

router.get("/", requirePermission("helpdesk", "view"), async (_req, res) => {
  res.json(await prisma.ticketSla.findMany({ orderBy: { name: "asc" } }));
});

router.post("/", requirePermission("admin", "create"), validateBody(schema), async (req, res) => {
  const sla = await prisma.ticketSla.create({ data: req.body });
  await logAudit({ userId: req.user!.id, action: "ticketSla.create", entityType: "TicketSla", entityId: sla.id });
  res.status(201).json(sla);
});

router.patch("/:id", requirePermission("admin", "edit"), validateBody(schema.partial()), async (req, res) => {
  const sla = await prisma.ticketSla.update({ where: { id: Number(req.params.id) }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "ticketSla.update", entityType: "TicketSla", entityId: sla.id });
  res.json(sla);
});

router.delete("/:id", requirePermission("admin", "delete"), async (req, res) => {
  await prisma.ticketSla.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "ticketSla.delete", entityType: "TicketSla", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

export default router;
