import fs from "fs";
import path from "path";
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { mobileSplashSettingsSchema } from "./mobileSplash.schema";

const SPLASH_UPLOAD_ROOT = path.join(__dirname, "..", "..", "..", "uploads", "mobile-splash");
fs.mkdirSync(SPLASH_UPLOAD_ROOT, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, SPLASH_UPLOAD_ROOT),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
});

// A photo splash is a still frame shown full-bleed for ~1-2s — 8MB comfortably covers a high-res
// export without inviting an accidental multi-hundred-MB camera original.
const photoUpload = multer({
  storage: diskStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(file.mimetype)) return cb(new Error("Only PNG, JPEG, or WebP images are allowed"));
    cb(null, true);
  },
});

// GIFs compress far worse than mp4 for the same motion, so a short looping clip can land in the
// tens of MB — 12MB keeps that usable while still forcing anything heavier down the video path.
const gifUpload = multer({
  storage: diskStorage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "image/gif") return cb(new Error("Only GIF files are allowed"));
    cb(null, true);
  },
});

// mp4/h264 only — the one video format expo-video decodes natively on both iOS and Android
// without a transcode step. 30MB is comfortable for a 3-5s loop at a splash-appropriate
// resolution; longer or heavier files defeat the point of a *loading* screen.
const videoUpload = multer({
  storage: diskStorage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "video/mp4") return cb(new Error("Only mp4 video files are allowed"));
    cb(null, true);
  },
});

// Deliberately narrower than the generic "branding" module permission (which Admin also holds) —
// the mobile splash screen is meant to stay a System Admin/Super Admin-only lever, same reasoning
// as requireSystemOrSuperAdmin in users.routes.ts.
function requireSystemOrSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.roleName === "System Admin" || req.user?.roleName === "Super Admin") return next();
  return res.status(403).json({ error: "Only a System Admin or Super Admin can manage the mobile loading screen." });
}

const DEFAULTS = { enabled: false, mediaType: "PHOTO" as const, mediaUrl: null, backgroundColor: "#0d1117", minDisplayMs: 1500 };

const router = Router();
router.use(verifyJwt);

router.get("/", requireSystemOrSuperAdmin, async (_req, res) => {
  const record = await prisma.mobileSplashSettings.findUnique({ where: { id: 1 } });
  res.json(record ?? DEFAULTS);
});

router.put("/", requireSystemOrSuperAdmin, validateBody(mobileSplashSettingsSchema), async (req, res) => {
  const data = req.body;
  const record = await prisma.mobileSplashSettings.upsert({
    where: { id: 1 },
    update: { ...data, updatedById: req.user!.id },
    create: { id: 1, ...data, updatedById: req.user!.id },
  });
  await logAudit({ userId: req.user!.id, action: "settings.mobile_splash_update" });
  res.json(record);
});

router.post("/upload-photo", requireSystemOrSuperAdmin, photoUpload.single("file"), async (req, res) => {
  if (!req.file) throw new ApiError(400, "Missing file");
  res.status(201).json({ url: `/uploads/mobile-splash/${req.file.filename}` });
});

router.post("/upload-gif", requireSystemOrSuperAdmin, gifUpload.single("file"), async (req, res) => {
  if (!req.file) throw new ApiError(400, "Missing file");
  res.status(201).json({ url: `/uploads/mobile-splash/${req.file.filename}` });
});

router.post("/upload-video", requireSystemOrSuperAdmin, videoUpload.single("file"), async (req, res) => {
  if (!req.file) throw new ApiError(400, "Missing file");
  res.status(201).json({ url: `/uploads/mobile-splash/${req.file.filename}` });
});

export default router;
