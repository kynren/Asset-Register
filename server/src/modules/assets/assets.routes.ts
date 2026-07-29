import { Router } from "express";
import multer from "multer";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import * as controller from "./assets.controller";
import { checkinSchema, checkoutSchema, createAssetSchema, updateAssetSchema } from "./assets.schema";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();
router.use(verifyJwt);

router.get("/", requirePermission("assets", "view"), controller.list);
router.get("/stats", requirePermission("assets", "view"), controller.stats);
router.get("/by-tag/:tag", requirePermission("assets", "view"), controller.getByTag);
router.get("/export", requirePermission("assets", "export"), controller.exportCsv);
router.get("/export.json", requirePermission("assets", "export"), controller.exportJson);
router.get("/:id/history", requirePermission("assets", "view"), controller.history);
router.get("/:id/report", requirePermission("assets", "view"), controller.report);
router.get("/:id/report/pdf", requirePermission("assets", "export"), controller.reportPdf);
router.get("/:id/checkouts", requirePermission("assets", "view"), controller.listCheckouts);
router.post("/:id/checkout", requirePermission("assets", "edit"), validateBody(checkoutSchema), controller.checkoutAsset);
router.post("/:id/checkin", requirePermission("assets", "edit"), validateBody(checkinSchema), controller.checkinAsset);
router.get("/:id", requirePermission("assets", "view"), controller.getOne);
router.post("/", requirePermission("assets", "create"), validateBody(createAssetSchema), controller.create);
router.post("/import", requirePermission("assets", "create"), upload.single("file"), controller.importCsv);
router.post("/:id/duplicate", requirePermission("assets", "create"), controller.duplicate);
router.patch("/:id", requirePermission("assets", "edit"), validateBody(updateAssetSchema), controller.update);
router.delete("/:id", requirePermission("assets", "delete"), controller.remove);

export default router;
