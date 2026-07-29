import { Router } from "express";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import * as controller from "./devices.controller";

const router = Router();
router.use(verifyJwt);

router.get("/", requirePermission("network", "view"), controller.list);
router.get("/:id", requirePermission("network", "view"), controller.getOne);
router.delete("/:id", requirePermission("network", "delete"), controller.remove);

export default router;
