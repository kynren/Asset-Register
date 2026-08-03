import { Router } from "express";
import { verifyJwt } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import * as savedViews from "./savedViews.controller";
import { createSavedViewSchema, filtersSchema, renameSavedViewSchema, shareSavedViewSchema } from "./savedViews.schema";

const router = Router();
router.use(verifyJwt);

// Named, shareable filter/column presets for any DataTable (identified by its tableId prop) — the
// underlying table's own data endpoint already enforces module RBAC, so these routes only need to
// gate on ownership/sharing of the saved view row itself, not a second module permission check.
router.get("/", savedViews.listSavedViews);
router.get("/default", savedViews.getDefault);
router.get("/shared-with-me", savedViews.listSharedWithMe);
router.post("/", validateBody(createSavedViewSchema), savedViews.createSavedView);
router.patch("/:id", validateBody(renameSavedViewSchema), savedViews.renameSavedView);
router.delete("/:id", savedViews.deleteSavedView);
router.post("/:id/duplicate", savedViews.duplicateSavedView);
router.get("/:id/filters", savedViews.getFilters);
router.put("/:id/filters", validateBody(filtersSchema), savedViews.putFilters);
router.get("/:id/shares", savedViews.listShares);
router.post("/:id/shares", validateBody(shareSavedViewSchema), savedViews.createShare);
router.delete("/:id/shares/:shareId", savedViews.deleteShare);

export default router;
