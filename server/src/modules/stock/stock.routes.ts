import { Router } from "express";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import * as controller from "./stock.controller";
import { createStockItemSchema, createTransactionSchema, createTransferSchema, updateStockItemSchema } from "./stock.schema";

const router = Router();
router.use(verifyJwt);

router.get("/", requirePermission("stock", "view"), controller.list);
router.get("/low-stock", requirePermission("stock", "view"), controller.lowStock);
router.get("/analytics", requirePermission("stock", "view"), controller.analytics);
router.get("/:id", requirePermission("stock", "view"), controller.getOne);
router.post("/", requirePermission("stock", "create"), validateBody(createStockItemSchema), controller.create);
router.patch("/:id", requirePermission("stock", "edit"), validateBody(updateStockItemSchema), controller.update);
router.delete("/:id", requirePermission("stock", "delete"), controller.remove);
router.post("/:id/transactions", requirePermission("stock", "edit"), validateBody(createTransactionSchema), controller.addTransaction);
router.post("/:id/transfer", requirePermission("stock", "edit"), validateBody(createTransferSchema), controller.transferStock);

export default router;
