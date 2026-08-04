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

const scheduleSelect = {
  id: true,
  resourceName: true,
  role: true,
  groupLabel: true,
  title: true,
  color: true,
  scheduledBy: { select: { id: true, firstName: true, lastName: true } },
  startAt: true,
  endAt: true,
  notes: true,
  createdAt: true,
};

router.get("/", requirePermission("operations", "view"), async (_req, res) => {
  const schedules = await prisma.resourceSchedule.findMany({ select: scheduleSelect, orderBy: { startAt: "asc" } });
  res.json(schedules);
});

const scheduleSchema = z.object({
  resourceName: z.string().min(1),
  role: z.string().optional(),
  groupLabel: z.string().min(1).optional(),
  title: z.string().optional(),
  color: z.string().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  notes: z.string().optional(),
});

router.post("/", requirePermission("operations", "create"), validateBody(scheduleSchema), async (req, res) => {
  const { resourceName, role, groupLabel, title, color, startAt, endAt, notes } = req.body;
  if (new Date(endAt) <= new Date(startAt)) throw new ApiError(400, "End time must be after start time");

  const overlap = await prisma.resourceSchedule.findFirst({
    where: { resourceName, startAt: { lt: new Date(endAt) }, endAt: { gt: new Date(startAt) } },
  });
  if (overlap) throw new ApiError(409, `"${resourceName}" is already scheduled for an overlapping time window`);

  const schedule = await prisma.resourceSchedule.create({
    data: { resourceName, role, groupLabel, title, color, startAt: new Date(startAt), endAt: new Date(endAt), notes, scheduledById: req.user!.id },
    select: scheduleSelect,
  });
  await logAudit({ userId: req.user!.id, action: "operations.schedule.create", entityType: "ResourceSchedule", entityId: schedule.id, metadata: { resourceName } });
  res.status(201).json(schedule);
});

const scheduleUpdateSchema = z.object({
  resourceName: z.string().min(1).optional(),
  role: z.string().nullable().optional(),
  groupLabel: z.string().min(1).optional(),
  title: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  notes: z.string().nullable().optional(),
});

// Drag-to-reschedule on the dispatch grid: moving a block horizontally sends a new startAt/endAt,
// moving it to a different resource row sends a new resourceName (+ that row's role/groupLabel).
router.patch("/:id", requirePermission("operations", "edit"), validateBody(scheduleUpdateSchema), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.resourceSchedule.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Schedule not found");

  const resourceName = req.body.resourceName ?? existing.resourceName;
  const startAt = req.body.startAt ? new Date(req.body.startAt) : existing.startAt;
  const endAt = req.body.endAt ? new Date(req.body.endAt) : existing.endAt;
  if (endAt <= startAt) throw new ApiError(400, "End time must be after start time");

  const overlap = await prisma.resourceSchedule.findFirst({
    where: { id: { not: id }, resourceName, startAt: { lt: endAt }, endAt: { gt: startAt } },
  });
  if (overlap) throw new ApiError(409, `"${resourceName}" is already scheduled for an overlapping time window`);

  const schedule = await prisma.resourceSchedule.update({
    where: { id },
    data: { ...req.body, startAt, endAt },
    select: scheduleSelect,
  });
  await logAudit({ userId: req.user!.id, action: "operations.schedule.update", entityType: "ResourceSchedule", entityId: id });
  res.json(schedule);
});

router.delete("/:id", requirePermission("operations", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  const schedule = await prisma.resourceSchedule.findUnique({ where: { id } });
  if (!schedule) throw new ApiError(404, "Schedule not found");
  await prisma.resourceSchedule.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "operations.schedule.delete", entityType: "ResourceSchedule", entityId: id });
  res.json({ ok: true });
});

export default router;
