import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { Request, Response } from "express";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { getPagination, paginatedResponse } from "../../lib/pagination";
import { notifyUsers, getUserIdsWithPermission } from "../../lib/notify";
import { generateSku } from "../../lib/stockSku";
import { drawPdfCopyrightFooter } from "../../lib/docExport";

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
      transactions: {
        include: {
          performedBy: { select: { firstName: true, lastName: true } },
          issuance: { include: { receivedBy: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      stockLevels: { include: { location: { select: { id: true, name: true } } }, orderBy: { locationId: "asc" } },
      stockItemType: true,
      attachments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!item) throw new ApiError(404, "Stock item not found");
  res.json(item);
}

export async function create(req: Request, res: Response) {
  const data = { ...req.body } as typeof req.body;

  let stockItemType = null;
  if (data.stockItemTypeId) {
    stockItemType = await prisma.stockItemType.findUnique({ where: { id: data.stockItemTypeId } });
    if (!stockItemType) throw new ApiError(404, "Stock item type not found");
    // Keep the legacy free-text category in sync so existing reports/dashboards that group by it
    // still see this item, unless the caller explicitly set their own category.
    if (!data.category) data.category = stockItemType.name;
  }

  if (!data.sku) {
    if (!stockItemType) throw new ApiError(400, "sku or stockItemTypeId is required");
    data.sku = await generateSku(stockItemType.code);
  }

  const item = await prisma.stockItem.create({ data });
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

export async function duplicate(req: Request, res: Response) {
  const id = Number(req.params.id);
  const source = await prisma.stockItem.findUnique({ where: { id } });
  if (!source) throw new ApiError(404, "Stock item not found");

  let newSku = `${source.sku}-COPY`;
  let suffix = 1;
  while (await prisma.stockItem.findUnique({ where: { sku: newSku } })) {
    suffix += 1;
    newSku = `${source.sku}-COPY${suffix}`;
  }

  const clone = await prisma.stockItem.create({
    data: {
      sku: newSku,
      name: source.name,
      category: source.category,
      unit: source.unit,
      reorderLevel: source.reorderLevel,
      unitCost: source.unitCost,
      locationId: source.locationId,
      // Quantities and stock levels are physical counts, not part of an item's definition — a
      // duplicate starts at zero on hand, same as any newly-created item.
    },
  });

  await logAudit({ userId: req.user!.id, action: "stockItem.duplicate", entityType: "StockItem", entityId: clone.id, metadata: { sourceId: id } });
  res.status(201).json(clone);
}

export async function uploadAttachment(req: Request, res: Response) {
  if (!req.file) throw new ApiError(400, "No file uploaded");
  const stockItemId = Number(req.params.id);
  const item = await prisma.stockItem.findUnique({ where: { id: stockItemId } });
  if (!item) throw new ApiError(404, "Stock item not found");

  const attachment = await prisma.stockItemAttachment.create({
    data: {
      stockItemId,
      url: `/uploads/stock-attachments/${req.file.filename}`,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      uploadedById: req.user!.id,
    },
  });
  await logAudit({ userId: req.user!.id, action: "stockItemAttachment.create", entityType: "StockItem", entityId: stockItemId });
  res.status(201).json(attachment);
}

export async function removeAttachment(req: Request, res: Response) {
  const attachmentId = Number(req.params.attachmentId);
  const attachment = await prisma.stockItemAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.stockItemId !== Number(req.params.id)) throw new ApiError(404, "Attachment not found");

  await prisma.stockItemAttachment.delete({ where: { id: attachmentId } });
  const diskPath = path.join(__dirname, "..", "..", "..", "uploads", "stock-attachments", path.basename(attachment.url));
  fs.unlink(diskPath, () => {});
  await logAudit({ userId: req.user!.id, action: "stockItemAttachment.delete", entityType: "StockItem", entityId: attachment.stockItemId });
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

  const newQuantityOnHand = item.quantityOnHand + delta;
  if (newQuantityOnHand <= item.reorderLevel && item.quantityOnHand > item.reorderLevel) {
    const recipients = await getUserIdsWithPermission("stock", "canEdit");
    await notifyUsers({
      userIds: recipients,
      excludeUserId: req.user!.id,
      type: "stock_low",
      message: `"${item.name}" has dropped to ${newQuantityOnHand} on hand (reorder level: ${item.reorderLevel})`,
      linkUrl: `/stock`,
      email: {
        eventType: "LOW_STOCK",
        fallbackSubject: `Low stock: "${item.name}"`,
        fallbackText: `"${item.name}" has dropped to ${newQuantityOnHand} on hand (reorder level: ${item.reorderLevel}).\n\nView stock: ${env.CLIENT_ORIGIN}/stock`,
        variables: { itemName: item.name, quantityOnHand: String(newQuantityOnHand), reorderLevel: String(item.reorderLevel), stockUrl: `${env.CLIENT_ORIGIN}/stock` },
      },
    });
  }

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

export async function stats(req: Request, res: Response) {
  const { category } = req.query as Record<string, string | undefined>;
  const items = await prisma.stockItem.findMany({ where: category ? { category } : undefined });
  const totalItems = items.length;
  const totalOnHand = items.reduce((sum, i) => sum + i.quantityOnHand, 0);
  const totalValue = items.reduce((sum, i) => sum + i.quantityOnHand * Number(i.unitCost ?? 0), 0);
  const lowStockCount = items.filter((i) => i.quantityOnHand <= i.reorderLevel).length;

  const byCategory = new Map<string, number>();
  for (const i of items) {
    const key = i.category ?? "Uncategorized";
    byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
  }

  res.json({
    totalItems,
    totalOnHand,
    totalValue,
    lowStockCount,
    byCategory: [...byCategory.entries()].map(([category, count]) => ({ category, count })),
  });
}

export async function getBySku(req: Request, res: Response) {
  const item = await prisma.stockItem.findUnique({
    where: { sku: req.params.sku },
    include: {
      transactions: {
        include: {
          performedBy: { select: { firstName: true, lastName: true } },
          issuance: { include: { receivedBy: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      stockLevels: { include: { location: { select: { id: true, name: true } } }, orderBy: { locationId: "asc" } },
      stockItemType: true,
      attachments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!item) throw new ApiError(404, "No stock item found with that SKU");
  res.json(item);
}

// Scan-to-issue: validates the scanned SKU still matches, checks quantity against on-hand stock at
// the chosen location (returning available/requested so the UI can render its blocking warning
// rather than a generic error toast), then atomically decrements stock and records a signed
// StockIssuance. Notification/email dispatch is wired in a later phase once the STOCK_ISSUED event
// types exist — this only persists the issuance itself.
export async function issueStock(req: Request, res: Response) {
  if (!req.file) throw new ApiError(400, "A recipient signature is required");
  const stockItemId = Number(req.params.id);
  const scannedSku = String(req.body.scannedSku ?? "");
  const quantity = Number(req.body.quantity);
  const receivedById = Number(req.body.receivedById);
  const locationId = Number(req.body.locationId);

  if (!Number.isInteger(quantity) || quantity <= 0) throw new ApiError(400, "Quantity must be a positive whole number");
  if (!Number.isInteger(receivedById)) throw new ApiError(400, "receivedById is required");
  if (!Number.isInteger(locationId)) throw new ApiError(400, "locationId is required");

  const item = await prisma.stockItem.findUnique({ where: { id: stockItemId } });
  if (!item) throw new ApiError(404, "Stock item not found");
  if (item.sku !== scannedSku) throw new ApiError(400, "Scanned QR code does not match this item — please rescan.");

  const [location, receiver] = await Promise.all([
    prisma.location.findUnique({ where: { id: locationId } }),
    prisma.user.findUnique({ where: { id: receivedById } }),
  ]);
  if (!location) throw new ApiError(404, "Location not found");
  if (!receiver) throw new ApiError(404, "Recipient user not found");

  const level = await prisma.stockLevel.findUnique({ where: { stockItemId_locationId: { stockItemId, locationId } } });
  const available = level?.quantityOnHand ?? 0;
  if (quantity > available) {
    return res.status(400).json({ error: `Not enough stock at ${location.name}: ${available} on hand, ${quantity} requested`, available, requested: quantity });
  }

  const signatureUrl = `/uploads/stock-signatures/${req.file.filename}`;

  const [, , transaction] = await prisma.$transaction([
    prisma.stockItem.update({ where: { id: stockItemId }, data: { quantityOnHand: { decrement: quantity } } }),
    prisma.stockLevel.update({ where: { stockItemId_locationId: { stockItemId, locationId } }, data: { quantityOnHand: { decrement: quantity } } }),
    prisma.stockTransaction.create({
      data: {
        stockItemId,
        type: "OUT",
        quantity,
        reason: `Issued to ${receiver.firstName} ${receiver.lastName}`,
        fromLocationId: locationId,
        performedById: req.user!.id,
        issuance: { create: { receivedById, signatureImageUrl: signatureUrl, scannedSku } },
      },
      include: { issuance: true },
    }),
  ]);

  await logAudit({
    userId: req.user!.id,
    action: "stockItem.issue",
    entityType: "StockItem",
    entityId: stockItemId,
    metadata: { quantity, receivedById, locationId, issuanceId: transaction.issuance!.id },
  });

  await notifyUsers({
    userIds: [receivedById],
    excludeUserId: req.user!.id,
    type: "stock_issued",
    kind: "STOCK_ISSUED",
    message: `You were issued ${quantity} × "${item.name}" (${item.sku})`,
    linkUrl: `/stock`,
    email: {
      eventType: "STOCK_ISSUED",
      fallbackSubject: `You were issued "${item.name}"`,
      fallbackText: `Hello ${receiver.firstName},\n\nYou were issued ${quantity} × "${item.name}" (${item.sku}).\n\nView stock: ${env.CLIENT_ORIGIN}/stock`,
      variables: { itemName: item.name, sku: item.sku, quantity: String(quantity), stockUrl: `${env.CLIENT_ORIGIN}/stock` },
    },
  });

  res.status(201).json(transaction);
}

export async function issuanceReceiptPdf(req: Request, res: Response) {
  const id = Number(req.params.id);
  const issuance = await prisma.stockIssuance.findUnique({
    where: { id },
    include: {
      receivedBy: { select: { firstName: true, lastName: true, email: true } },
      transaction: {
        include: {
          stockItem: { select: { name: true, sku: true, unit: true } },
          performedBy: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!issuance) throw new ApiError(404, "Issuance not found");

  const fromLocation = issuance.transaction.fromLocationId
    ? await prisma.location.findUnique({ where: { id: issuance.transaction.fromLocationId }, select: { name: true } })
    : null;
  const companyName = (await prisma.systemSetting.findUnique({ where: { key: "companyName" } }))?.value ?? null;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=stock-issuance-${issuance.id}-receipt.pdf`);
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);
  drawPdfCopyrightFooter(doc, companyName);
  doc.on("pageAdded", () => drawPdfCopyrightFooter(doc, companyName));

  doc.fontSize(20).fillColor("#101828").text("Stock Issuance Receipt");
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor("#667085").text(`Issued ${issuance.createdAt.toLocaleString()}`);
  doc.moveDown(1);

  doc.fontSize(12).fillColor("#101828");
  doc.text(`Item: ${issuance.transaction.stockItem.name}`);
  doc.text(`SKU: ${issuance.transaction.stockItem.sku}`);
  doc.text(`Quantity issued: ${issuance.transaction.quantity} ${issuance.transaction.stockItem.unit}`);
  doc.text(`Location: ${fromLocation?.name ?? "—"}`);
  doc.text(`Issued by: ${issuance.transaction.performedBy.firstName} ${issuance.transaction.performedBy.lastName}`);
  doc.text(`Received by: ${issuance.receivedBy.firstName} ${issuance.receivedBy.lastName} (${issuance.receivedBy.email})`);
  doc.moveDown(1.5);

  doc.fontSize(11).fillColor("#344054").text("Recipient signature:");
  doc.moveDown(0.3);
  try {
    const sigPath = path.join(__dirname, "..", "..", "..", "uploads", "stock-signatures", path.basename(issuance.signatureImageUrl));
    const sigY = doc.y;
    doc.image(sigPath, doc.x, sigY, { fit: [220, 100] });
    doc.rect(doc.x, sigY, 220, 100).stroke("#d0d5dd");
  } catch (err) {
    console.error("Failed to embed stock issuance signature in PDF, continuing without it:", err);
    doc.fillColor("#98a2b3").text("(signature unavailable)");
  }

  doc.end();
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
