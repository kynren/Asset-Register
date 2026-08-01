import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import * as controller from "./docs.controller";
import { createCollectionSchema, createDocumentSchema, updateCollectionSchema, updateDocumentSchema } from "./docs.schema";

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "..", "uploads", "docs");
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();
router.use(verifyJwt);

router.get("/", requirePermission("docs", "view"), controller.list);
router.get("/categories", requirePermission("docs", "view"), controller.categories);
router.get("/library", requirePermission("docs", "view"), controller.libraryFeed);

router.get("/collections", requirePermission("docs", "view"), controller.listCollections);
router.post("/collections", requirePermission("docs", "create"), validateBody(createCollectionSchema), controller.createCollection);
router.patch("/collections/:id", requirePermission("docs", "edit"), validateBody(updateCollectionSchema), controller.updateCollection);
router.delete("/collections/:id", requirePermission("docs", "delete"), controller.removeCollection);

router.get("/:id", requirePermission("docs", "view"), controller.getOne);
router.post("/", requirePermission("docs", "create"), validateBody(createDocumentSchema), controller.create);
router.patch("/:id", requirePermission("docs", "edit"), validateBody(updateDocumentSchema), controller.update);
router.delete("/:id", requirePermission("docs", "delete"), controller.remove);
router.post("/:id/duplicate", requirePermission("docs", "create"), controller.duplicate);
router.post("/:id/attachments", requirePermission("docs", "edit"), attachmentUpload.single("file"), controller.uploadAttachment);
router.get("/:id/attachments/:attachmentId/file", requirePermission("docs", "view"), controller.downloadAttachment);
router.delete("/:id/attachments/:attachmentId", requirePermission("docs", "edit"), controller.removeAttachment);

export default router;
