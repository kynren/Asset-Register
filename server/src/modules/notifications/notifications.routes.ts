import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";

const router = Router();
router.use(verifyJwt);

router.get("/", async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const unreadCount = await prisma.notification.count({ where: { userId: req.user!.id, isRead: false } });
  res.json({ notifications, unreadCount });
});

// Full history for the dedicated Notifications page (the dropdown above only ever shows the
// last 30) — still capped, just much higher, since this is one user's personal inbox, not an
// admin audit log that needs true server-side pagination.
router.get("/all", async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  res.json({ notifications });
});

router.get("/emails", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { email: true } });
  const emails = user
    ? await prisma.emailLog.findMany({
        where: { to: { equals: user.email, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
        take: 500,
      })
    : [];
  res.json({ emails });
});

router.post("/:id/read", async (req, res) => {
  await prisma.notification.updateMany({
    where: { id: Number(req.params.id), userId: req.user!.id },
    data: { isRead: true },
  });
  res.json({ ok: true });
});

router.post("/read-all", async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, isRead: false }, data: { isRead: true } });
  res.json({ ok: true });
});

// Registered by the mobile app on login/app-start (see mobile/src/lib/pushNotifications.ts) —
// upserts by the token itself (not by userId) since the same physical device's token must move
// with it if a different user later signs in on that device, rather than accumulating stale rows
// under the previous account.
router.post("/push-tokens", validateBody(z.object({ token: z.string().min(1), platform: z.enum(["ios", "android"]) })), async (req, res) => {
  await prisma.pushToken.upsert({
    where: { token: req.body.token },
    update: { userId: req.user!.id, platform: req.body.platform, lastSeenAt: new Date() },
    create: { userId: req.user!.id, token: req.body.token, platform: req.body.platform },
  });
  res.json({ ok: true });
});

// Called on logout so a shared/reset device stops receiving push for the account that just
// signed out — matches the token, not just the current user, so it only removes the row for the
// device that's actually logging out.
router.delete("/push-tokens/:token", async (req, res) => {
  await prisma.pushToken.deleteMany({ where: { token: req.params.token, userId: req.user!.id } });
  res.json({ ok: true });
});

export default router;
