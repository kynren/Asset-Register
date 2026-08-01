import { Router } from "express";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import * as controller from "./users.controller";
import { createUserSchema, resetPasswordSchema, updateUserSchema } from "./users.schema";

const router = Router();
router.use(verifyJwt);

router.get("/directory", controller.directory);
router.get("/", requirePermission("admin", "view"), controller.list);
router.get("/:id", requirePermission("admin", "view"), controller.getOne);
router.get("/:id/devices", requirePermission("admin", "view"), controller.devices);
router.post("/", requirePermission("admin", "create"), validateBody(createUserSchema), controller.create);
router.patch("/:id", requirePermission("admin", "edit"), validateBody(updateUserSchema), controller.update);
router.post("/:id/reset-password", requirePermission("admin", "edit"), validateBody(resetPasswordSchema), controller.resetPassword);
router.post("/:id/send-magic-link", requirePermission("admin", "edit"), controller.sendMagicLink);
router.delete("/:id", requirePermission("admin", "delete"), controller.remove);

export default router;
