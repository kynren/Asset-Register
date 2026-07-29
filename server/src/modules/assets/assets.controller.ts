import { Request, Response } from "express";
import PDFDocument from "pdfkit";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { getPagination, paginatedResponse } from "../../lib/pagination";
import { parseCsvBuffer, toCsv } from "../../lib/csv";

const include = {
  category: true,
  location: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
  device: true,
  customFieldValues: { include: { field: true } },
};

async function saveCustomFieldValues(assetId: number, values: { fieldId: number; value: string | null }[]) {
  await prisma.$transaction(
    values.map((v) =>
      prisma.assetCustomFieldValue.upsert({
        where: { assetId_fieldId: { assetId, fieldId: v.fieldId } },
        create: { assetId, fieldId: v.fieldId, value: v.value },
        update: { value: v.value },
      })
    )
  );
}

export async function list(req: Request, res: Response) {
  const { page, pageSize, skip, take } = getPagination(req);
  const { search, status, categoryId, locationId, assignedToId, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { assetTag: { contains: search, mode: "insensitive" } },
      { serialNumber: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status) where.status = status;
  if (categoryId) where.categoryId = Number(categoryId);
  if (locationId) where.locationId = Number(locationId);
  if (assignedToId) where.assignedToId = Number(assignedToId);
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
  }

  const [items, total] = await Promise.all([
    prisma.asset.findMany({ where, include, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.asset.count({ where }),
  ]);

  res.json(paginatedResponse(items, total, page, pageSize));
}

export async function getByTag(req: Request, res: Response) {
  const asset = await prisma.asset.findUnique({ where: { assetTag: req.params.tag }, include });
  if (!asset) throw new ApiError(404, "No asset found with that tag");
  res.json(asset);
}

export async function stats(_req: Request, res: Response) {
  const [total, byCategory, categories] = await Promise.all([
    prisma.asset.count(),
    prisma.asset.groupBy({ by: ["categoryId"], _count: { _all: true } }),
    prisma.assetCategory.findMany(),
  ]);

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  res.json({
    total,
    byCategory: byCategory.map((g) => ({
      categoryId: g.categoryId,
      name: g.categoryId ? categoryMap.get(g.categoryId) ?? "Unknown" : "Uncategorized",
      count: g._count._all,
    })),
  });
}

export async function getOne(req: Request, res: Response) {
  const asset = await prisma.asset.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      ...include,
      tickets: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!asset) throw new ApiError(404, "Asset not found");
  res.json(asset);
}

const checkoutSelect = {
  id: true,
  checkedOutAt: true,
  dueBackAt: true,
  checkedInAt: true,
  notes: true,
  checkedOutTo: { select: { id: true, firstName: true, lastName: true } },
  checkedOutBy: { select: { id: true, firstName: true, lastName: true } },
  checkedInBy: { select: { id: true, firstName: true, lastName: true } },
};

export async function listCheckouts(req: Request, res: Response) {
  const assetId = Number(req.params.id);
  const checkouts = await prisma.assetCheckout.findMany({
    where: { assetId },
    select: checkoutSelect,
    orderBy: { checkedOutAt: "desc" },
  });
  res.json(checkouts);
}

export async function checkoutAsset(req: Request, res: Response) {
  const assetId = Number(req.params.id);
  const { checkedOutToId, dueBackAt, notes } = req.body;

  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new ApiError(404, "Asset not found");

  const activeCheckout = await prisma.assetCheckout.findFirst({ where: { assetId, checkedInAt: null } });
  if (activeCheckout) throw new ApiError(409, "This asset is already checked out. Check it in first.");

  const [checkout] = await prisma.$transaction([
    prisma.assetCheckout.create({
      data: {
        assetId,
        checkedOutToId,
        checkedOutById: req.user!.id,
        dueBackAt: dueBackAt ? new Date(dueBackAt) : null,
        notes,
      },
      select: checkoutSelect,
    }),
    prisma.asset.update({ where: { id: assetId }, data: { assignedToId: checkedOutToId } }),
  ]);

  await logAudit({ userId: req.user!.id, action: "asset.checkout", entityType: "Asset", entityId: assetId, metadata: { checkedOutToId, dueBackAt } });
  res.status(201).json(checkout);
}

export async function checkinAsset(req: Request, res: Response) {
  const assetId = Number(req.params.id);
  const { notes } = req.body;

  const activeCheckout = await prisma.assetCheckout.findFirst({ where: { assetId, checkedInAt: null } });
  if (!activeCheckout) throw new ApiError(400, "This asset is not currently checked out.");

  const [checkout] = await prisma.$transaction([
    prisma.assetCheckout.update({
      where: { id: activeCheckout.id },
      data: { checkedInAt: new Date(), checkedInById: req.user!.id, notes: notes ?? activeCheckout.notes },
      select: checkoutSelect,
    }),
    prisma.asset.update({ where: { id: assetId }, data: { assignedToId: null } }),
  ]);

  await logAudit({ userId: req.user!.id, action: "asset.checkin", entityType: "Asset", entityId: assetId });
  res.json(checkout);
}

export async function history(req: Request, res: Response) {
  const id = Number(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: { entityType: "Asset", entityId: id },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(logs);
}

const subResourceCounts = {
  _count: {
    select: {
      components: true,
      volumes: true,
      connections: true,
      networkPorts: true,
      sockets: true,
      contracts: true,
      documents: true,
      photos: true,
      bookings: true,
    },
  },
};

export async function report(req: Request, res: Response) {
  const id = Number(req.params.id);
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      ...include,
      ...subResourceCounts,
      tickets: { orderBy: { createdAt: "desc" }, take: 20 },
      checkouts: {
        orderBy: { checkedOutAt: "desc" },
        include: {
          checkedOutTo: { select: { id: true, firstName: true, lastName: true } },
          checkedOutBy: { select: { id: true, firstName: true, lastName: true } },
          checkedInBy: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      licenseAssignments: { include: { license: { select: { id: true, name: true, vendor: true } } } },
    },
  });
  if (!asset) throw new ApiError(404, "Asset not found");

  const recentActivity = await prisma.auditLog.findMany({
    where: { entityType: "Asset", entityId: id },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  res.json({ asset, recentActivity });
}

export async function reportPdf(req: Request, res: Response) {
  const id = Number(req.params.id);
  const asset = await prisma.asset.findUnique({ where: { id }, include: { ...include, ...subResourceCounts } });
  if (!asset) throw new ApiError(404, "Asset not found");

  const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=asset-${asset.assetTag}-report.pdf`);
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  doc.fontSize(18).text(`Asset Report`, { align: "center" });
  doc.fontSize(12).fillColor("gray").text(asset.name, { align: "center" });
  doc.fillColor("black");
  doc.moveDown(1.5);

  doc.fontSize(12).text("Overview", { underline: true });
  doc.fontSize(10);
  doc.text(`Asset Tag: ${asset.assetTag}`);
  doc.text(`Category: ${asset.category?.name ?? "Uncategorized"}`);
  doc.text(`Status: ${asset.status}   Sign-off: ${asset.signOffStatus}`);
  doc.text(`Location: ${asset.location?.name ?? "—"}`);
  doc.text(`Assigned To: ${asset.assignedTo ? `${asset.assignedTo.firstName} ${asset.assignedTo.lastName}` : "Unassigned"}`);
  doc.text(`Manufacturer / Model: ${asset.manufacturer ?? "—"} / ${asset.model ?? "—"}`);
  doc.text(`Serial Number: ${asset.serialNumber ?? "—"}`);
  doc.moveDown();

  doc.fontSize(12).text("Financial & Warranty", { underline: true });
  doc.fontSize(10);
  doc.text(`Purchase Date: ${fmtDate(asset.purchaseDate)}    Purchase Cost: ${asset.purchaseCost ?? "—"}`);
  doc.text(`Warranty Expires: ${fmtDate(asset.warrantyExpiresAt)}    Next Service: ${fmtDate(asset.nextServiceDate)}`);
  doc.moveDown();

  if (asset.customFieldValues.length > 0) {
    doc.fontSize(12).text("Custom Fields", { underline: true });
    doc.fontSize(10);
    for (const v of asset.customFieldValues) {
      doc.text(`${v.field.label}: ${v.value ?? "—"}`);
    }
    doc.moveDown();
  }

  doc.fontSize(12).text("Sub-Resource Summary", { underline: true });
  doc.fontSize(10);
  const c = asset._count;
  doc.text(`Components: ${c.components}   Volumes: ${c.volumes}   Connections: ${c.connections}   Network Ports: ${c.networkPorts}`);
  doc.text(`Sockets: ${c.sockets}   Photos: ${c.photos}   Contracts: ${c.contracts}   Documents: ${c.documents}   Bookings: ${c.bookings}`);
  doc.moveDown();

  if (asset.notes) {
    doc.fontSize(12).text("Notes", { underline: true });
    doc.fontSize(10).text(asset.notes);
    doc.moveDown();
  }

  doc.fontSize(8).fillColor("gray").text(`Generated ${new Date().toLocaleString()}`, { align: "right" });
  doc.end();
}

export async function create(req: Request, res: Response) {
  const { customFieldValues, ...data } = req.body;
  const asset = await prisma.asset.create({ data, include });
  if (customFieldValues?.length) {
    await saveCustomFieldValues(asset.id, customFieldValues);
  }
  await logAudit({ userId: req.user!.id, action: "asset.create", entityType: "Asset", entityId: asset.id });
  res.status(201).json(customFieldValues?.length ? await prisma.asset.findUnique({ where: { id: asset.id }, include }) : asset);
}

export async function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { customFieldValues, ...data } = req.body;
  const asset = await prisma.asset.update({ where: { id }, data, include });
  if (customFieldValues?.length) {
    await saveCustomFieldValues(id, customFieldValues);
  }
  await logAudit({ userId: req.user!.id, action: "asset.update", entityType: "Asset", entityId: id, metadata: data });
  res.json(customFieldValues?.length ? await prisma.asset.findUnique({ where: { id }, include }) : asset);
}

export async function duplicate(req: Request, res: Response) {
  const id = Number(req.params.id);
  const source = await prisma.asset.findUnique({ where: { id } });
  if (!source) throw new ApiError(404, "Asset not found");

  let newTag = `${source.assetTag}-COPY`;
  let suffix = 1;
  while (await prisma.asset.findUnique({ where: { assetTag: newTag } })) {
    suffix += 1;
    newTag = `${source.assetTag}-COPY${suffix}`;
  }

  const clone = await prisma.asset.create({
    data: {
      assetTag: newTag,
      name: source.name,
      categoryId: source.categoryId,
      locationId: source.locationId,
      status: source.status,
      manufacturer: source.manufacturer,
      model: source.model,
      notes: source.notes,
    },
    include,
  });

  await logAudit({ userId: req.user!.id, action: "asset.duplicate", entityType: "Asset", entityId: clone.id, metadata: { sourceId: id } });
  res.status(201).json(clone);
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  await prisma.asset.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "asset.delete", entityType: "Asset", entityId: id });
  res.json({ ok: true });
}

const EXPORT_COLUMNS = [
  "assetTag",
  "name",
  "status",
  "manufacturer",
  "model",
  "serialNumber",
  "category",
  "location",
  "assignedTo",
];

export async function exportCsv(_req: Request, res: Response) {
  const assets = await prisma.asset.findMany({ include, orderBy: { assetTag: "asc" } });
  const rows = assets.map((a) => ({
    assetTag: a.assetTag,
    name: a.name,
    status: a.status,
    manufacturer: a.manufacturer ?? "",
    model: a.model ?? "",
    serialNumber: a.serialNumber ?? "",
    category: a.category?.name ?? "",
    location: a.location?.name ?? "",
    assignedTo: a.assignedTo ? `${a.assignedTo.firstName} ${a.assignedTo.lastName}` : "",
  }));
  const csv = toCsv(rows, EXPORT_COLUMNS);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=assets.csv");
  res.send(csv);
}

export async function exportJson(_req: Request, res: Response) {
  const assets = await prisma.asset.findMany({ include, orderBy: { assetTag: "asc" } });
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", "attachment; filename=assets.json");
  res.send(JSON.stringify(assets, null, 2));
}

export async function importCsv(req: Request, res: Response) {
  if (!req.file) throw new ApiError(400, "No file uploaded");
  const rows = parseCsvBuffer(req.file.buffer);

  const categories = await prisma.assetCategory.findMany();
  const locations = await prisma.location.findMany();
  const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  const locationMap = new Map(locations.map((l) => [l.name.toLowerCase(), l.id]));

  let created = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    if (!row.assetTag || !row.name) {
      errors.push(`Row ${index + 2}: assetTag and name are required`);
      continue;
    }
    try {
      await prisma.asset.create({
        data: {
          assetTag: row.assetTag,
          name: row.name,
          status: (row.status as never) || "IN_USE",
          manufacturer: row.manufacturer || undefined,
          model: row.model || undefined,
          serialNumber: row.serialNumber || undefined,
          categoryId: row.category ? categoryMap.get(row.category.toLowerCase()) : undefined,
          locationId: row.location ? locationMap.get(row.location.toLowerCase()) : undefined,
        },
      });
      created += 1;
    } catch (err) {
      errors.push(`Row ${index + 2}: ${(err as Error).message}`);
    }
  }

  await logAudit({ userId: req.user!.id, action: "asset.import", metadata: { created, errorCount: errors.length } });
  res.json({ created, errors });
}
