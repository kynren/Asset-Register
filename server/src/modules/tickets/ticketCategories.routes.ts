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

router.get("/", requirePermission("helpdesk", "view"), async (_req, res) => {
  res.json(await prisma.ticketCategory.findMany({ orderBy: { name: "asc" } }));
});

router.post("/", requirePermission("admin", "create"), validateBody(schema), async (req, res) => {
  const category = await prisma.ticketCategory.create({ data: req.body });
  await logAudit({ userId: req.user!.id, action: "ticketCategory.create", entityType: "TicketCategory", entityId: category.id });
  res.status(201).json(category);
});

router.patch("/:id", requirePermission("admin", "edit"), validateBody(schema), async (req, res) => {
  const category = await prisma.ticketCategory.update({ where: { id: Number(req.params.id) }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "ticketCategory.update", entityType: "TicketCategory", entityId: category.id });
  res.json(category);
});

router.delete("/:id", requirePermission("admin", "delete"), async (req, res) => {
  await prisma.ticketCategory.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "ticketCategory.delete", entityType: "TicketCategory", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

export default router;
