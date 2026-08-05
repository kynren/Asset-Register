import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { logAudit } from "../../lib/auditLogger";
import { slugifyStockTypeCode } from "../../lib/stockSku";

export async function list(_req: Request, res: Response) {
  const types = await prisma.stockItemType.findMany({ orderBy: { name: "asc" } });
  res.json(types);
}

export async function create(req: Request, res: Response) {
  const { name } = req.body as { name: string };

  const base = slugifyStockTypeCode(name);
  let code = base;
  let suffix = 1;
  while (await prisma.stockItemType.findUnique({ where: { code } })) {
    suffix += 1;
    code = `${base.slice(0, 18)}${suffix}`;
  }

  const type = await prisma.stockItemType.create({ data: { name, code } });
  await logAudit({ userId: req.user!.id, action: "stockItemType.create", entityType: "StockItemType", entityId: type.id });
  res.status(201).json({ id: type.id, name: type.name });
}
