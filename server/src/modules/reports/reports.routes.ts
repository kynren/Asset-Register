import { Router } from "express";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import * as reports from "./reports.controller";
import { createReportSchema, emailReportSchema, previewReportSchema, shareReportSchema, updateReportSchema } from "./reports.schema";

const router = Router();
router.use(verifyJwt);

router.get("/", requirePermission("reports", "view"), reports.listReports);
router.get("/shared-with-me", requirePermission("reports", "view"), reports.listSharedWithMe);
router.post("/preview", requirePermission("reports", "view"), validateBody(previewReportSchema), reports.previewSpec);
router.post("/", requirePermission("reports", "create"), validateBody(createReportSchema), reports.createReport);
router.get("/:id", requirePermission("reports", "view"), reports.getReport);
router.patch("/:id", requirePermission("reports", "edit"), validateBody(updateReportSchema), reports.updateReport);
router.delete("/:id", requirePermission("reports", "delete"), reports.deleteReport);
router.post("/:id/duplicate", requirePermission("reports", "create"), reports.duplicateReport);
router.get("/:id/run", requirePermission("reports", "view"), reports.runReport);
router.get("/:id/export.csv", requirePermission("reports", "export"), reports.exportCsv);
router.get("/:id/export.pdf", requirePermission("reports", "export"), reports.exportPdf);
router.get("/:id/preview.pdf", requirePermission("reports", "export"), reports.previewPdf);
router.post("/:id/email", requirePermission("reports", "export"), validateBody(emailReportSchema), reports.emailReport);
router.get("/:id/shares", requirePermission("reports", "view"), reports.listShares);
router.post("/:id/shares", requirePermission("reports", "edit"), validateBody(shareReportSchema), reports.createShare);
router.delete("/:id/shares/:shareId", requirePermission("reports", "edit"), reports.deleteShare);

export default router;
