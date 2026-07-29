import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import PDFDocument from "pdfkit";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { getPagination, paginatedResponse } from "../../lib/pagination";
import { parseCsvRaw, toCsv } from "../../lib/csv";
import { notifyUsers } from "../../lib/notify";
import { generateTempPassword } from "../../lib/passwords";
import { pingHost } from "../../lib/ping";

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
  else where.NOT = { category: { name: "Harness" } }; // Harness has its own dedicated view, not part of general browsing
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
  const excludeHarness = { NOT: { category: { name: "Harness" } } };
  const [total, byCategory, categories] = await Promise.all([
    prisma.asset.count({ where: excludeHarness }),
    prisma.asset.groupBy({ by: ["categoryId"], where: excludeHarness, _count: { _all: true } }),
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

// Active heartbeat: looks the asset up on the network by its own asset tag (real IT estates
// commonly name machines after their asset tag) and pings it directly. No DB write here — this
// is polled continuously from the inventory table, so persisting every sample would spam the
// audit trail for no benefit; the frontend keeps its own rolling sample history for the sparkline.
export async function pingAsset(req: Request, res: Response) {
  const id = Number(req.params.id);
  const asset = await prisma.asset.findUnique({ where: { id }, select: { assetTag: true } });
  if (!asset) throw new ApiError(404, "Asset not found");

  const result = await pingHost(asset.assetTag);
  res.json({ ...result, target: asset.assetTag });
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
  await notifyUsers({
    userIds: [checkedOutToId],
    excludeUserId: req.user!.id,
    type: "asset_assigned",
    message: `Asset "${asset.name}" (${asset.assetTag}) was checked out to you`,
    linkUrl: `/assets/${assetId}`,
  });
  res.status(201).json(checkout);
}

export async function checkinAsset(req: Request, res: Response) {
  const assetId = Number(req.params.id);
  const { notes } = req.body;

  const activeCheckout = await prisma.assetCheckout.findFirst({ where: { assetId, checkedInAt: null } });
  if (!activeCheckout) throw new ApiError(400, "This asset is not currently checked out.");

  const [checkout, asset] = await prisma.$transaction([
    prisma.assetCheckout.update({
      where: { id: activeCheckout.id },
      data: { checkedInAt: new Date(), checkedInById: req.user!.id, notes: notes ?? activeCheckout.notes },
      select: checkoutSelect,
    }),
    prisma.asset.update({ where: { id: assetId }, data: { assignedToId: null } }),
  ]);

  await logAudit({ userId: req.user!.id, action: "asset.checkin", entityType: "Asset", entityId: assetId });
  await notifyUsers({
    userIds: [activeCheckout.checkedOutToId],
    excludeUserId: req.user!.id,
    type: "asset_checkin",
    message: `Asset "${asset.name}" (${asset.assetTag}) was checked back in`,
    linkUrl: `/assets/${assetId}`,
  });
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

function statusLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return "No date on record";
  const days = Math.round((new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (Number.isNaN(days)) return "No date on record";
  return days < 0 ? `OVERDUE by ${Math.abs(days)} day(s)` : `${days} day(s) remaining`;
}

// A purpose-built certification report for the Harness category — a clean identity + life span
// + full test-cycle history layout for compliance/audit use, distinct from the generic asset
// report (which flatly dumps every custom field and includes irrelevant sub-resource counts).
export async function harnessReportPdf(req: Request, res: Response) {
  const id = Number(req.params.id);
  const asset = await prisma.asset.findUnique({ where: { id }, include });
  if (!asset) throw new ApiError(404, "Asset not found");

  const f = Object.fromEntries(asset.customFieldValues.map((v) => [v.field.fieldKey, v.value]));

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=harness-${asset.assetTag}-certification.pdf`);
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  doc.fontSize(18).text("Harness Certification Report", { align: "center" });
  doc.fontSize(12).fillColor("gray").text(asset.name, { align: "center" });
  doc.fillColor("black");
  doc.moveDown(1.5);

  doc.fontSize(12).text("Identity", { underline: true });
  doc.fontSize(10);
  doc.text(`Asset Tag: ${asset.assetTag}`);
  doc.text(`Serial Number: ${asset.serialNumber ?? "—"}`);
  doc.text(`ID/Batch Number: ${f.id_batch_number ?? "—"}`);
  doc.text(`Test Cert No.: ${f.test_cert_no ?? "—"}`);
  doc.text(`Tester: ${f.tester ?? "—"}`);
  doc.text(`Purchased From: ${f.purchased_from ?? "—"}`);
  doc.moveDown();

  doc.fontSize(12).text("Life Span", { underline: true });
  doc.fontSize(10);
  doc.text(`Manufacture Date: ${f.manufacture_date ?? "—"}`);
  doc.text(`Life Span Expiry Date: ${f.life_span_expiry_date ?? "—"}    (${statusLabel(f.life_span_expiry_date)})`);
  doc.moveDown();

  doc.fontSize(12).text("Test History", { underline: true });
  doc.fontSize(10);
  const cycles: [string, string | null, string | null][] = [
    ["Test 1", f.test_1_test_date, f.test_1_expiry_date],
    ["Test 2", f.test_2_test_date, f.test_2_expiry_date],
    ["Test 3", f.test_3_test_date, f.test_3_expiry_date],
  ];
  let anyTests = false;
  for (const [label, testDate, expiryDate] of cycles) {
    if (!testDate && !expiryDate) continue;
    anyTests = true;
    doc.text(`${label}:  Tested ${testDate ?? "—"}  →  Expires ${expiryDate ?? "—"}   (${statusLabel(expiryDate)})`);
  }
  if (!anyTests) doc.text("No test cycles on record.");
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
  if (asset.assignedToId) {
    await notifyUsers({
      userIds: [asset.assignedToId],
      excludeUserId: req.user!.id,
      type: "asset_assigned",
      message: `Asset "${asset.name}" (${asset.assetTag}) was assigned to you`,
      linkUrl: `/assets/${asset.id}`,
    });
  }
  res.status(201).json(customFieldValues?.length ? await prisma.asset.findUnique({ where: { id: asset.id }, include }) : asset);
}

export async function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const before = await prisma.asset.findUnique({ where: { id }, select: { assignedToId: true } });
  const { customFieldValues, ...data } = req.body;
  const asset = await prisma.asset.update({ where: { id }, data, include });
  if (customFieldValues?.length) {
    await saveCustomFieldValues(id, customFieldValues);
  }
  await logAudit({ userId: req.user!.id, action: "asset.update", entityType: "Asset", entityId: id, metadata: data });
  if (asset.assignedToId && asset.assignedToId !== before?.assignedToId) {
    await notifyUsers({
      userIds: [asset.assignedToId],
      excludeUserId: req.user!.id,
      type: "asset_assigned",
      message: `Asset "${asset.name}" (${asset.assetTag}) was assigned to you`,
      linkUrl: `/assets/${id}`,
    });
  }
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

// Returns the first few raw rows (no header assumed) so the client can let the user pick
// which row is actually the header before mapping columns.
export async function importPreview(req: Request, res: Response) {
  if (!req.file) throw new ApiError(400, "No file uploaded");
  const rows = parseCsvRaw(req.file.buffer);
  res.json({ rows: rows.slice(0, 15), totalRows: rows.length });
}

// Target fields an import column can be mapped to. Kept in sync with the frontend wizard's
// field list (client/src/pages/assets/AssetImportWizardModal.tsx).
interface ImportMapping {
  assetTag?: string;
  name?: string;
  status?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  category?: string;
  location?: string;
  assignedToName?: string;
  assignedToEmail?: string;
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.length > 1 ? parts.slice(1).join(" ") : parts[0] };
}

function namesFromEmail(email: string): { firstName: string; lastName: string } {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  return { firstName: parts[0] || local, lastName: parts.length > 1 ? parts.slice(1).join(" ") : parts[0] || local };
}

const ASSET_STATUS_VALUES = new Set(["IN_USE", "IN_STORAGE", "IN_REPAIR", "RETIRED", "LOST"]);

// Accepts free-text phrasing from real-world spreadsheets ("In Use", "in-use", "In Storage")
// and maps it onto the AssetStatus enum; unrecognized text falls back to IN_USE rather than
// failing the whole row, matching how an unmatched category/location is left unset instead of erroring.
function normalizeStatus(raw: string): string {
  const normalized = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return ASSET_STATUS_VALUES.has(normalized) ? normalized : "IN_USE";
}

export async function importCsv(req: Request, res: Response) {
  if (!req.file) throw new ApiError(400, "No file uploaded");

  const headerRowIndex = Number(req.body.headerRowIndex ?? 0);
  let mapping: ImportMapping;
  try {
    mapping = req.body.mapping ? JSON.parse(req.body.mapping) : {};
  } catch {
    throw new ApiError(400, "Invalid column mapping payload");
  }
  if (!mapping.assetTag || !mapping.name) {
    throw new ApiError(400, "Asset Tag and Name must both be mapped to a column");
  }

  const rawRows = parseCsvRaw(req.file.buffer);
  const headerRow = rawRows[headerRowIndex];
  if (!headerRow) throw new ApiError(400, "Header row is out of range for this file");
  const dataRows = rawRows.slice(headerRowIndex + 1);

  const colIndex = (header?: string) => (header ? headerRow.indexOf(header) : -1);
  const idx = {
    assetTag: colIndex(mapping.assetTag),
    name: colIndex(mapping.name),
    status: colIndex(mapping.status),
    manufacturer: colIndex(mapping.manufacturer),
    model: colIndex(mapping.model),
    serialNumber: colIndex(mapping.serialNumber),
    category: colIndex(mapping.category),
    location: colIndex(mapping.location),
    assignedToName: colIndex(mapping.assignedToName),
    assignedToEmail: colIndex(mapping.assignedToEmail),
  };
  const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");

  const [categories, locations, existingUsers, viewerRole] = await Promise.all([
    prisma.assetCategory.findMany(),
    prisma.location.findMany(),
    prisma.user.findMany({ select: { id: true, email: true, firstName: true, lastName: true } }),
    prisma.role.findFirst({ where: { name: "Viewer" } }),
  ]);
  const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  const locationMap = new Map(locations.map((l) => [l.name.toLowerCase(), l.id]));
  const emailMap = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u.id]));
  const nameMap = new Map(existingUsers.map((u) => [`${u.firstName} ${u.lastName}`.toLowerCase(), u.id]));

  const usersCreated: { id: number; email: string; firstName: string; lastName: string; tempPassword: string }[] = [];

  async function resolveAssigneeId(email: string, fullName: string): Promise<number | undefined> {
    if (!email && !fullName) return undefined;
    if (email && emailMap.has(email)) return emailMap.get(email);
    if (!email && fullName && nameMap.has(fullName.toLowerCase())) return nameMap.get(fullName.toLowerCase());

    if (!email) {
      throw new Error(`No existing user matches "${fullName}" and no email column was mapped to create one`);
    }
    if (!viewerRole) {
      throw new Error("Cannot auto-create user: no Viewer role found to assign");
    }

    const { firstName, lastName } = fullName ? splitFullName(fullName) : namesFromEmail(email);
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const user = await prisma.user.create({
      data: { email, firstName, lastName, roleId: viewerRole.id, passwordHash, mustChangePassword: true },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    await logAudit({ userId: req.user!.id, action: "user.create", entityType: "User", entityId: user.id, metadata: { source: "asset.import" } });
    emailMap.set(email, user.id);
    nameMap.set(`${user.firstName} ${user.lastName}`.toLowerCase(), user.id);
    usersCreated.push({ ...user, tempPassword });
    return user.id;
  }

  let created = 0;
  const errors: string[] = [];

  for (const [index, row] of dataRows.entries()) {
    const rowNumber = headerRowIndex + index + 2;
    const assetTag = cell(row, idx.assetTag);
    const name = cell(row, idx.name);
    if (!assetTag || !name) {
      errors.push(`Row ${rowNumber}: Asset Tag and Name are required`);
      continue;
    }

    const email = cell(row, idx.assignedToEmail).toLowerCase();
    const fullName = cell(row, idx.assignedToName);
    let assignedToId: number | undefined;
    if (email || fullName) {
      try {
        assignedToId = await resolveAssigneeId(email, fullName);
      } catch (err) {
        errors.push(`Row ${rowNumber}: ${(err as Error).message}`);
      }
    }

    try {
      const asset = await prisma.asset.create({
        data: {
          assetTag,
          name,
          status: normalizeStatus(cell(row, idx.status)) as never,
          manufacturer: cell(row, idx.manufacturer) || undefined,
          model: cell(row, idx.model) || undefined,
          serialNumber: cell(row, idx.serialNumber) || undefined,
          categoryId: idx.category >= 0 ? categoryMap.get(cell(row, idx.category).toLowerCase()) : undefined,
          locationId: idx.location >= 0 ? locationMap.get(cell(row, idx.location).toLowerCase()) : undefined,
          assignedToId,
        },
      });
      created += 1;
      if (assignedToId) {
        await notifyUsers({
          userIds: [assignedToId],
          excludeUserId: req.user!.id,
          type: "asset_assigned",
          message: `Asset "${asset.name}" (${asset.assetTag}) was assigned to you`,
          linkUrl: `/assets/${asset.id}`,
        });
      }
    } catch (err) {
      errors.push(`Row ${rowNumber}: ${(err as Error).message}`);
    }
  }

  await logAudit({ userId: req.user!.id, action: "asset.import", metadata: { created, errorCount: errors.length, usersCreated: usersCreated.length } });
  res.json({ created, errors, usersCreated: usersCreated.map(({ id, email, firstName, lastName, tempPassword }) => ({ id, email, firstName, lastName, tempPassword })) });
}
