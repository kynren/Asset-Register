import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { getPagination, paginatedResponse } from "../../lib/pagination";
import { ApiConnectionRequest, requireApiConnectionResource, verifyApiConnection } from "../../middleware/apiConnectionAuth";

// External REST gateway for third-party applications holding an ApiConnection credential (see
// apiConnections.routes.ts for how those are issued, and apiConnectionAuth.ts for how a request
// here is authenticated). Mounted at /api/integrations/v1 — versioned so future breaking changes
// to this surface don't disturb integrations already built against v1. "assets" is the only live
// resource today; adding another means a new sub-router here plus that resource name being
// selectable in the ApiConnection admin UI (see resources[] on the ApiConnection model).
const router = Router();
router.use(verifyApiConnection);

const assetSelect = {
  id: true,
  assetTag: true,
  name: true,
  categoryId: true,
  locationId: true,
  assignedToId: true,
  status: true,
  manufacturer: true,
  model: true,
  serialNumber: true,
  purchaseDate: true,
  purchaseCost: true,
  warrantyExpiresAt: true,
  nextServiceDate: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
};

const assetWriteSchema = z.object({
  assetTag: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  categoryId: z.number().int().nullable().optional(),
  locationId: z.number().int().nullable().optional(),
  assignedToId: z.number().int().nullable().optional(),
  status: z.enum(["IN_USE", "IN_STORAGE", "IN_REPAIR", "RETIRED", "LOST"]).optional(),
  manufacturer: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  serialNumber: z.string().nullable().optional(),
  purchaseDate: z.string().datetime().nullable().optional(),
  purchaseCost: z.number().nullable().optional(),
  warrantyExpiresAt: z.string().datetime().nullable().optional(),
  nextServiceDate: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const assetCreateSchema = assetWriteSchema.extend({
  assetTag: z.string().min(1),
  name: z.string().min(1),
});

router.use("/assets", requireApiConnectionResource("assets"));

router.get("/assets", async (req, res) => {
  const { page, pageSize, skip, take } = getPagination(req);
  const [items, total] = await Promise.all([
    prisma.asset.findMany({ select: assetSelect, orderBy: { id: "desc" }, skip, take }),
    prisma.asset.count(),
  ]);
  res.json(paginatedResponse(items, total, page, pageSize));
});

router.get("/assets/:id", async (req, res) => {
  const asset = await prisma.asset.findUnique({ where: { id: Number(req.params.id) }, select: assetSelect });
  if (!asset) throw new ApiError(404, "Asset not found");
  res.json(asset);
});

router.post("/assets", async (req: ApiConnectionRequest, res) => {
  const data = assetCreateSchema.parse(req.body);
  const asset = await prisma.asset.create({ data, select: assetSelect });
  res.status(201).json(asset);
});

// PUT replaces every editable field the caller doesn't explicitly send back with null/undefined —
// standard PUT-is-a-full-replace semantics — while PATCH below only touches fields present in the
// body. Both share the same schema; the difference is how missing keys are treated.
router.put("/assets/:id", async (req, res) => {
  const existing = await prisma.asset.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) throw new ApiError(404, "Asset not found");

  const data = assetWriteSchema.parse(req.body);
  const asset = await prisma.asset.update({
    where: { id: existing.id },
    data: {
      assetTag: data.assetTag ?? existing.assetTag,
      name: data.name ?? existing.name,
      categoryId: data.categoryId ?? null,
      locationId: data.locationId ?? null,
      assignedToId: data.assignedToId ?? null,
      status: data.status ?? existing.status,
      manufacturer: data.manufacturer ?? null,
      model: data.model ?? null,
      serialNumber: data.serialNumber ?? null,
      purchaseDate: data.purchaseDate ?? null,
      purchaseCost: data.purchaseCost ?? null,
      warrantyExpiresAt: data.warrantyExpiresAt ?? null,
      nextServiceDate: data.nextServiceDate ?? null,
      notes: data.notes ?? null,
    },
    select: assetSelect,
  });
  res.json(asset);
});

router.patch("/assets/:id", async (req, res) => {
  const existing = await prisma.asset.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) throw new ApiError(404, "Asset not found");

  const data = assetWriteSchema.parse(req.body);
  const asset = await prisma.asset.update({ where: { id: existing.id }, data, select: assetSelect });
  res.json(asset);
});

router.delete("/assets/:id", async (req, res) => {
  const existing = await prisma.asset.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) throw new ApiError(404, "Asset not found");

  await prisma.asset.delete({ where: { id: existing.id } });
  res.status(204).end();
});

export default router;
