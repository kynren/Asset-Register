import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";

const router = Router();
router.use(verifyJwt);

const submissionSelect = {
  id: true,
  categoryId: true,
  category: { select: { id: true, name: true } },
  name: true,
  submitterName: true,
  submitterEmail: true,
  fieldValues: true,
  status: true,
  reviewNotes: true,
  reviewedById: true,
  reviewedBy: { select: { id: true, firstName: true, lastName: true } },
  resultingAssetId: true,
  createdAt: true,
  reviewedAt: true,
};

router.get("/", requirePermission("assets", "view"), async (req, res) => {
  const status = req.query.status as string | undefined;
  res.json(
    await prisma.assetIntakeSubmission.findMany({
      where: status ? { status: status as any } : undefined,
      select: submissionSelect,
      orderBy: { createdAt: "desc" },
    })
  );
});

// Turns a PENDING submission into a real Asset — the only path by which public-intake data ever
// reaches the Asset table. fieldValues get matched against the category's current formTemplate
// fields by fieldKey (a field removed/renamed since submission is silently skipped, same tolerance
// as assetColumnBuilder.tsx's handling of stale field keys).
router.post("/:id/approve", requirePermission("assets", "edit"), async (req, res) => {
  const id = Number(req.params.id);
  const submission = await prisma.assetIntakeSubmission.findUnique({
    where: { id },
    include: { category: { include: { formTemplate: { include: { fields: true } } } } },
  });
  if (!submission) throw new ApiError(404, "Submission not found");
  if (submission.status !== "PENDING") throw new ApiError(400, "This submission has already been reviewed");

  const asset = await prisma.asset.create({
    data: { assetTag: `INTAKE-${submission.id}`, name: submission.name, categoryId: submission.categoryId },
  });

  const fieldValues = (submission.fieldValues ?? {}) as Record<string, string>;
  const fields = submission.category.formTemplate?.fields ?? [];
  const valuesToCreate = fields.filter((f) => fieldValues[f.fieldKey] != null).map((f) => ({ assetId: asset.id, fieldId: f.id, value: fieldValues[f.fieldKey] }));
  if (valuesToCreate.length) await prisma.assetCustomFieldValue.createMany({ data: valuesToCreate });

  await prisma.assetIntakeSubmission.update({
    where: { id },
    data: { status: "APPROVED", resultingAssetId: asset.id, reviewedById: req.user!.id, reviewedAt: new Date() },
  });
  await logAudit({ userId: req.user!.id, action: "assetIntakeSubmission.approve", entityType: "AssetIntakeSubmission", entityId: id, metadata: { assetId: asset.id } });

  res.json({ ok: true, assetId: asset.id });
});

const rejectSchema = z.object({ reviewNotes: z.string().max(2000).optional() });

router.post("/:id/reject", requirePermission("assets", "edit"), validateBody(rejectSchema), async (req, res) => {
  const id = Number(req.params.id);
  const submission = await prisma.assetIntakeSubmission.findUnique({ where: { id } });
  if (!submission) throw new ApiError(404, "Submission not found");
  if (submission.status !== "PENDING") throw new ApiError(400, "This submission has already been reviewed");

  await prisma.assetIntakeSubmission.update({
    where: { id },
    data: { status: "REJECTED", reviewNotes: req.body.reviewNotes, reviewedById: req.user!.id, reviewedAt: new Date() },
  });
  await logAudit({ userId: req.user!.id, action: "assetIntakeSubmission.reject", entityType: "AssetIntakeSubmission", entityId: id });

  res.json({ ok: true });
});

export default router;
