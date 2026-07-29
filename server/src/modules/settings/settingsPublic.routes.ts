import { Router } from "express";
import { prisma } from "../../config/prisma";

const router = Router();

const PUBLIC_KEYS = ["companyName", "appIconUrl", "faviconUrl"];

router.get("/", async (_req, res) => {
  const settings = await prisma.systemSetting.findMany({ where: { key: { in: PUBLIC_KEYS } } });
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  res.json(map);
});

export default router;
