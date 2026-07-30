import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";

const router = Router();
router.use(verifyJwt);

// A short allowlist of recognized preference keys — not for security (these are always scoped to
// req.user!.id, never another account), just to stop an arbitrary/unbounded set of rows from
// accumulating under a typo'd key.
const KNOWN_KEYS = new Set(["nvr.matrixLayout", "sidebar.collapsed", "theme"]);

function assertKnownKey(key: string) {
  if (!KNOWN_KEYS.has(key)) throw new ApiError(400, `Unknown preference key: ${key}`);
}

router.get("/:key", async (req, res) => {
  assertKnownKey(req.params.key);
  const pref = await prisma.userPreference.findUnique({
    where: { userId_key: { userId: req.user!.id, key: req.params.key } },
  });
  res.json({ value: pref?.value ?? null });
});

router.put("/:key", validateBody(z.object({ value: z.any() })), async (req, res) => {
  assertKnownKey(req.params.key);
  await prisma.userPreference.upsert({
    where: { userId_key: { userId: req.user!.id, key: req.params.key } },
    update: { value: req.body.value },
    create: { userId: req.user!.id, key: req.params.key, value: req.body.value },
  });
  res.json({ ok: true });
});

export default router;
