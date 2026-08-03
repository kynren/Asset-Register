import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { logAudit } from "../../lib/auditLogger";

const router = Router();
router.use(verifyJwt);

// Kept intentionally loose (string field/operator/value) — the actual condition/action
// evaluation lives in ticketRules.ts's evaluateTicketRules(), which is the single source of
// truth for what field/operator combinations are actually understood.
const conditionSchema = z.object({ field: z.string().min(1), operator: z.string().min(1), value: z.string() });
const actionSchema = z.object({ field: z.string().min(1), value: z.string() });

const schema = z.object({
  name: z.string().min(1),
  isActive: z.boolean().optional(),
  order: z.number().int().optional(),
  conditions: z.array(conditionSchema),
  actions: z.array(actionSchema),
});

router.get("/", requirePermission("helpdesk", "view"), async (_req, res) => {
  res.json(await prisma.ticketRule.findMany({ orderBy: { order: "asc" } }));
});

router.post("/", requirePermission("admin", "create"), validateBody(schema), async (req, res) => {
  const rule = await prisma.ticketRule.create({ data: req.body });
  await logAudit({ userId: req.user!.id, action: "ticketRule.create", entityType: "TicketRule", entityId: rule.id });
  res.status(201).json(rule);
});

router.patch("/:id", requirePermission("admin", "edit"), validateBody(schema.partial()), async (req, res) => {
  const rule = await prisma.ticketRule.update({ where: { id: Number(req.params.id) }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "ticketRule.update", entityType: "TicketRule", entityId: rule.id });
  res.json(rule);
});

router.delete("/:id", requirePermission("admin", "delete"), async (req, res) => {
  await prisma.ticketRule.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "ticketRule.delete", entityType: "TicketRule", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

export default router;
