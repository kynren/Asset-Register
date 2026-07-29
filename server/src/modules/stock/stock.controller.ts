import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { getPagination, paginatedResponse } from "../../lib/pagination";

export async function list(req: Request, res: Response) {
  const { page, pageSize, skip, take } = getPagination(req);
  const search = req.query.search as string | undefined;
  const lowStockOnly = req.query.lowStock === "true";

  const where: Record<string, unknown> = search
    ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { sku: { contains: search, mode: "insensitive" as const } }] }
    : {};

  let items = await prisma.stockItem.findMany({ where, skip, take, orderBy: { name: "asc" } });
  const total = await prisma.stockItem.count({ where });

  if (lowStockOnly) {
    items = items.filter((i) => i.quantityOnHand <= i.reorderLevel);
  }

  res.json(paginatedResponse(items, total, page, pageSize));
}

export async function getOne(req: Request, res: Response) {
  const item = await prisma.stockItem.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      transactions: { include: { performedBy: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
      stockLevels: { include: { location: { select: { id: true, name: true } } }, orderBy: { locationId: "asc" } },
    },
  });
  if (!item) throw new ApiError(404, "Stock item not found");
  res.json(item);
}

export async function create(req: Request, res: Response) {
  const item = await prisma.stockItem.create({ data: req.body });
  await logAudit({ userId: req.user!.id, action: "stockItem.create", entityType: "StockItem", entityId: item.id });
  res.status(201).json(item);
}

export async function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const item = await prisma.stockItem.update({ where: { id }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "stockItem.update", entityType: "StockItem", entityId: id, metadata: req.body });
  res.json(item);
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  await prisma.stockItem.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "stockItem.delete", entityType: "StockItem", entityId: id });
  res.json({ ok: true });
}

export async function addTransaction(req: Request, res: Response) {
  const stockItemId = Number(req.params.id);
  const { type, quantity, locationId, reason } = req.body;

  const item = await prisma.stockItem.findUnique({ where: { id: stockItemId } });
  if (!item) throw new ApiError(404, "Stock item not found");

  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) throw new ApiError(404, "Location not found");

  const level = await prisma.stockLevel.findUnique({ where: { stockItemId_locationId: { stockItemId, locationId } } });
  const currentAtLocation = level?.quantityOnHand ?? 0;

  if (type === "OUT" && currentAtLocation < quantity) {
    throw new ApiError(400, `Not enough stock at ${location.name} (${currentAtLocation} on hand)`);
  }

  const delta = type === "IN" ? quantity : -quantity;

  const [, , transaction] = await prisma.$transaction([
    prisma.stockItem.update({ where: { id: stockItemId }, data: { quantityOnHand: { increment: delta } } }),
    prisma.stockLevel.upsert({
      where: { stockItemId_locationId: { stockItemId, locationId } },
      create: { stockItemId, locationId, quantityOnHand: Math.max(delta, 0) },
      update: { quantityOnHand: { increment: delta } },
    }),
    prisma.stockTransaction.create({
      data: {
        stockItemId,
        type,
        quantity,
        reason,
        fromLocationId: type === "OUT" ? locationId : undefined,
        toLocationId: type === "IN" ? locationId : undefined,
        performedById: req.user!.id,
      },
    }),
  ]);

  await logAudit({ userId: req.user!.id, action: "stockTransaction.create", entityType: "StockItem", entityId: stockItemId, metadata: { type, quantity, locationId } });
  res.status(201).json(transaction);
}

export async function transferStock(req: Request, res: Response) {
  const stockItemId = Number(req.params.id);
  const { fromLocationId, toLocationId, quantity, reason } = req.body;

  if (fromLocationId === toLocationId) throw new ApiError(400, "Source and destination locations must differ");

  const item = await prisma.stockItem.findUnique({ where: { id: stockItemId } });
  if (!item) throw new ApiError(404, "Stock item not found");

  const [fromLocation, toLocation] = await Promise.all([
    prisma.location.findUnique({ where: { id: fromLocationId } }),
    prisma.location.findUnique({ where: { id: toLocationId } }),
  ]);
  if (!fromLocation || !toLocation) throw new ApiError(404, "Location not found");

  const fromLevel = await prisma.stockLevel.findUnique({ where: { stockItemId_locationId: { stockItemId, locationId: fromLocationId } } });
  if (!fromLevel || fromLevel.quantityOnHand < quantity) {
    throw new ApiError(400, `Not enough stock at ${fromLocation.name} (${fromLevel?.quantityOnHand ?? 0} on hand)`);
  }

  const [, , transaction] = await prisma.$transaction([
    prisma.stockLevel.update({ where: { stockItemId_locationId: { stockItemId, locationId: fromLocationId } }, data: { quantityOnHand: { decrement: quantity } } }),
    prisma.stockLevel.upsert({
      where: { stockItemId_locationId: { stockItemId, locationId: toLocationId } },
      create: { stockItemId, locationId: toLocationId, quantityOnHand: quantity },
      update: { quantityOnHand: { increment: quantity } },
    }),
    prisma.stockTransaction.create({
      data: { stockItemId, type: "TRANSFER", quantity, reason, fromLocationId, toLocationId, performedById: req.user!.id },
    }),
  ]);

  await logAudit({ userId: req.user!.id, action: "stockTransaction.transfer", entityType: "StockItem", entityId: stockItemId, metadata: { fromLocationId, toLocationId, quantity } });
  res.status(201).json(transaction);
}

export async function lowStock(_req: Request, res: Response) {
  const items = await prisma.stockItem.findMany({ orderBy: { name: "asc" } });
  res.json(items.filter((i) => i.quantityOnHand <= i.reorderLevel));
}

export async function analytics(_req: Request, res: Response) {
  const transactions = await prisma.stockTransaction.findMany({
    include: { stockItem: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const usageByItem = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "OUT") continue;
    usageByItem.set(t.stockItem.name, (usageByItem.get(t.stockItem.name) ?? 0) + t.quantity);
  }
  const topConsumed = [...usageByItem.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  const byDay = new Map<string, { in: number; out: number }>();
  for (const t of transactions) {
    const day = t.createdAt.toISOString().slice(0, 10);
    const entry = byDay.get(day) ?? { in: 0, out: 0 };
    if (t.type === "IN") entry.in += t.quantity;
    else entry.out += t.quantity;
    byDay.set(day, entry);
  }
  const trend = [...byDay.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json({ topConsumed, trend });
}
