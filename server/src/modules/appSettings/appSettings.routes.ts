import { Router } from "express";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { createOrganizationSchema, updateOrganizationSchema } from "./appSettings.schema";
import * as controller from "./appSettings.controller";

const router = Router();
router.use(verifyJwt);

router.get("/organizations", requirePermission("app-settings", "view"), controller.listOrgs);
router.post("/organizations", requirePermission("app-settings", "create"), validateBody(createOrganizationSchema), controller.createOrg);
router.patch("/organizations/:id", requirePermission("app-settings", "edit"), validateBody(updateOrganizationSchema), controller.updateOrg);
router.post("/organizations/:id/switch", requirePermission("app-settings", "view"), controller.switchOrganization);

export default router;
