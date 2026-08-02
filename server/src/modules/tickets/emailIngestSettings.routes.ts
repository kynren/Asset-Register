import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { encryptSecret } from "../../lib/crypto";
import { logAudit } from "../../lib/auditLogger";

const router = Router();
router.use(verifyJwt);

const schema = z.object({
  isEnabled: z.boolean(),
  imapHost: z.string().nullable().optional(),
  imapPort: z.number().int().nullable().optional(),
  imapUser: z.string().nullable().optional(),
  imapPassword: z.string().optional(), // write-only; omitted/blank means "keep the existing one"
  mailbox: z.string().min(1).default("INBOX"),
  fallbackRequesterId: z.number().int().nullable().optional(),
  defaultCategoryId: z.number().int().nullable().optional(),
});

// imapPasswordEncrypted is deliberately never selected back to the client — same write-only
// convention as BackupDestination.s3SecretAccessKey.
const select = {
  id: true,
  isEnabled: true,
  imapHost: true,
  imapPort: true,
  imapUser: true,
  mailbox: true,
  fallbackRequesterId: true,
  defaultCategoryId: true,
  lastUid: true,
  lastPolledAt: true,
  lastError: true,
  updatedAt: true,
};

router.get("/", requirePermission("admin", "view"), async (_req, res) => {
  const settings = await prisma.emailIngestSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 }, select });
  res.json(settings);
});

router.put("/", requirePermission("admin", "edit"), validateBody(schema), async (req, res) => {
  const { imapPassword, ...rest } = req.body as z.infer<typeof schema>;
  const settings = await prisma.emailIngestSettings.upsert({
    where: { id: 1 },
    update: { ...rest, ...(imapPassword ? { imapPasswordEncrypted: encryptSecret(imapPassword) } : {}), updatedAt: new Date() },
    create: { id: 1, ...rest, ...(imapPassword ? { imapPasswordEncrypted: encryptSecret(imapPassword) } : {}) },
    select,
  });
  await logAudit({ userId: req.user!.id, action: "emailIngestSettings.update", entityType: "EmailIngestSettings", entityId: 1 });
  res.json(settings);
});

export default router;
