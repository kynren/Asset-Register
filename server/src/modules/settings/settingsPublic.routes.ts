import { Router } from "express";
import { prisma } from "../../config/prisma";
import { DEFAULT_LOGIN_PAGE_DESIGN } from "./loginDesign.schema";

const DEFAULT_MOBILE_SPLASH = { enabled: false, mediaType: "PHOTO" as const, mediaUrl: null, backgroundColor: "#0d1117", minDisplayMs: 1500 };

const router = Router();

const PUBLIC_KEYS = ["companyName", "appIconUrl", "faviconUrl", "brandPrimaryColor", "brandSecondaryColor", "docsWatermarkUrl", "docsWatermarkPosition"];

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

// Unauthenticated on purpose — the mobile app needs this before login to render its custom
// loading screen (see mobile/src/components/AppLoadingScreen.tsx), same reasoning as
// login-design above for the web login page.
router.get("/mobile-splash", async (_req, res) => {
  const record = await prisma.mobileSplashSettings.findUnique({ where: { id: 1 } });
  res.json(record ?? DEFAULT_MOBILE_SPLASH);
});

export default router;
