import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import * as controller from "./emailTemplates.controller";
import { createEmailTemplateSchema, sendTestEmailSchema, updateEmailTemplateSchema } from "./emailTemplates.schema";

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "..", "uploads", "email-templates");
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpeg|jpg|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

const router = Router();
router.use(verifyJwt);

router.get("/", requirePermission("admin", "view"), controller.list);
router.get("/:id", requirePermission("admin", "view"), controller.getOne);
router.post("/", requirePermission("admin", "create"), validateBody(createEmailTemplateSchema), controller.create);
router.patch("/:id", requirePermission("admin", "edit"), validateBody(updateEmailTemplateSchema), controller.update);
router.delete("/:id", requirePermission("admin", "delete"), controller.remove);
router.patch("/:id/activate", requirePermission("admin", "edit"), controller.activate);
router.patch("/:id/deactivate", requirePermission("admin", "edit"), controller.deactivate);
router.post("/:id/test", requirePermission("admin", "edit"), validateBody(sendTestEmailSchema), controller.sendTest);
router.post("/images", requirePermission("admin", "edit"), imageUpload.single("file"), controller.uploadImage);

export default router;
