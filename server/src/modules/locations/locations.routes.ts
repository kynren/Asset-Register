import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { logAudit } from "../../lib/auditLogger";
import { ApiError } from "../../middleware/errorHandler";
import { importCsvRows } from "../../lib/csvImport";

const router = Router();
router.use(verifyJwt);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const schema = z.object({ name: z.string().min(1), address: z.string().optional() });

// No module-specific gate here (just verifyJwt above) — Locations is a shared reference list
// pulled into forms across Assets, Stock, and NVR/Cameras, so any authenticated user needs to
// read it regardless of which of those modules they actually have view access to.
router.get("/", async (_req, res) => {
  res.json(await prisma.location.findMany({ orderBy: { name: "asc" } }));
});

router.post("/", requirePermission("admin", "create"), validateBody(schema), async (req, res) => {
  const location = await prisma.location.create({ data: req.body });
  await logAudit({ userId: req.user!.id, action: "location.create", entityType: "Location", entityId: location.id });
  res.status(201).json(location);
});

router.patch("/:id", requirePermission("admin", "edit"), validateBody(schema), async (req, res) => {
  const location = await prisma.location.update({ where: { id: Number(req.params.id) }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "location.update", entityType: "Location", entityId: location.id });
  res.json(location);
});

router.delete("/:id", requirePermission("admin", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  const [assetCount, stockItemCount, stockLevelCount, nvrCount, cameraCount] = await Promise.all([
    prisma.asset.count({ where: { locationId: id } }),
    prisma.stockItem.count({ where: { locationId: id } }),
    prisma.stockLevel.count({ where: { locationId: id } }),
    prisma.nvr.count({ where: { locationId: id } }),
    prisma.camera.count({ where: { locationId: id } }),
  ]);
  const inUseCount = assetCount + stockItemCount + stockLevelCount + nvrCount + cameraCount;
  if (inUseCount > 0) {
    throw new ApiError(400, `This location is still assigned to ${inUseCount} record${inUseCount === 1 ? "" : "s"} (assets, stock, or NVR/cameras). Reassign or clear those first.`);
  }
  await prisma.location.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "location.delete", entityType: "Location", entityId: id });
  res.json({ ok: true });
});

// CSV columns: Name (required), Address (optional). One "location.create" audit entry per row
// rather than per import, matching how the CSV wizard's created records read in Recent Activity.
router.post("/import", requirePermission("admin", "import"), upload.single("file"), async (req, res) => {
  if (!req.file) throw new ApiError(400, "No file uploaded");
  const result = await importCsvRows(req.file.buffer, async (row) => {
    const name = (row.Name ?? row.name ?? "").trim();
    if (!name) throw new Error("Missing Name");
    const location = await prisma.location.create({ data: { name, address: (row.Address ?? row.address ?? "").trim() || undefined } });
    await logAudit({ userId: req.user!.id, action: "location.create", entityType: "Location", entityId: location.id });
  });
  res.json(result);
});

router.post("/:id/duplicate", requirePermission("admin", "duplicate"), async (req, res) => {
  const id = Number(req.params.id);
  const source = await prisma.location.findUnique({ where: { id } });
  if (!source) throw new ApiError(404, "Location not found");

  let newName = `${source.name} (Copy)`;
  let suffix = 1;
  while (await prisma.location.findUnique({ where: { name: newName } })) {
    suffix += 1;
    newName = `${source.name} (Copy ${suffix})`;
  }

  const clone = await prisma.location.create({ data: { name: newName, address: source.address } });
  await logAudit({ userId: req.user!.id, action: "location.duplicate", entityType: "Location", entityId: clone.id, metadata: { sourceId: id } });
  res.status(201).json(clone);
});

export default router;
