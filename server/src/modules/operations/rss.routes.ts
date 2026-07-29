import { Router } from "express";
import Parser from "rss-parser";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";

const router = Router();
router.use(verifyJwt);

const parser = new Parser({ timeout: 8000 });

router.get("/sources", requirePermission("operations", "view"), async (_req, res) => {
  const sources = await prisma.rssFeedSource.findMany({ orderBy: { createdAt: "desc" } });
  res.json(sources);
});

const sourceSchema = z.object({ name: z.string().min(1), url: z.string().url() });

router.post("/sources", requirePermission("operations", "edit"), validateBody(sourceSchema), async (req, res) => {
  const source = await prisma.rssFeedSource.create({ data: req.body });
  await logAudit({ userId: req.user!.id, action: "operations.rss_source.create", entityType: "RssFeedSource", entityId: source.id, metadata: { url: source.url } });
  res.status(201).json(source);
});

router.delete("/sources/:id", requirePermission("operations", "edit"), async (req, res) => {
  const id = Number(req.params.id);
  const source = await prisma.rssFeedSource.findUnique({ where: { id } });
  if (!source) throw new ApiError(404, "Feed source not found");
  await prisma.rssFeedSource.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "operations.rss_source.delete", entityType: "RssFeedSource", entityId: id });
  res.json({ ok: true });
});

interface FeedItem {
  title: string;
  link: string | null;
  pubDate: string | null;
  sourceName: string;
}

router.get("/items", requirePermission("operations", "view"), async (_req, res) => {
  const sources = await prisma.rssFeedSource.findMany();
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const feed = await parser.parseURL(source.url);
      return (feed.items ?? []).slice(0, 15).map<FeedItem>((item) => ({
        title: item.title ?? "(untitled)",
        link: item.link ?? null,
        pubDate: item.pubDate ?? item.isoDate ?? null,
        sourceName: source.name,
      }));
    })
  );

  const items: FeedItem[] = [];
  const failedSources: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") items.push(...result.value);
    else failedSources.push(sources[i].name);
  });

  items.sort((a, b) => {
    const aTime = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const bTime = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return bTime - aTime;
  });

  res.json({ items: items.slice(0, 60), failedSources });
});

export default router;
