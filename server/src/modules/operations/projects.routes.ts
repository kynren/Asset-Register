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

const cardSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  assigneeId: true,
  assignee: { select: { id: true, firstName: true, lastName: true } },
  dueDate: true,
  order: true,
  createdAt: true,
};

router.get("/", requirePermission("operations", "view"), async (_req, res) => {
  const cards = await prisma.projectCard.findMany({ select: cardSelect, orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  res.json(cards);
});

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeId: z.number().int().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

router.post("/", requirePermission("operations", "create"), validateBody(createSchema), async (req, res) => {
  const card = await prisma.projectCard.create({
    data: { ...req.body, createdById: req.user!.id },
    select: cardSelect,
  });
  await logAudit({ userId: req.user!.id, action: "operations.project.create", entityType: "ProjectCard", entityId: card.id });
  res.status(201).json(card);
});

const STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];
const statusSchema = z.object({ status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE"]) });

router.patch("/:id/status", requirePermission("operations", "edit"), validateBody(statusSchema), async (req, res) => {
  const id = Number(req.params.id);
  const card = await prisma.projectCard.update({ where: { id }, data: { status: req.body.status }, select: cardSelect });
  await logAudit({ userId: req.user!.id, action: "operations.project.move", entityType: "ProjectCard", entityId: id, metadata: { status: req.body.status } });
  res.json(card);
});

router.delete("/:id", requirePermission("operations", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  const card = await prisma.projectCard.findUnique({ where: { id } });
  if (!card) throw new ApiError(404, "Project card not found");
  await prisma.projectCard.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "operations.project.delete", entityType: "ProjectCard", entityId: id });
  res.json({ ok: true });
});

export { STATUSES };
export default router;
