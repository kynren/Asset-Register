import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import * as service from "./mediaCenter.service";

const MEDIA_CENTER_UPLOAD_ROOT = path.join(__dirname, "..", "..", "..", "uploads", "media-center");
fs.mkdirSync(MEDIA_CENTER_UPLOAD_ROOT, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, MEDIA_CENTER_UPLOAD_ROOT),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^(image|video|audio)\//.test(file.mimetype) && !/pdf|word|officedocument|text\/|csv|json/.test(file.mimetype)) {
      return cb(new Error("Unsupported file type"));
    }
    cb(null, true);
  },
});

const router = Router();
router.use(verifyJwt);

function noStore(res: import("express").Response) {
  res.setHeader("Cache-Control", "no-store");
}

router.get("/library", requirePermission("app-settings", "view"), async (req, res) => {
  noStore(res);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 24));
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  res.json(await service.listLibrary({ page, pageSize, search, type }));
});

router.post("/library", requirePermission("app-settings", "create"), upload.single("file"), async (req, res) => {
  if (!req.file) throw new ApiError(400, "No file uploaded");
  const asset = await service.uploadAsset(req.file, req.user!.id);
  await logAudit({ userId: req.user!.id, action: "mediaCenter.upload", entityType: "MediaAsset", entityId: asset.id });
  res.status(201).json(asset);
});

router.patch("/library/:id", requirePermission("app-settings", "edit"), async (req, res) => {
  const id = Number(req.params.id);
  const { title, altText, caption, description } = req.body ?? {};
  const asset = await service.updateAsset(id, { title, altText, caption, description });
  await logAudit({ userId: req.user!.id, action: "mediaCenter.update", entityType: "MediaAsset", entityId: id });
  res.json(asset);
});

router.delete("/library/:id", requirePermission("app-settings", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  await service.deleteAsset(id);
  await logAudit({ userId: req.user!.id, action: "mediaCenter.delete", entityType: "MediaAsset", entityId: id });
  res.json({ ok: true });
});

router.get("/attached/sources", requirePermission("app-settings", "view"), (_req, res) => {
  noStore(res);
  res.json(service.getAttachedSources());
});

// Streams the raw file back for inline preview (res.sendFile infers Content-Type from the file
// extension automatically and supports Range requests, so <video>/<audio> scrubbing works) — the
// one place a caller needs this rather than the source's own public url is docAttachments/
// ticketAttachments, which aren't statically mounted; exposed for every source so the client can
// call it uniformly without knowing which sources are public.
router.get("/attached/:sourceKey/:id/preview", requirePermission("app-settings", "view"), async (req, res) => {
  const diskPath = await service.getAttachedDiskPath(req.params.sourceKey, Number(req.params.id));
  if (!diskPath) throw new ApiError(404, "File not found");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(diskPath);
});

router.get("/attached", requirePermission("app-settings", "view"), async (req, res) => {
  noStore(res);
  const sourceKey = typeof req.query.source === "string" ? req.query.source : undefined;
  const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 60));
  res.json(await service.listAttached(sourceKey, limit));
});

router.delete("/attached/:sourceKey/:id", requirePermission("app-settings", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  await service.removeAttached(req.params.sourceKey, id);
  await logAudit({ userId: req.user!.id, action: "mediaCenter.attached_delete", entityType: req.params.sourceKey, entityId: id });
  res.json({ ok: true });
});

export default router;
