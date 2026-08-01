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

const articleSelect = {
  id: true,
  title: true,
  content: true,
  category: true,
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
  res.json(articles);
});

const articleSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  category: z.string().optional(),
});

router.post("/", requirePermission("operations", "create"), validateBody(articleSchema), async (req, res) => {
  const article = await prisma.knowledgeArticle.create({ data: { ...req.body, createdById: req.user!.id }, select: articleSelect });
  await logAudit({ userId: req.user!.id, action: "operations.knowledge.create", entityType: "KnowledgeArticle", entityId: article.id });
  res.status(201).json(article);
});

router.patch("/:id", requirePermission("operations", "edit"), validateBody(articleSchema.partial()), async (req, res) => {
  const id = Number(req.params.id);
  const article = await prisma.knowledgeArticle.update({ where: { id }, data: req.body, select: articleSelect });
  await logAudit({ userId: req.user!.id, action: "operations.knowledge.update", entityType: "KnowledgeArticle", entityId: id });
  res.json(article);
});

router.delete("/:id", requirePermission("operations", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  const article = await prisma.knowledgeArticle.findUnique({ where: { id } });
  if (!article) throw new ApiError(404, "Article not found");
  await prisma.knowledgeArticle.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "operations.knowledge.delete", entityType: "KnowledgeArticle", entityId: id });
  res.json({ ok: true });
});

router.post("/:id/duplicate", requirePermission("operations", "create"), async (req, res) => {
  const id = Number(req.params.id);
  const source = await prisma.knowledgeArticle.findUnique({ where: { id } });
  if (!source) throw new ApiError(404, "Article not found");

  const clone = await prisma.knowledgeArticle.create({
    data: { title: `${source.title} (Copy)`, content: source.content, category: source.category, createdById: req.user!.id },
    select: articleSelect,
  });
  await logAudit({ userId: req.user!.id, action: "operations.knowledge.duplicate", entityType: "KnowledgeArticle", entityId: clone.id, metadata: { sourceId: id } });
  res.status(201).json(clone);
});

export default router;
