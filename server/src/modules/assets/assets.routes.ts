import { Router } from "express";
import multer from "multer";
import { verifyJwt } from "../../middleware/auth";
import { requireAssetOrHarnessPermission, requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import * as controller from "./assets.controller";
import { checkinSchema, checkoutSchema, createAssetSchema, initPortsSchema, updateAssetSchema, updatePortSchema } from "./assets.schema";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();
router.use(verifyJwt);

router.get("/", requireAssetOrHarnessPermission("view"), controller.list);
router.get("/stats", requirePermission("assets", "view"), controller.stats);
router.get("/by-tag/:tag", requirePermission("assets", "view"), controller.getByTag);
router.get("/export", requirePermission("assets", "export"), controller.exportCsv);
router.get("/export.json", requirePermission("assets", "export"), controller.exportJson);
router.get("/show-status", requirePermission("assets", "view"), controller.showStatus);
router.get("/:id/history", requirePermission("assets", "view"), controller.history);
router.get("/:id/report", requirePermission("assets", "view"), controller.report);
router.get("/:id/report/pdf", requirePermission("assets", "export"), controller.reportPdf);
router.get("/:id/harness-report/pdf", requirePermission("harness", "export"), controller.harnessReportPdf);
router.get("/:id/checkouts", requirePermission("assets", "view"), controller.listCheckouts);
router.get("/:id/ping", requirePermission("assets", "view"), controller.pingAsset);
router.get("/:id/ports", requirePermission("network", "view"), controller.listPorts);
router.post("/:id/ports/init", requirePermission("network", "edit"), validateBody(initPortsSchema), controller.initPorts);
router.patch("/:id/ports/:portId", requirePermission("network", "edit"), validateBody(updatePortSchema), controller.updatePort);
router.delete("/:id/ports/:portId", requirePermission("network", "edit"), controller.deletePort);
router.post("/:id/checkout", requirePermission("assets", "edit"), validateBody(checkoutSchema), controller.checkoutAsset);
router.post("/:id/checkin", requirePermission("assets", "edit"), validateBody(checkinSchema), controller.checkinAsset);
router.get("/:id", requireAssetOrHarnessPermission("view"), controller.getOne);
router.post("/", requireAssetOrHarnessPermission("create"), validateBody(createAssetSchema), controller.create);
router.post("/import/preview", requirePermission("assets", "create"), upload.single("file"), controller.importPreview);
router.post("/import", requirePermission("assets", "create"), upload.single("file"), controller.importCsv);
router.post("/:id/duplicate", requirePermission("assets", "create"), controller.duplicate);
router.patch("/:id", requireAssetOrHarnessPermission("edit"), validateBody(updateAssetSchema), controller.update);
router.delete("/:id", requireAssetOrHarnessPermission("delete"), controller.remove);

export default router;
