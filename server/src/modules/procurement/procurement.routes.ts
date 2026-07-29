import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyJwt } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbac";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import {
  createPurchaseOrderSchema,
  receivePurchaseOrderSchema,
  supplierSchema,
  updatePurchaseOrderSchema,
} from "./procurement.schema";

const router = Router();
router.use(verifyJwt);

// ───────────────────────── Suppliers ─────────────────────────

router.get("/suppliers", requirePermission("stock", "view"), async (_req, res) => {
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { purchaseOrders: true } } } });
  res.json(suppliers);
});

router.post("/suppliers", requirePermission("stock", "create"), validateBody(supplierSchema), async (req, res) => {
  const supplier = await prisma.supplier.create({ data: req.body });
  await logAudit({ userId: req.user!.id, action: "supplier.create", entityType: "Supplier", entityId: supplier.id });
  res.status(201).json(supplier);
});

router.patch("/suppliers/:id", requirePermission("stock", "edit"), validateBody(supplierSchema.partial()), async (req, res) => {
  const id = Number(req.params.id);
  const supplier = await prisma.supplier.update({ where: { id }, data: req.body });
  await logAudit({ userId: req.user!.id, action: "supplier.update", entityType: "Supplier", entityId: id });
  res.json(supplier);
});

router.delete("/suppliers/:id", requirePermission("stock", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  await prisma.supplier.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "supplier.delete", entityType: "Supplier", entityId: id });
  res.json({ ok: true });
});

// ───────────────────────── Purchase Orders ─────────────────────────

const poSelect = {
  id: true,
  poNumber: true,
  status: true,
  orderedAt: true,
  expectedAt: true,
  notes: true,
  createdAt: true,
  supplier: { select: { id: true, name: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  items: {
    select: {
      id: true,
      quantityOrdered: true,
      quantityReceived: true,
      unitCost: true,
      stockItem: { select: { id: true, sku: true, name: true, unit: true } },
    },
  },
};

router.get("/purchase-orders", requirePermission("stock", "view"), async (_req, res) => {
  const orders = await prisma.purchaseOrder.findMany({ select: poSelect, orderBy: { createdAt: "desc" } });
  res.json(orders);
});

router.get("/purchase-orders/:id", requirePermission("stock", "view"), async (req, res) => {
  const order = await prisma.purchaseOrder.findUnique({ where: { id: Number(req.params.id) }, select: poSelect });
  if (!order) throw new ApiError(404, "Purchase order not found");
  res.json(order);
});

router.post("/purchase-orders", requirePermission("stock", "create"), validateBody(createPurchaseOrderSchema), async (req, res) => {
  const { supplierId, expectedAt, notes, items } = req.body;

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw new ApiError(404, "Supplier not found");

  const count = await prisma.purchaseOrder.count();
  const poNumber = `PO-${String(count + 1).padStart(5, "0")}`;

  const order = await prisma.purchaseOrder.create({
    data: {
      poNumber,
      supplierId,
      expectedAt: expectedAt ?? null,
      notes,
      createdById: req.user!.id,
      status: "DRAFT",
      items: { create: items.map((i: any) => ({ stockItemId: i.stockItemId, quantityOrdered: i.quantityOrdered, unitCost: i.unitCost ?? null })) },
    },
    select: poSelect,
  });

  await logAudit({ userId: req.user!.id, action: "purchaseOrder.create", entityType: "PurchaseOrder", entityId: order.id });
  res.status(201).json(order);
});

router.patch("/purchase-orders/:id", requirePermission("stock", "edit"), validateBody(updatePurchaseOrderSchema), async (req, res) => {
  const id = Number(req.params.id);
  const data: Record<string, unknown> = { ...req.body };
  if (req.body.status === "ORDERED") data.orderedAt = new Date();

  const order = await prisma.purchaseOrder.update({ where: { id }, data, select: poSelect });
  await logAudit({ userId: req.user!.id, action: "purchaseOrder.update", entityType: "PurchaseOrder", entityId: id, metadata: req.body });
  res.json(order);
});

router.post("/purchase-orders/:id/receive", requirePermission("stock", "edit"), validateBody(receivePurchaseOrderSchema), async (req, res) => {
  const id = Number(req.params.id);
  const { locationId, lines } = req.body;

  const order = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
  if (!order) throw new ApiError(404, "Purchase order not found");
  if (order.status === "CANCELLED") throw new ApiError(400, "This purchase order has been cancelled.");
  if (order.status === "DRAFT") throw new ApiError(400, "Mark the purchase order as Ordered before receiving stock.");

  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) throw new ApiError(404, "Location not found");

  const itemsById = new Map(order.items.map((i) => [i.id, i]));
  for (const line of lines) {
    const poItem = itemsById.get(line.purchaseOrderItemId);
    if (!poItem) throw new ApiError(400, `Purchase order line ${line.purchaseOrderItemId} not found on this order.`);
    if (poItem.quantityReceived + line.quantityReceived > poItem.quantityOrdered) {
      throw new ApiError(400, `Cannot receive more than ordered for stock item ${poItem.stockItemId} (${poItem.quantityOrdered} ordered, ${poItem.quantityReceived} already received).`);
    }
  }

  const ops = lines.flatMap((line: { purchaseOrderItemId: number; quantityReceived: number }) => {
    const poItem = itemsById.get(line.purchaseOrderItemId)!;
    return [
      prisma.purchaseOrderItem.update({ where: { id: line.purchaseOrderItemId }, data: { quantityReceived: { increment: line.quantityReceived } } }),
      prisma.stockItem.update({ where: { id: poItem.stockItemId }, data: { quantityOnHand: { increment: line.quantityReceived } } }),
      prisma.stockLevel.upsert({
        where: { stockItemId_locationId: { stockItemId: poItem.stockItemId, locationId } },
        create: { stockItemId: poItem.stockItemId, locationId, quantityOnHand: line.quantityReceived },
        update: { quantityOnHand: { increment: line.quantityReceived } },
      }),
      prisma.stockTransaction.create({
        data: {
          stockItemId: poItem.stockItemId,
          type: "IN",
          quantity: line.quantityReceived,
          reason: `Received against ${order.poNumber}`,
          toLocationId: locationId,
          performedById: req.user!.id,
        },
      }),
    ];
  });

  await prisma.$transaction(ops);

  const refreshedItems = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
  const fullyReceived = refreshedItems.every((i) => i.quantityReceived >= i.quantityOrdered);
  if (fullyReceived) {
    await prisma.purchaseOrder.update({ where: { id }, data: { status: "RECEIVED" } });
  }

  await logAudit({ userId: req.user!.id, action: "purchaseOrder.receive", entityType: "PurchaseOrder", entityId: id, metadata: { locationId, lines } });

  const updated = await prisma.purchaseOrder.findUnique({ where: { id }, select: poSelect });
  res.json(updated);
});

export default router;
