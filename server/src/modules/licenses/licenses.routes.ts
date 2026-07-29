import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { notifyUsers } from "../../lib/notify";

const router = Router();
router.use(verifyJwt);

const licenseSelect = {
  id: true,
  name: true,
  vendor: true,
  licenseKey: true,
  seats: true,
  purchaseDate: true,
  expiresAt: true,
  cost: true,
  notes: true,
  createdAt: true,
  _count: { select: { assignments: true } },
};

router.get("/", requirePermission("operations", "view"), async (_req, res) => {
  const licenses = await prisma.license.findMany({ select: licenseSelect, orderBy: { name: "asc" } });
  res.json(
    licenses.map((l) => ({
      ...l,
      seatsUsed: l._count.assignments,
      _count: undefined,
    }))
  );
});

const licenseSchema = z.object({
  name: z.string().min(1),
  vendor: z.string().optional(),
  licenseKey: z.string().optional(),
  seats: z.number().int().min(1).default(1),
  purchaseDate: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  cost: z.number().nullable().optional(),
  notes: z.string().optional(),
});

router.post("/", requirePermission("operations", "create"), validateBody(licenseSchema), async (req, res) => {
  const license = await prisma.license.create({ data: req.body, select: licenseSelect });
  await logAudit({ userId: req.user!.id, action: "license.create", entityType: "License", entityId: license.id });
  res.status(201).json({ ...license, seatsUsed: 0, _count: undefined });
});

router.patch("/:id", requirePermission("operations", "edit"), validateBody(licenseSchema.partial()), async (req, res) => {
  const id = Number(req.params.id);
  const license = await prisma.license.update({ where: { id }, data: req.body, select: licenseSelect });
  await logAudit({ userId: req.user!.id, action: "license.update", entityType: "License", entityId: id });
  res.json({ ...license, seatsUsed: license._count.assignments, _count: undefined });
});

router.delete("/:id", requirePermission("operations", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  await prisma.license.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "license.delete", entityType: "License", entityId: id });
  res.json({ ok: true });
});

const assignmentSelect = {
  id: true,
  assignedAt: true,
  asset: { select: { id: true, assetTag: true, name: true } },
  user: { select: { id: true, firstName: true, lastName: true } },
};

router.get("/:id/assignments", requirePermission("operations", "view"), async (req, res) => {
  const licenseId = Number(req.params.id);
  const assignments = await prisma.licenseAssignment.findMany({ where: { licenseId }, select: assignmentSelect, orderBy: { assignedAt: "desc" } });
  res.json(assignments);
});

const assignSchema = z.object({
  assetId: z.number().int().nullable().optional(),
  userId: z.number().int().nullable().optional(),
});

router.post("/:id/assignments", requirePermission("operations", "edit"), validateBody(assignSchema), async (req, res) => {
  if (!req.body.assetId && !req.body.userId) throw new ApiError(400, "Provide an assetId or userId to assign this license to.");

  const licenseId = Number(req.params.id);
  const license = await prisma.license.findUnique({ where: { id: licenseId }, include: { _count: { select: { assignments: true } } } });
  if (!license) throw new ApiError(404, "License not found");
  if (license._count.assignments >= license.seats) throw new ApiError(409, "All seats for this license are already assigned.");

  const assignment = await prisma.licenseAssignment.create({
    data: { licenseId, assetId: req.body.assetId ?? null, userId: req.body.userId ?? null },
    select: assignmentSelect,
  });
  await logAudit({ userId: req.user!.id, action: "license.assign", entityType: "License", entityId: licenseId, metadata: req.body });
  if (req.body.userId) {
    await notifyUsers({
      userIds: [req.body.userId],
      excludeUserId: req.user!.id,
      type: "license_assigned",
      message: `License "${license.name}" was assigned to you`,
      linkUrl: `/operations`,
    });
  }
  res.status(201).json(assignment);
});

router.delete("/:id/assignments/:assignmentId", requirePermission("operations", "edit"), async (req, res) => {
  const assignmentId = Number(req.params.assignmentId);
  await prisma.licenseAssignment.delete({ where: { id: assignmentId } });
  await logAudit({ userId: req.user!.id, action: "license.unassign", entityType: "License", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

export default router;
