import { Router } from "express";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import * as controller from "./roles.controller";
import { createRoleSchema, updatePermissionsSchema, updateRoleSchema } from "./roles.schema";

const router = Router();
router.use(verifyJwt);

router.get("/", requirePermission("admin", "view"), controller.list);
router.get("/:id", requirePermission("admin", "view"), controller.getOne);
router.post("/", requirePermission("admin", "create"), validateBody(createRoleSchema), controller.create);
router.patch("/:id", requirePermission("admin", "edit"), validateBody(updateRoleSchema), controller.update);
router.put("/:id/permissions", requirePermission("admin", "edit"), validateBody(updatePermissionsSchema), controller.updatePermissions);
router.delete("/:id", requirePermission("admin", "delete"), controller.remove);

export default router;
