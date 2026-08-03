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
import { DEFAULT_LOGIN_PAGE_DESIGN, loginPageDesignSchema } from "./loginDesign.schema";

const BRANDING_UPLOAD_ROOT = path.join(__dirname, "..", "..", "..", "uploads", "branding");
fs.mkdirSync(BRANDING_UPLOAD_ROOT, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, BRANDING_UPLOAD_ROOT),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
});

const loginImageUpload = multer({
  storage: diskStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpeg|jpg|svg\+xml|x-icon|vnd\.microsoft\.icon|webp)$/.test(file.mimetype)) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

const loginVideoUpload = multer({
  storage: diskStorage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "video/mp4") return cb(new Error("Only mp4 video files are allowed"));
    cb(null, true);
  },
});

const router = Router();
router.use(verifyJwt);

router.get("/", requirePermission("branding", "view"), async (_req, res) => {
  const record = await prisma.loginPageDesign.findUnique({ where: { id: 1 } });
  res.json(record?.config ?? DEFAULT_LOGIN_PAGE_DESIGN);
});

router.put("/", requirePermission("branding", "edit"), validateBody(loginPageDesignSchema), async (req, res) => {
  const config = req.body;
  const record = await prisma.loginPageDesign.upsert({
    where: { id: 1 },
    update: { config, updatedById: req.user!.id },
    create: { id: 1, config, updatedById: req.user!.id },
  });
  await logAudit({ userId: req.user!.id, action: "settings.login_design_update" });
  res.json(record.config);
});

router.post("/upload-image", requirePermission("branding", "edit"), loginImageUpload.single("file"), async (req, res) => {
  if (!req.file) throw new ApiError(400, "Missing file");
  res.status(201).json({ url: `/uploads/branding/${req.file.filename}` });
});

router.post("/upload-video", requirePermission("branding", "edit"), loginVideoUpload.single("file"), async (req, res) => {
  if (!req.file) throw new ApiError(400, "Missing file");
  res.status(201).json({ url: `/uploads/branding/${req.file.filename}` });
});

export default router;
