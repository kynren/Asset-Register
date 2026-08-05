import { Router } from "express";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import * as controller from "./stockItemTypes.controller";
import { createStockItemTypeSchema } from "./stockItemTypes.schema";

const router = Router();
router.use(verifyJwt);

router.get("/", requirePermission("stock", "view"), controller.list);
router.post("/", requirePermission("stock", "create"), validateBody(createStockItemTypeSchema), controller.create);

export default router;
