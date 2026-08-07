import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { RECORD_ACCESS_BYPASS_ROLE_NAMES, grantRecordAccess, hasRecordAccess, listRecordAccess, listRecordAccessBatch, revokeRecordAccess } from "../../lib/recordAccess";

const router = Router();
router.use(verifyJwt);

const ENTITY_TYPE = "KnowledgeArticle";

const articleSelect = {
  id: true,
  title: true,
  content: true,
  category: true,
  createdById: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  createdAt: true,
  updatedAt: true,
};

router.get("/", requirePermission("operations", "view"), async (req, res) => {
  const search = req.query.search as string | undefined;
  const where = search
    ? { OR: [{ title: { contains: search, mode: "insensitive" as const } }, { content: { contains: search, mode: "insensitive" as const } }] }
    : {};
  const articles = await prisma.knowledgeArticle.findMany({ where, select: articleSelect, orderBy: { updatedAt: "desc" } });
  const accessByArticle = await listRecordAccessBatch(ENTITY_TYPE, articles.map((a) => a.id));
  res.json(articles.map((a) => ({ ...a, access: accessByArticle.get(a.id) ?? [] })));
});

const accessGrantSchema = z
  .object({ userId: z.number().int().optional(), teamId: z.number().int().optional(), level: z.enum(["EDIT", "DELETE", "DUPLICATE"]) })
  .refine((v) => (v.userId != null) !== (v.teamId != null), { message: "Provide exactly one of userId or teamId" });

const articleSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  category: z.string().optional(),
  access: z.array(accessGrantSchema).optional(),
});

router.post("/", requirePermission("operations", "create"), validateBody(articleSchema), async (req, res) => {
  const { access, ...data } = req.body as z.infer<typeof articleSchema>;
  const article = await prisma.knowledgeArticle.create({ data: { ...data, createdById: req.user!.id }, select: articleSelect });
  for (const grant of access ?? []) {
    const target = grant.userId != null ? { userId: grant.userId } : { teamId: grant.teamId! };
    await grantRecordAccess(ENTITY_TYPE, article.id, target, grant.level, req.user!.id);
  }
  await logAudit({ userId: req.user!.id, action: "operations.knowledge.create", entityType: "KnowledgeArticle", entityId: article.id });
  res.status(201).json({ ...article, access: await listRecordAccess(ENTITY_TYPE, article.id) });
});

// Editing/deleting is restricted to the creator, System Admin, and anyone explicitly granted
// EDIT/DELETE access (see server/src/lib/recordAccess.ts) — requirePermission still gates whether
// the user's role can touch articles at all, but not whether they may touch *this* one.
router.patch("/:id", requirePermission("operations", "edit"), validateBody(articleSchema.partial()), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.knowledgeArticle.findUnique({ where: { id }, select: { id: true, createdById: true } });
  if (!existing) throw new ApiError(404, "Article not found");

  const canEdit = await hasRecordAccess(ENTITY_TYPE, id, existing, req.user!.id, req.user!.roleName, "EDIT");
  if (!canEdit) throw new ApiError(403, "Only the article's creator or someone they've granted edit access to can update it");

  const { access, ...data } = req.body as Partial<z.infer<typeof articleSchema>>;
  const article = await prisma.knowledgeArticle.update({ where: { id }, data, select: articleSelect });
  await logAudit({ userId: req.user!.id, action: "operations.knowledge.update", entityType: "KnowledgeArticle", entityId: id });
  res.json({ ...article, access: await listRecordAccess(ENTITY_TYPE, id) });
});

router.delete("/:id", requirePermission("operations", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  const article = await prisma.knowledgeArticle.findUnique({ where: { id } });
  if (!article) throw new ApiError(404, "Article not found");

  const canDelete = await hasRecordAccess(ENTITY_TYPE, id, article, req.user!.id, req.user!.roleName, "DELETE");
  if (!canDelete) throw new ApiError(403, "Only the article's creator, someone they've granted delete access to, or a System/Super Admin can delete it");

  await prisma.recordAccessGrant.deleteMany({ where: { entityType: ENTITY_TYPE, entityId: id } });
  await prisma.knowledgeArticle.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "operations.knowledge.delete", entityType: "KnowledgeArticle", entityId: id });
  res.json({ ok: true });
});

router.post("/:id/duplicate", requirePermission("operations", "duplicate"), async (req, res) => {
  const id = Number(req.params.id);
  const source = await prisma.knowledgeArticle.findUnique({ where: { id } });
  if (!source) throw new ApiError(404, "Article not found");

  const canDuplicate = await hasRecordAccess(ENTITY_TYPE, id, source, req.user!.id, req.user!.roleName, "DUPLICATE");
  if (!canDuplicate) throw new ApiError(403, "Only the article's creator or someone they've granted duplicate access to can duplicate it");

  const clone = await prisma.knowledgeArticle.create({
    data: { title: `${source.title} (Copy)`, content: source.content, category: source.category, createdById: req.user!.id },
    select: articleSelect,
  });
  await logAudit({ userId: req.user!.id, action: "operations.knowledge.duplicate", entityType: "KnowledgeArticle", entityId: clone.id, metadata: { sourceId: id } });
  res.status(201).json({ ...clone, access: [] });
});

// ───────────────────────── Access grants (creator-only grant/revoke, EDIT or DELETE) ─────────────────────────

router.post("/:id/access", requirePermission("operations", "edit"), validateBody(accessGrantSchema), async (req, res) => {
  const id = Number(req.params.id);
  const article = await prisma.knowledgeArticle.findUnique({ where: { id } });
  if (!article) throw new ApiError(404, "Article not found");
  if (article.createdById !== req.user!.id && !RECORD_ACCESS_BYPASS_ROLE_NAMES.includes(req.user!.roleName)) {
    throw new ApiError(403, "Only the article's creator can grant access");
  }
  const target = req.body.userId != null ? { userId: req.body.userId } : { teamId: req.body.teamId };
  await grantRecordAccess(ENTITY_TYPE, id, target, req.body.level, req.user!.id);
  await logAudit({ userId: req.user!.id, action: "operations.knowledge.access.grant", entityType: "KnowledgeArticle", entityId: id, metadata: req.body });
  res.json(await listRecordAccess(ENTITY_TYPE, id));
});

router.delete("/:id/access/:kind/:targetId/:level", requirePermission("operations", "edit"), async (req, res) => {
  const id = Number(req.params.id);
  const targetId = Number(req.params.targetId);
  const level = req.params.level === "DELETE" ? "DELETE" : req.params.level === "DUPLICATE" ? "DUPLICATE" : "EDIT";
  const target = req.params.kind === "team" ? { teamId: targetId } : { userId: targetId };
  const article = await prisma.knowledgeArticle.findUnique({ where: { id } });
  if (!article) throw new ApiError(404, "Article not found");
  if (article.createdById !== req.user!.id && !RECORD_ACCESS_BYPASS_ROLE_NAMES.includes(req.user!.roleName)) {
    throw new ApiError(403, "Only the article's creator can revoke access");
  }
  await revokeRecordAccess(ENTITY_TYPE, id, target, level);
  await logAudit({ userId: req.user!.id, action: "operations.knowledge.access.revoke", entityType: "KnowledgeArticle", entityId: id, metadata: { ...target, level } });
  res.json(await listRecordAccess(ENTITY_TYPE, id));
});

export default router;
