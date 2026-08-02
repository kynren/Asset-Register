import { Router } from "express";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { createOrganizationSchema } from "./appSettings.schema";
import * as controller from "./appSettings.controller";

const router = Router();
router.use(verifyJwt);

router.get("/organizations", requirePermission("app-settings", "view"), controller.listOrgs);
router.post("/organizations", requirePermission("app-settings", "create"), validateBody(createOrganizationSchema), controller.createOrg);

export default router;
