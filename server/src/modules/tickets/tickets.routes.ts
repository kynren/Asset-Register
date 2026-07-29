import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import * as controller from "./tickets.controller";
import {
  addCommentSchema,
  createTicketSchema,
  satisfactionSchema,
  updateStatusSchema,
  updateTicketSchema,
} from "./tickets.schema";

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "..", "uploads", "tickets");
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
      cb(null, unique);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const router = Router();
router.use(verifyJwt);

router.get("/", requirePermission("helpdesk", "view"), controller.list);
router.get("/:id", requirePermission("helpdesk", "view"), controller.getOne);
router.post("/", requirePermission("helpdesk", "create"), validateBody(createTicketSchema), controller.create);
router.patch("/:id", requirePermission("helpdesk", "edit"), validateBody(updateTicketSchema), controller.update);
router.patch("/:id/status", requirePermission("helpdesk", "edit"), validateBody(updateStatusSchema), controller.updateStatus);
router.post("/:id/comments", requirePermission("helpdesk", "edit"), validateBody(addCommentSchema), controller.addComment);
router.post("/:id/watch", requirePermission("helpdesk", "view"), controller.toggleWatch);
router.post("/:id/satisfaction", requirePermission("helpdesk", "view"), validateBody(satisfactionSchema), controller.submitSatisfaction);
router.post("/:id/attachments", requirePermission("helpdesk", "edit"), upload.single("file"), controller.addAttachment);
router.get("/:id/attachments/:attachmentId", requirePermission("helpdesk", "view"), controller.downloadAttachment);
router.delete("/:id/attachments/:attachmentId", requirePermission("helpdesk", "edit"), controller.deleteAttachment);
router.delete("/:id", requirePermission("helpdesk", "delete"), controller.remove);

export default router;
