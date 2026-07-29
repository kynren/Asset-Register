import { Router } from "express";
import { z } from "zod";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { quickActions, runAssistantQuery } from "./patterns";

const router = Router();
router.use(verifyJwt);

router.get("/quick-actions", requirePermission("virtual-assistant", "view"), (_req, res) => {
  res.json({ quickActions });
});

router.post(
  "/query",
  requirePermission("virtual-assistant", "view"),
  validateBody(z.object({ text: z.string().min(1) })),
  async (req, res) => {
    const result = await runAssistantQuery(req, req.body.text);
    res.json(result);
  }
);

export default router;
