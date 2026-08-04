import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { createThemeSchema, shareThemeSchema, updateThemeSchema } from "./appearance.schema";

const router = Router();
router.use(verifyJwt);

const themeSelect = {
  id: true,
  name: true,
  navPosition: true,
  primaryColor: true,
  sidebarBgColor: true,
  sidebarTextColor: true,
  pageBgColor: true,
  isDark: true,
  createdById: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  createdAt: true,
  updatedAt: true,
} as const;

// My own saved themes.
router.get("/", async (req, res) => {
  const themes = await prisma.appearanceTheme.findMany({ where: { createdById: req.user!.id }, select: themeSelect, orderBy: { name: "asc" } });
  res.json(themes);
});

// Themes other people have shared with me.
router.get("/shared-with-me", async (req, res) => {
  const shares = await prisma.appearanceThemeShare.findMany({
    where: { sharedWithUserId: req.user!.id },
    select: { theme: { select: themeSelect } },
    orderBy: { createdAt: "desc" },
  });
  res.json(shares.map((s) => s.theme));
});

router.post("/", validateBody(createThemeSchema), async (req, res) => {
  const theme = await prisma.appearanceTheme.create({
    data: { ...req.body, createdById: req.user!.id },
    select: themeSelect,
  });
  await logAudit({ userId: req.user!.id, action: "appearance.theme.create", entityType: "AppearanceTheme", entityId: theme.id, metadata: { name: theme.name } });
  res.status(201).json(theme);
});

router.patch("/:id", validateBody(updateThemeSchema), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.appearanceTheme.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Theme not found");
  if (existing.createdById !== req.user!.id) throw new ApiError(403, "Only the theme's creator can edit it");

  const theme = await prisma.appearanceTheme.update({ where: { id }, data: req.body, select: themeSelect });
  await logAudit({ userId: req.user!.id, action: "appearance.theme.update", entityType: "AppearanceTheme", entityId: id });
  res.json(theme);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.appearanceTheme.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Theme not found");
  if (existing.createdById !== req.user!.id) throw new ApiError(403, "Only the theme's creator can delete it");

  // Everyone currently using this theme (creator or anyone it was shared with, via
  // User.activeThemeId) reverts to the default look automatically — that FK is onDelete: SetNull.
  await prisma.appearanceTheme.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "appearance.theme.delete", entityType: "AppearanceTheme", entityId: id, metadata: { name: existing.name } });
  res.json({ ok: true });
});

router.post("/:id/share", validateBody(shareThemeSchema), async (req, res) => {
  const id = Number(req.params.id);
  const theme = await prisma.appearanceTheme.findUnique({ where: { id } });
  if (!theme) throw new ApiError(404, "Theme not found");
  if (theme.createdById !== req.user!.id) throw new ApiError(403, "Only the theme's creator can share it");

  const { userId } = req.body as { userId: number };
  await prisma.appearanceThemeShare.upsert({
    where: { themeId_sharedWithUserId: { themeId: id, sharedWithUserId: userId } },
    update: {},
    create: { themeId: id, sharedWithUserId: userId },
  });
  await logAudit({ userId: req.user!.id, action: "appearance.theme.share", entityType: "AppearanceTheme", entityId: id, metadata: { sharedWithUserId: userId } });
  const shares = await prisma.appearanceThemeShare.findMany({
    where: { themeId: id },
    select: { sharedWithUserId: true, sharedWithUser: { select: { id: true, firstName: true, lastName: true } } },
  });
  res.json(shares);
});

router.delete("/:id/share/:userId", async (req, res) => {
  const id = Number(req.params.id);
  const targetUserId = Number(req.params.userId);
  const theme = await prisma.appearanceTheme.findUnique({ where: { id } });
  if (!theme) throw new ApiError(404, "Theme not found");
  if (theme.createdById !== req.user!.id) throw new ApiError(403, "Only the theme's creator can revoke sharing");

  await prisma.appearanceThemeShare.deleteMany({ where: { themeId: id, sharedWithUserId: targetUserId } });
  // Anyone whose share was just revoked and who had this theme active falls back to default.
  await prisma.user.updateMany({ where: { id: targetUserId, activeThemeId: id }, data: { activeThemeId: null } });
  await logAudit({ userId: req.user!.id, action: "appearance.theme.unshare", entityType: "AppearanceTheme", entityId: id, metadata: { sharedWithUserId: targetUserId } });
  res.json({ ok: true });
});

router.get("/:id/shares", async (req, res) => {
  const id = Number(req.params.id);
  const theme = await prisma.appearanceTheme.findUnique({ where: { id } });
  if (!theme) throw new ApiError(404, "Theme not found");
  if (theme.createdById !== req.user!.id) throw new ApiError(403, "Only the theme's creator can view its shares");

  const shares = await prisma.appearanceThemeShare.findMany({
    where: { themeId: id },
    select: { sharedWithUserId: true, sharedWithUser: { select: { id: true, firstName: true, lastName: true } } },
  });
  res.json(shares);
});

// Applies a theme (mine, or one shared with me) as my active look.
router.post("/:id/activate", async (req, res) => {
  const id = Number(req.params.id);
  const theme = await prisma.appearanceTheme.findUnique({ where: { id } });
  if (!theme) throw new ApiError(404, "Theme not found");

  if (theme.createdById !== req.user!.id) {
    const share = await prisma.appearanceThemeShare.findUnique({ where: { themeId_sharedWithUserId: { themeId: id, sharedWithUserId: req.user!.id } } });
    if (!share) throw new ApiError(403, "This theme hasn't been shared with you");
  }

  await prisma.user.update({ where: { id: req.user!.id }, data: { activeThemeId: id } });
  await logAudit({ userId: req.user!.id, action: "appearance.theme.activate", entityType: "AppearanceTheme", entityId: id });
  res.json({ ok: true });
});

router.post("/deactivate", async (req, res) => {
  await prisma.user.update({ where: { id: req.user!.id }, data: { activeThemeId: null } });
  await logAudit({ userId: req.user!.id, action: "appearance.theme.deactivate" });
  res.json({ ok: true });
});

export default router;
