import { Request, Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { generateCaptcha, verifyCaptcha } from "../../lib/captcha";
import { isRateLimited } from "../../lib/simpleRateLimit";
import { getUserIdsWithPermission, notifyUsers } from "../../lib/notify";

// Unauthenticated routes — the app's first public write path. Reachable only via a per-category
// publicIntakeToken an admin explicitly generates (see assetCategories.routes.ts's
// /:id/public-intake). A submission here never creates an Asset directly; it lands as a PENDING
// AssetIntakeSubmission that a staff member must review and approve (assetIntakeAdmin.routes.ts).
const router = Router();

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return first?.trim() || req.socket.remoteAddress || "unknown";
}

router.get("/:token", async (req, res) => {
  if (isRateLimited(`intake-get:${clientIp(req)}`, 30, 60 * 60 * 1000)) {
    throw new ApiError(429, "Too many requests. Please try again later.");
  }

  const category = await prisma.assetCategory.findUnique({
    where: { publicIntakeToken: req.params.token },
    select: {
      id: true,
      name: true,
      publicIntakeEnabled: true,
      formTemplate: {
        select: { fields: { orderBy: { order: "asc" }, select: { id: true, label: true, fieldKey: true, fieldType: true, required: true, options: true } } },
      },
    },
  });
  if (!category || !category.publicIntakeEnabled) throw new ApiError(404, "This intake link is no longer available.");

  const captcha = generateCaptcha();
  res.json({
    categoryName: category.name,
    fields: category.formTemplate?.fields ?? [],
    captchaQuestion: captcha.question,
    captchaToken: captcha.token,
  });
});

const submitSchema = z.object({
  name: z.string().min(1).max(200),
  submitterName: z.string().max(200).optional(),
  submitterEmail: z.union([z.string().email(), z.literal("")]).optional(),
  fieldValues: z.record(z.string()).optional(),
  captchaToken: z.string().min(1),
  captchaAnswer: z.number(),
});

router.post("/:token", validateBody(submitSchema), async (req, res) => {
  const ip = clientIp(req);
  if (isRateLimited(`intake-post:${ip}`, 5, 60 * 60 * 1000)) {
    throw new ApiError(429, "Too many submissions from this address. Please try again later.");
  }
  if (!verifyCaptcha(req.body.captchaToken, req.body.captchaAnswer)) {
    throw new ApiError(400, "That verification answer wasn't right — please try again.");
  }

  const category = await prisma.assetCategory.findUnique({ where: { publicIntakeToken: req.params.token } });
  if (!category || !category.publicIntakeEnabled) throw new ApiError(404, "This intake link is no longer available.");

  const submission = await prisma.assetIntakeSubmission.create({
    data: {
      categoryId: category.id,
      name: req.body.name,
      submitterName: req.body.submitterName || null,
      submitterEmail: req.body.submitterEmail || null,
      fieldValues: req.body.fieldValues ?? {},
      ipAddress: ip,
    },
  });

  const reviewerIds = await getUserIdsWithPermission("assets", "canEdit");
  await notifyUsers({
    userIds: reviewerIds,
    type: "asset_intake_submitted",
    message: `New intake submission "${submission.name}" awaiting review for ${category.name}`,
    linkUrl: "/asset-intake",
  });

  res.status(201).json({ ok: true });
});

export default router;
