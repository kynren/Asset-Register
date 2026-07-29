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

const bookingSelect = {
  id: true,
  assetId: true,
  asset: { select: { id: true, assetTag: true, name: true } },
  bookedBy: { select: { id: true, firstName: true, lastName: true } },
  startAt: true,
  endAt: true,
  purpose: true,
  createdAt: true,
};

router.get("/", requirePermission("operations", "view"), async (req, res) => {
  const assetId = req.query.assetId ? Number(req.query.assetId) : undefined;
  const where = assetId ? { assetId } : {};
  const bookings = await prisma.assetBooking.findMany({ where, select: bookingSelect, orderBy: { startAt: "asc" } });
  res.json(bookings);
});

const bookingSchema = z.object({
  assetId: z.number().int(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  purpose: z.string().optional(),
});

router.post("/", requirePermission("operations", "create"), validateBody(bookingSchema), async (req, res) => {
  const { assetId, startAt, endAt, purpose } = req.body;
  if (new Date(endAt) <= new Date(startAt)) throw new ApiError(400, "End time must be after start time");

  const overlap = await prisma.assetBooking.findFirst({
    where: { assetId, startAt: { lt: new Date(endAt) }, endAt: { gt: new Date(startAt) } },
  });
  if (overlap) throw new ApiError(409, "This asset is already booked for an overlapping time window");

  const booking = await prisma.assetBooking.create({
    data: { assetId, startAt: new Date(startAt), endAt: new Date(endAt), purpose, bookedById: req.user!.id },
    select: bookingSelect,
  });
  await logAudit({ userId: req.user!.id, action: "operations.booking.create", entityType: "AssetBooking", entityId: booking.id, metadata: { assetId } });
  res.status(201).json(booking);
});

router.delete("/:id", requirePermission("operations", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  const booking = await prisma.assetBooking.findUnique({ where: { id } });
  if (!booking) throw new ApiError(404, "Booking not found");
  await prisma.assetBooking.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "operations.booking.delete", entityType: "AssetBooking", entityId: id });
  res.json({ ok: true });
});

export default router;
