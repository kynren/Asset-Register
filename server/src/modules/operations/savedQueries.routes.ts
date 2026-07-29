import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";

const router = Router();
router.use(verifyJwt);

router.get("/", async (req, res) => {
  const queries = await prisma.savedQuery.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
  res.json(queries);
});

const schema = z.object({
  label: z.string().min(1),
  module: z.string().min(1),
  queryString: z.string().min(1),
});

router.post("/", validateBody(schema), async (req, res) => {
  const query = await prisma.savedQuery.create({ data: { ...req.body, userId: req.user!.id } });
  res.status(201).json(query);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const query = await prisma.savedQuery.findUnique({ where: { id } });
  if (!query || query.userId !== req.user!.id) throw new ApiError(404, "Saved query not found");
  await prisma.savedQuery.delete({ where: { id } });
  res.json({ ok: true });
});

export default router;
