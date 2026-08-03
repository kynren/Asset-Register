import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { logAudit } from "../../lib/auditLogger";

const router = Router();
router.use(verifyJwt);

const schema = z.object({
  surveySampleRatePercent: z.number().int().min(0).max(100),
  surveyDelayDays: z.number().int().min(0),
  surveyExpireDays: z.number().int().min(1),
  autoCloseDelayDays: z.number().int().min(0),
});

router.get("/", requirePermission("admin", "view"), async (_req, res) => {
  const settings = await prisma.helpdeskSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  res.json(settings);
});

router.put("/", requirePermission("admin", "edit"), validateBody(schema), async (req, res) => {
  const settings = await prisma.helpdeskSettings.upsert({
    where: { id: 1 },
    update: { ...req.body, updatedAt: new Date() },
    create: { id: 1, ...req.body },
  });
  await logAudit({ userId: req.user!.id, action: "helpdeskSettings.update", entityType: "HelpdeskSettings", entityId: 1 });
  res.json(settings);
});

export default router;
