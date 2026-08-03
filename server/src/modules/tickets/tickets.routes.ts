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
  answerApprovalSchema,
  answerSolutionSchema,
  attachKnowledgeArticleSchema,
  createLinkSchema,
  createSolutionSchema,
  createTaskSchema,
  createTicketSchema,
  requestApprovalSchema,
  satisfactionSchema,
  updateStatusSchema,
  updateTaskSchema,
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
// Registered before "/:id" — otherwise the ":id" param route would swallow this literal segment.
router.get("/approvals", requirePermission("helpdesk", "view"), controller.listMyApprovals);
router.get("/stats", requirePermission("helpdesk", "view"), controller.stats);
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

router.post("/:id/tasks", requirePermission("helpdesk", "edit"), validateBody(createTaskSchema), controller.createTask);
router.patch("/:id/tasks/:taskId", requirePermission("helpdesk", "edit"), validateBody(updateTaskSchema), controller.updateTask);
router.delete("/:id/tasks/:taskId", requirePermission("helpdesk", "edit"), controller.deleteTask);

router.post("/:id/solutions", requirePermission("helpdesk", "edit"), validateBody(createSolutionSchema), controller.proposeSolution);
router.post("/:id/solutions/:solutionId/answer", requirePermission("helpdesk", "view"), validateBody(answerSolutionSchema), controller.answerSolution);

router.post("/:id/approvals", requirePermission("helpdesk", "edit"), validateBody(requestApprovalSchema), controller.requestApproval);
router.post("/:id/approvals/:approvalId/answer", requirePermission("helpdesk", "view"), validateBody(answerApprovalSchema), controller.answerApproval);

router.post("/:id/links", requirePermission("helpdesk", "edit"), validateBody(createLinkSchema), controller.createLink);
router.delete("/:id/links/:linkId", requirePermission("helpdesk", "edit"), controller.deleteLink);

router.post("/:id/knowledge-articles", requirePermission("helpdesk", "edit"), validateBody(attachKnowledgeArticleSchema), controller.attachKnowledgeArticle);
router.delete("/:id/knowledge-articles/:linkId", requirePermission("helpdesk", "edit"), controller.detachKnowledgeArticle);

router.delete("/:id", requirePermission("helpdesk", "delete"), controller.remove);

export default router;
