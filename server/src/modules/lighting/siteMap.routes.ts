import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { createSiteMapSchema, placeDeviceSchema, updatePlacementSchema, updateSiteMapSchema } from "./siteMap.schema";

const SITEMAP_UPLOAD_ROOT = path.join(__dirname, "..", "..", "..", "uploads", "lighting-sitemaps");
fs.mkdirSync(SITEMAP_UPLOAD_ROOT, { recursive: true });

// Floor-plan photos run larger than the 2MB branding-logo cap elsewhere in the app.
const siteMapUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, SITEMAP_UPLOAD_ROOT),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(file.mimetype)) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

const router = Router();
router.use(verifyJwt);

const placementSelect = {
  id: true,
  siteMapId: true,
  deviceId: true,
  x: true,
  y: true,
  shapeType: true,
  shapeData: true,
  onIcon: true,
  offIcon: true,
  onColor: true,
  offColor: true,
  zoneOnColor: true,
  device: { select: { id: true, name: true, isOn: true, status: true, icon: true } },
};

router.get("/", requirePermission("lighting", "view"), async (_req, res) => {
  res.json(await prisma.lightingSiteMap.findMany({ orderBy: { sortOrder: "asc" } }));
});

router.post("/", requirePermission("lighting", "create"), siteMapUpload.single("file"), async (req, res) => {
  const parsed = createSiteMapSchema.safeParse(req.body);
  if (!parsed.success || !req.file) throw new ApiError(400, "Missing name or image file");

  const maxSort = await prisma.lightingSiteMap.aggregate({ _max: { sortOrder: true } });
  const siteMap = await prisma.lightingSiteMap.create({
    data: {
      name: parsed.data.name,
      imageUrl: `/uploads/lighting-sitemaps/${req.file.filename}`,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });
  await logAudit({ userId: req.user!.id, action: "lightingSiteMap.create", entityType: "LightingSiteMap", entityId: siteMap.id });
  res.status(201).json(siteMap);
});

router.get("/:id", requirePermission("lighting", "view"), async (req, res) => {
  const siteMap = await prisma.lightingSiteMap.findUnique({
    where: { id: Number(req.params.id) },
    include: { devices: { select: placementSelect, orderBy: { id: "asc" } } },
  });
  if (!siteMap) throw new ApiError(404, "Site map not found");
  res.json(siteMap);
});

// Rename and/or replace the background image — a new file is optional (rename-only edits are common).
router.patch("/:id", requirePermission("lighting", "edit"), siteMapUpload.single("file"), async (req, res) => {
  const parsed = updateSiteMapSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid input");

  const siteMap = await prisma.lightingSiteMap.update({
    where: { id: Number(req.params.id) },
    data: { ...parsed.data, ...(req.file ? { imageUrl: `/uploads/lighting-sitemaps/${req.file.filename}` } : {}) },
  });
  await logAudit({ userId: req.user!.id, action: "lightingSiteMap.update", entityType: "LightingSiteMap", entityId: siteMap.id });
  res.json(siteMap);
});

router.delete("/:id", requirePermission("lighting", "delete"), async (req, res) => {
  await prisma.lightingSiteMap.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "lightingSiteMap.delete", entityType: "LightingSiteMap", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

router.post("/:id/devices", requirePermission("lighting", "edit"), validateBody(placeDeviceSchema), async (req, res) => {
  const siteMapId = Number(req.params.id);
  const placement = await prisma.lightingSiteMapDevice.create({
    data: { siteMapId, deviceId: req.body.deviceId, x: req.body.x, y: req.body.y },
    select: placementSelect,
  });
  await logAudit({ userId: req.user!.id, action: "lightingSiteMap.placeDevice", entityType: "LightingSiteMap", entityId: siteMapId, metadata: { deviceId: req.body.deviceId } });
  res.status(201).json(placement);
});

router.patch("/:id/devices/:placementId", requirePermission("lighting", "edit"), validateBody(updatePlacementSchema), async (req, res) => {
  const placement = await prisma.lightingSiteMapDevice.update({
    where: { id: Number(req.params.placementId) },
    data: req.body,
    select: placementSelect,
  });
  res.json(placement);
});

router.delete("/:id/devices/:placementId", requirePermission("lighting", "edit"), async (req, res) => {
  await prisma.lightingSiteMapDevice.delete({ where: { id: Number(req.params.placementId) } });
  res.json({ ok: true });
});

export default router;
