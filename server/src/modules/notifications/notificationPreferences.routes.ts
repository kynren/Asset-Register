import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { NotificationEventKind } from "@prisma/client";

const router = Router();
router.use(verifyJwt);

const EVENT_KINDS = Object.values(NotificationEventKind);

const updateSchema = z.object({
  preferences: z.array(
    z.object({
      kind: z.nativeEnum(NotificationEventKind),
      inAppEnabled: z.boolean(),
      emailEnabled: z.boolean(),
    })
  ),
});

router.get("/", async (req, res) => {
  const rows = await prisma.notificationPreference.findMany({ where: { userId: req.user!.id } });
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  res.json(
    EVENT_KINDS.map((kind) => ({
      kind,
      inAppEnabled: byKind.get(kind)?.inAppEnabled ?? true,
      emailEnabled: byKind.get(kind)?.emailEnabled ?? true,
    }))
  );
});

router.put("/", validateBody(updateSchema), async (req, res) => {
  const userId = req.user!.id;
  await prisma.$transaction(
    req.body.preferences.map((p: { kind: NotificationEventKind; inAppEnabled: boolean; emailEnabled: boolean }) =>
      prisma.notificationPreference.upsert({
        where: { userId_kind: { userId, kind: p.kind } },
        update: { inAppEnabled: p.inAppEnabled, emailEnabled: p.emailEnabled },
        create: { userId, kind: p.kind, inAppEnabled: p.inAppEnabled, emailEnabled: p.emailEnabled },
      })
    )
  );
  res.json({ ok: true });
});

export default router;
