import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { RECORD_ACCESS_BYPASS_ROLE_NAMES } from "../../lib/recordAccess";

const router = Router();
router.use(verifyJwt);

// Which entity types a comment thread is allowed on — a plain allowlist (same spirit as
// RecordAccessGrant's entityType) rather than a typed relation per entity, so new entity types
// can be added here without a schema change.
const ALLOWED_ENTITY_TYPES = ["Asset", "StockItem"];

function assertKnownEntityType(entityType: string) {
  if (!ALLOWED_ENTITY_TYPES.includes(entityType)) throw new ApiError(400, `Unknown comment entity type "${entityType}"`);
}

const authorSelect = { id: true, firstName: true, lastName: true, avatarUrl: true } as const;

router.get("/:entityType/:entityId", async (req, res) => {
  const { entityType } = req.params;
  const entityId = Number(req.params.entityId);
  assertKnownEntityType(entityType);
  const comments = await prisma.recordComment.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: authorSelect } },
  });
  res.json(comments);
});

const createSchema = z.object({ body: z.string().trim().min(1).max(4000) });

router.post("/:entityType/:entityId", validateBody(createSchema), async (req, res) => {
  const { entityType } = req.params;
  const entityId = Number(req.params.entityId);
  assertKnownEntityType(entityType);
  const comment = await prisma.recordComment.create({
    data: { entityType, entityId, authorId: req.user!.id, body: req.body.body },
    include: { author: { select: authorSelect } },
  });
  res.status(201).json(comment);
});

const updateSchema = z.object({ body: z.string().trim().min(1).max(4000) });

router.patch("/:id", validateBody(updateSchema), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.recordComment.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Comment not found");
  if (existing.authorId !== req.user!.id && !RECORD_ACCESS_BYPASS_ROLE_NAMES.includes(req.user!.roleName)) {
    throw new ApiError(403, "You can only edit your own comments");
  }
  const comment = await prisma.recordComment.update({
    where: { id },
    data: { body: req.body.body },
    include: { author: { select: authorSelect } },
  });
  res.json(comment);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.recordComment.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Comment not found");
  if (existing.authorId !== req.user!.id && !RECORD_ACCESS_BYPASS_ROLE_NAMES.includes(req.user!.roleName)) {
    throw new ApiError(403, "You can only delete your own comments");
  }
  await prisma.recordComment.delete({ where: { id } });
  res.status(204).end();
});

export default router;
