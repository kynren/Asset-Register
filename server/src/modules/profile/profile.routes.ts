import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { getPagination, paginatedResponse } from "../../lib/pagination";

const AVATAR_UPLOAD_ROOT = path.join(__dirname, "..", "..", "..", "uploads", "avatars");
fs.mkdirSync(AVATAR_UPLOAD_ROOT, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AVATAR_UPLOAD_ROOT),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpeg|jpg|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

const router = Router();
router.use(verifyJwt);

const profileSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  accentColor: true,
  roleId: true,
  role: { select: { name: true } },
};

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  avatarUrl: z.string().nullable().optional(),
  accentColor: z.string().nullable().optional(),
});

router.patch("/", validateBody(updateSchema), async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: req.body,
    select: profileSelect,
  });
  await logAudit({ userId: req.user!.id, action: "profile.update", entityType: "User", entityId: user.id, metadata: req.body });
  res.json(user);
});

router.get("/activity", async (req, res) => {
  const { page, pageSize, skip, take } = getPagination(req);
  const where = { userId: req.user!.id };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.auditLog.count({ where }),
  ]);
  res.json(paginatedResponse(items, total, page, pageSize));
});

router.get("/devices", async (req, res) => {
  const assets = await prisma.asset.findMany({
    where: { assignedToId: req.user!.id },
    include: { device: true, category: true, location: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(assets);
});

router.get("/images", async (req, res) => {
  const images = await prisma.userImage.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
  res.json(images);
});

router.post("/images", avatarUpload.single("file"), async (req, res) => {
  if (!req.file) throw new ApiError(400, "No file uploaded");
  const url = `/uploads/avatars/${req.file.filename}`;
  const image = await prisma.userImage.create({ data: { userId: req.user!.id, url } });
  await logAudit({ userId: req.user!.id, action: "profile.image_upload", entityType: "User", entityId: req.user!.id });
  res.status(201).json(image);
});

router.delete("/images/:id", async (req, res) => {
  const image = await prisma.userImage.findUnique({ where: { id: Number(req.params.id) } });
  if (!image || image.userId !== req.user!.id) throw new ApiError(404, "Image not found");

  const filePath = path.join(AVATAR_UPLOAD_ROOT, path.basename(image.url));
  await prisma.userImage.delete({ where: { id: image.id } });
  if (fs.existsSync(filePath)) fs.unlink(filePath, () => undefined);

  res.json({ ok: true });
});

export default router;
