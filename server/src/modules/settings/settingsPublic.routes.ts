import { Router } from "express";
import { prisma } from "../../config/prisma";
import { DEFAULT_LOGIN_PAGE_DESIGN } from "./loginDesign.schema";

const router = Router();

const PUBLIC_KEYS = ["companyName", "appIconUrl", "faviconUrl", "brandPrimaryColor", "brandSecondaryColor"];

router.get("/", async (_req, res) => {
  const settings = await prisma.systemSetting.findMany({ where: { key: { in: PUBLIC_KEYS } } });
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  res.json(map);
});

router.get("/login-design", async (_req, res) => {
  const record = await prisma.loginPageDesign.findUnique({ where: { id: 1 } });
  res.json(record?.config ?? DEFAULT_LOGIN_PAGE_DESIGN);
});

export default router;
