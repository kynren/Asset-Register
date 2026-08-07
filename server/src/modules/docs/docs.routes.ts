import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import * as controller from "./docs.controller";
import { accessGrantSchema, createCollectionSchema, createDocumentSchema, updateCollectionSchema, updateDocumentSchema } from "./docs.schema";

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "..", "uploads", "docs");
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Memory storage, not disk — the uploaded PDF/Word file is only needed transiently to extract its
// text/HTML into a new Document's sections; it isn't kept as a standing attachment like the upload
// above.
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = Router();
router.use(verifyJwt);

router.get("/", requirePermission("docs", "view"), controller.list);
router.get("/categories", requirePermission("docs", "view"), controller.categories);
router.get("/stats", requirePermission("docs", "view"), controller.stats);
router.get("/library", requirePermission("docs", "view"), controller.libraryFeed);

router.get("/collections", requirePermission("docs", "view"), controller.listCollections);
router.post("/collections", requirePermission("docs", "create"), validateBody(createCollectionSchema), controller.createCollection);
router.patch("/collections/:id", requirePermission("docs", "edit"), validateBody(updateCollectionSchema), controller.updateCollection);
router.delete("/collections/:id", requirePermission("docs", "delete"), controller.removeCollection);

router.get("/template/:docType", requirePermission("docs", "view"), controller.downloadTemplate);
router.get("/import-settings", requirePermission("docs", "view"), controller.getImportSettings);
router.put("/import-settings", requirePermission("docs", "edit"), controller.updateImportSettings);
router.post("/import", requirePermission("docs", "import"), importUpload.single("file"), controller.importDocument);

router.get("/:id", requirePermission("docs", "view"), controller.getOne);
router.get("/:id/export", requirePermission("docs", "view"), controller.exportDocument);
router.post("/", requirePermission("docs", "create"), validateBody(createDocumentSchema), controller.create);
router.patch("/:id", requirePermission("docs", "edit"), validateBody(updateDocumentSchema), controller.update);
router.delete("/:id", requirePermission("docs", "delete"), controller.remove);
router.post("/:id/duplicate", requirePermission("docs", "duplicate"), controller.duplicate);
router.post("/:id/attachments", requirePermission("docs", "edit"), attachmentUpload.single("file"), controller.uploadAttachment);
router.get("/:id/attachments/:attachmentId/file", requirePermission("docs", "view"), controller.downloadAttachment);
router.delete("/:id/attachments/:attachmentId", requirePermission("docs", "edit"), controller.removeAttachment);
router.post("/:id/access", requirePermission("docs", "edit"), validateBody(accessGrantSchema), controller.grantAccess);
router.delete("/:id/access/:kind/:targetId/:level", requirePermission("docs", "edit"), controller.revokeAccess);

export default router;
