import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";

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

export default router;
