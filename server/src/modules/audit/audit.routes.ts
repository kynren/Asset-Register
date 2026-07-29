import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { getPagination, paginatedResponse } from "../../lib/pagination";

const router = Router();
router.use(verifyJwt);

router.get("/", requirePermission("admin", "view"), async (req, res) => {
  const { page, pageSize, skip, take } = getPagination(req);
  const userId = req.query.userId ? Number(req.query.userId) : undefined;

  const where = userId ? { userId } : {};
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json(paginatedResponse(items, total, page, pageSize));
});

export default router;
