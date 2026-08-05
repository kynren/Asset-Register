import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import * as controller from "./stock.controller";
import { createStockItemSchema, createTransactionSchema, createTransferSchema, updateStockItemSchema } from "./stock.schema";

const STOCK_ATTACHMENTS_DIR = path.join(__dirname, "..", "..", "..", "uploads", "stock-attachments");
fs.mkdirSync(STOCK_ATTACHMENTS_DIR, { recursive: true });

// Larger cap than Media Center's default (30MB) since short device/coverage videos are an explicit
// requirement here, not just photos.
const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STOCK_ATTACHMENTS_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 150 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^(image|video)\//.test(file.mimetype)) return cb(new Error("Only image or video files are allowed"));
    cb(null, true);
  },
});

const STOCK_SIGNATURES_DIR = path.join(__dirname, "..", "..", "..", "uploads", "stock-signatures");
fs.mkdirSync(STOCK_SIGNATURES_DIR, { recursive: true });

// Signature pad exports a small PNG blob via canvas.toBlob(), never a real file — small cap is fine.
const signatureUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STOCK_SIGNATURES_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname) || ".png"}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error("Signature must be an image"));
    cb(null, true);
  },
});

const router = Router();
router.use(verifyJwt);

router.get("/", requirePermission("stock", "view"), controller.list);
router.get("/low-stock", requirePermission("stock", "view"), controller.lowStock);
router.get("/analytics", requirePermission("stock", "view"), controller.analytics);
router.get("/stats", requirePermission("stock", "view"), controller.stats);
router.get("/by-sku/:sku", requirePermission("stock", "view"), controller.getBySku);
router.get("/issuances/:id/receipt.pdf", requirePermission("stock", "view"), controller.issuanceReceiptPdf);
router.get("/:id", requirePermission("stock", "view"), controller.getOne);
router.post("/", requirePermission("stock", "create"), validateBody(createStockItemSchema), controller.create);
router.patch("/:id", requirePermission("stock", "edit"), validateBody(updateStockItemSchema), controller.update);
router.delete("/:id", requirePermission("stock", "delete"), controller.remove);
router.post("/:id/duplicate", requirePermission("stock", "create"), controller.duplicate);
router.post("/:id/transactions", requirePermission("stock", "edit"), validateBody(createTransactionSchema), controller.addTransaction);
router.post("/:id/transfer", requirePermission("stock", "edit"), validateBody(createTransferSchema), controller.transferStock);
router.post("/:id/attachments", requirePermission("stock", "edit"), attachmentUpload.single("file"), controller.uploadAttachment);
router.delete("/:id/attachments/:attachmentId", requirePermission("stock", "edit"), controller.removeAttachment);
router.post("/:id/issue", requirePermission("stock", "edit"), signatureUpload.single("signature"), controller.issueStock);

export default router;
