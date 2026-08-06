import { NextFunction, Request, Response, Router } from "express";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import * as controller from "./users.controller";
import { createUserSchema, inviteUserSchema, resetPasswordSchema, updateUserSchema } from "./users.schema";

const router = Router();
router.use(verifyJwt);

// Stricter than requirePermission("admin", "create") — "Admin" holds that generic permission by
// default too, but sending an invite is meant to stay limited to the two top-tier roles. See the
// matching assertCanInvite() in users.controller.ts (kept there too since this only gates the
// route; the controller check is what actually protects the endpoint).
function requireSystemOrSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.roleName === "System Admin" || req.user?.roleName === "Super Admin") return next();
  return res.status(403).json({ error: "Only a System Admin or Super Admin can invite new users." });
}

router.get("/directory", controller.directory);
router.get("/", requirePermission("admin", "view"), controller.list);
router.get("/:id", requirePermission("admin", "view"), controller.getOne);
router.get("/:id/devices", requirePermission("admin", "view"), controller.devices);
router.post("/", requirePermission("admin", "create"), validateBody(createUserSchema), controller.create);
router.post("/invite", requireSystemOrSuperAdmin, validateBody(inviteUserSchema), controller.invite);
router.patch("/:id", requirePermission("admin", "edit"), validateBody(updateUserSchema), controller.update);
router.post("/:id/reset-password", requirePermission("admin", "edit"), validateBody(resetPasswordSchema), controller.resetPassword);
router.post("/:id/send-magic-link", requirePermission("admin", "edit"), controller.sendMagicLink);
router.delete("/:id", requirePermission("admin", "delete"), controller.remove);

export default router;
