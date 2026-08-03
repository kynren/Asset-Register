import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { NOTIFICATION_TYPE_SLUGS, updateToastSettingSchema } from "./toastSettings.schema";

const router = Router();
router.use(verifyJwt);

// Always returns one row per known notification type, even if it's never been customized — the
// same padding approach padMissingModulePermissions uses for RolePermission rows a role hasn't
// touched yet. Unmapped types come back with null fields rather than fabricated defaults, since
// the "sensible default" (e.g. asset_checkin -> success) varies per type and only the client's
// NOTIFICATION_TYPES catalog knows it — null tells the client "nothing saved, use your default"
// instead of falsely claiming every unconfigured type was explicitly set to enabled/info.
router.get("/", requirePermission("admin", "view"), async (_req, res) => {
  const settings = await prisma.toastSetting.findMany();
  const byType = new Map(settings.map((s) => [s.type, s]));
  const merged = NOTIFICATION_TYPE_SLUGS.map(
    (type) => byType.get(type) ?? { id: null, type, isEnabled: null, variant: null, title: null, message: null }
  );
  res.json(merged);
});

router.patch("/:type", requirePermission("admin", "edit"), validateBody(updateToastSettingSchema), async (req, res) => {
  const type = req.params.type;
  if (!(NOTIFICATION_TYPE_SLUGS as readonly string[]).includes(type)) {
    throw new ApiError(400, "Unknown notification type");
  }
  const setting = await prisma.toastSetting.upsert({
    where: { type },
    update: { ...req.body, updatedById: req.user!.id },
    create: { type, ...req.body, updatedById: req.user!.id },
  });
  await logAudit({ userId: req.user!.id, action: "toast_settings.update", entityType: "ToastSetting", entityId: setting.id, metadata: req.body });
  res.json(setting);
});

export default router;
