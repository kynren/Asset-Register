import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { createScheduledChangeSchema, updateScheduledChangeSchema } from "./scheduledChanges.schema";
import { applyScheduledChange, assertNoPendingConflict, buildSummary, captureBeforeSnapshot } from "./scheduledChanges.service";

const router = Router();
router.use(verifyJwt);

// PENDING soonest-first (what needs attention next), then everything else most-recently-touched
// first (what just happened) — matches how the Change Management timeline is meant to read
// top-to-bottom: upcoming, then history.
router.get("/", requirePermission("app-settings", "view"), async (req, res) => {
  const changeType = typeof req.query.changeType === "string" ? req.query.changeType : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const where = { ...(changeType ? { changeType: changeType as any } : {}), ...(status ? { status: status as any } : {}) };

  const [pending, history] = await Promise.all([
    prisma.scheduledChange.findMany({ where: { ...where, status: "PENDING" }, orderBy: { scheduledFor: "asc" } }),
    prisma.scheduledChange.findMany({ where: { ...where, status: { not: "PENDING" } }, orderBy: { updatedAt: "desc" } }),
  ]);
  res.json([...pending, ...history]);
});

router.get("/:id", requirePermission("app-settings", "view"), async (req, res) => {
  const change = await prisma.scheduledChange.findUnique({ where: { id: Number(req.params.id) } });
  if (!change) throw new ApiError(404, "Scheduled change not found");
  res.json(change);
});

router.post("/", requirePermission("app-settings", "create"), validateBody(createScheduledChangeSchema), async (req, res) => {
  const { changeType, payload, scheduledFor } = req.body as { changeType: "SYSTEM_SETTINGS" | "BACKUP_SETTINGS" | "ROLE_PERMISSIONS"; payload: unknown; scheduledFor: Date };
  const targetId = "targetId" in req.body ? (req.body.targetId as number) : null;

  await assertNoPendingConflict(changeType, targetId);
  const beforeSnapshot = await captureBeforeSnapshot(changeType, targetId);
  const summary = await buildSummary(changeType, payload, targetId);

  const change = await prisma.scheduledChange.create({
    data: { changeType, payload: payload as any, beforeSnapshot, summary, targetId, scheduledFor, createdById: req.user!.id },
  });
  await logAudit({ userId: req.user!.id, action: "scheduledChange.create", entityType: "ScheduledChange", entityId: change.id, metadata: { changeType, targetId, scheduledFor } });
  res.status(201).json(change);
});

router.patch("/:id", requirePermission("app-settings", "edit"), validateBody(updateScheduledChangeSchema), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.scheduledChange.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Scheduled change not found");
  if (existing.status !== "PENDING") throw new ApiError(400, "Only a pending scheduled change can be edited or rescheduled.");

  const { payload, scheduledFor } = req.body as { payload?: unknown; scheduledFor?: Date };
  const summary = payload !== undefined ? await buildSummary(existing.changeType, payload, existing.targetId) : undefined;

  const change = await prisma.scheduledChange.update({
    where: { id },
    data: { ...(payload !== undefined ? { payload: payload as any, summary } : {}), ...(scheduledFor !== undefined ? { scheduledFor } : {}) },
  });
  await logAudit({ userId: req.user!.id, action: "scheduledChange.update", entityType: "ScheduledChange", entityId: id, metadata: { payload, scheduledFor } });
  res.json(change);
});

router.post("/:id/publish-now", requirePermission("app-settings", "edit"), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.scheduledChange.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Scheduled change not found");
  if (existing.status !== "PENDING") throw new ApiError(400, "Only a pending scheduled change can be published now.");

  const result = await applyScheduledChange(existing);
  if (!result.ok) throw new ApiError(400, result.error ?? "Failed to publish this change.");
  res.json(await prisma.scheduledChange.findUnique({ where: { id } }));
});

router.post("/:id/cancel", requirePermission("app-settings", "edit"), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.scheduledChange.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Scheduled change not found");
  if (existing.status !== "PENDING") throw new ApiError(400, "Only a pending scheduled change can be cancelled.");

  const change = await prisma.scheduledChange.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: req.user!.id },
  });
  await logAudit({ userId: req.user!.id, action: "scheduledChange.cancel", entityType: "ScheduledChange", entityId: id });
  res.json(change);
});

export default router;
