import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { logAudit } from "../../lib/auditLogger";
import { createChangelogEntrySchema, updateChangelogEntrySchema } from "./changelog.schema";

const router = Router();
router.use(verifyJwt);

const entrySelect = {
  id: true,
  title: true,
  summary: true,
  items: true,
  publishedAt: true,
  createdById: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  createdAt: true,
} as const;

// Every authenticated user can read — needed both for the admin management list and for the
// "what's new" modal, gated only by whether they've seen a given entry yet (see /unseen below).
router.get("/", async (_req, res) => {
  const entries = await prisma.changelogEntry.findMany({ select: entrySelect, orderBy: { id: "desc" } });
  res.json(entries);
});

// Entries newer than this user's last-seen position — read position is stored via the generic
// UserPreference mechanism (key "changelog.lastSeenId") rather than a dedicated column, same
// convention as every other per-user "have I seen this" flag in the app.
router.get("/unseen", async (req, res) => {
  const pref = await prisma.userPreference.findUnique({
    where: { userId_key: { userId: req.user!.id, key: "changelog.lastSeenId" } },
  });
  const lastSeenId = typeof pref?.value === "number" ? pref.value : 0;
  const entries = await prisma.changelogEntry.findMany({
    where: { id: { gt: lastSeenId } },
    select: entrySelect,
    orderBy: { id: "asc" },
  });
  res.json(entries);
});

router.post(
  "/",
  requirePermission("app-settings", "create"),
  validateBody(createChangelogEntrySchema),
  async (req, res) => {
    const entry = await prisma.changelogEntry.create({
      data: { ...req.body, createdById: req.user!.id },
      select: entrySelect,
    });
    await logAudit({ userId: req.user!.id, action: "changelog.create", entityType: "ChangelogEntry", entityId: entry.id });
    res.status(201).json(entry);
  }
);

router.patch(
  "/:id",
  requirePermission("app-settings", "edit"),
  validateBody(updateChangelogEntrySchema),
  async (req, res) => {
    const entry = await prisma.changelogEntry.update({
      where: { id: Number(req.params.id) },
      data: req.body,
      select: entrySelect,
    });
    await logAudit({ userId: req.user!.id, action: "changelog.update", entityType: "ChangelogEntry", entityId: entry.id });
    res.json(entry);
  }
);

router.delete("/:id", requirePermission("app-settings", "delete"), async (req, res) => {
  await prisma.changelogEntry.delete({ where: { id: Number(req.params.id) } });
  await logAudit({ userId: req.user!.id, action: "changelog.delete", entityType: "ChangelogEntry", entityId: Number(req.params.id) });
  res.json({ ok: true });
});

export default router;
