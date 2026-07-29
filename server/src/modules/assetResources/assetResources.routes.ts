import fs from "fs";
import path from "path";
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import * as controller from "./assetResources.controller";
import { RESOURCE_CONFIG } from "./assetResources.config";

export const ASSET_RESOURCE_UPLOAD_ROOT = path.join(__dirname, "..", "..", "..", "uploads", "assets");
fs.mkdirSync(ASSET_RESOURCE_UPLOAD_ROOT, { recursive: true });

function validateResource(req: Request, res: Response, next: NextFunction) {
  if (!RESOURCE_CONFIG[req.params.resource]) {
    res.status(404).json({ message: "Unknown asset resource" });
    return;
  }
  next();
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(ASSET_RESOURCE_UPLOAD_ROOT, req.params.resource);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const featuredImageDir = path.join(ASSET_RESOURCE_UPLOAD_ROOT, "featured");
fs.mkdirSync(featuredImageDir, { recursive: true });

const featuredImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, featuredImageDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpeg|jpg|webp|gif|svg\+xml)$/.test(file.mimetype)) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

const router = Router();
router.use(verifyJwt);

router.post("/:assetId/featured-image", requirePermission("assets", "edit"), featuredImageUpload.single("file"), controller.setFeaturedImage);
router.get("/:assetId/:resource", validateResource, requirePermission("assets", "view"), controller.listResource);
router.post("/:assetId/:resource", validateResource, requirePermission("assets", "edit"), upload.any(), controller.createResource);
router.delete("/:assetId/:resource/:itemId", validateResource, requirePermission("assets", "edit"), controller.removeResource);

export default router;
