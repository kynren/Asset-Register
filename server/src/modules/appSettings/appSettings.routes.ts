import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { createOrganizationSchema, switchOrganizationSchema, updateOrganizationSchema } from "./appSettings.schema";
import * as controller from "./appSettings.controller";

const ORG_LOGO_UPLOAD_ROOT = path.join(__dirname, "..", "..", "..", "uploads", "org-logos");
fs.mkdirSync(ORG_LOGO_UPLOAD_ROOT, { recursive: true });

const orgLogoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ORG_LOGO_UPLOAD_ROOT),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpeg|jpg|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(file.mimetype)) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

const router = Router();
router.use(verifyJwt);

router.get("/organizations", requirePermission("app-settings", "view"), controller.listOrgs);
router.post("/organizations", requirePermission("app-settings", "create"), validateBody(createOrganizationSchema), controller.createOrg);
router.patch("/organizations/:id", requirePermission("app-settings", "edit"), validateBody(updateOrganizationSchema), controller.updateOrg);
router.post("/organizations/:id/logo", requirePermission("app-settings", "edit"), orgLogoUpload.single("file"), controller.uploadOrgLogo);
router.post("/organizations/:id/switch", requirePermission("app-settings", "view"), validateBody(switchOrganizationSchema), controller.switchOrganization);

export default router;
