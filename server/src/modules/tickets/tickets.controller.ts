import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { hasPermission } from "../../middleware/rbac";
import { logAudit } from "../../lib/auditLogger";
import { notifyUsers } from "../../lib/notify";
import { getPagination, paginatedResponse } from "../../lib/pagination";
import { computeDueAt } from "./sla";

const include = {
  requester: { select: { id: true, firstName: true, lastName: true } },
  assignee: { select: { id: true, firstName: true, lastName: true } },
  asset: { select: { id: true, assetTag: true, name: true } },
  category: true,
};

async function isStaff(roleId: number) {
  return hasPermission(roleId, "helpdesk", "edit");
}

async function watcherIds(ticketId: number): Promise<number[]> {
  const watchers = await prisma.ticketWatcher.findMany({ where: { ticketId }, select: { userId: true } });
  return watchers.map((w) => w.userId);
}

export async function list(req: Request, res: Response) {
  const { page, pageSize, skip, take } = getPagination(req);
  const { status, priority, categoryId, assignedToMe, mine, overdue, search } = req.query as Record<string, string | undefined>;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (categoryId) where.categoryId = Number(categoryId);
  if (assignedToMe === "true") where.assigneeId = req.user!.id;
  if (mine === "true") where.requesterId = req.user!.id;
  if (overdue === "true") {
    where.dueAt = { lt: new Date() };
    where.status = { in: ["OPEN", "IN_PROGRESS"] };
  }
  if (search) {
    where.OR = [
      { ticketNumber: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
      { requester: { OR: [{ firstName: { contains: search, mode: "insensitive" } }, { lastName: { contains: search, mode: "insensitive" } }] } },
      { assignee: { OR: [{ firstName: { contains: search, mode: "insensitive" } }, { lastName: { contains: search, mode: "insensitive" } }] } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.ticket.findMany({ where, include, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.ticket.count({ where }),
  ]);

  res.json(paginatedResponse(items, total, page, pageSize));
}

export async function getOne(req: Request, res: Response) {
  const staff = await isStaff(req.user!.roleId);
  const ticket = await prisma.ticket.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      ...include,
      comments: {
        where: staff ? {} : { isInternal: false },
        include: { author: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "asc" },
      },
      attachments: { include: { uploadedBy: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" } },
      watchers: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
    },
  });
  if (!ticket) throw new ApiError(404, "Ticket not found");

  const isWatching = ticket.watchers.some((w) => w.userId === req.user!.id);
  res.json({ ...ticket, isWatching });
}

async function nextTicketNumber(): Promise<string> {
  const count = await prisma.ticket.count();
  return `TCK-${String(count + 1).padStart(5, "0")}`;
}

export async function create(req: Request, res: Response) {
  const ticketNumber = await nextTicketNumber();
  const priority = req.body.priority || "MEDIUM";
  const ticket = await prisma.ticket.create({
    data: { ...req.body, ticketNumber, requesterId: req.user!.id, dueAt: computeDueAt(priority) },
    include,
  });
  await logAudit({ userId: req.user!.id, action: "ticket.create", entityType: "Ticket", entityId: ticket.id });

  if (ticket.assigneeId) {
    await notifyUsers({
      userIds: [ticket.assigneeId],
      excludeUserId: req.user!.id,
      type: "ticket_assigned",
      message: `You were assigned ticket ${ticket.ticketNumber}: ${ticket.title}`,
      linkUrl: `/helpdesk/${ticket.id}`,
    });
  }

  res.status(201).json(ticket);
}

export async function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const before = await prisma.ticket.findUnique({ where: { id } });
  const ticket = await prisma.ticket.update({ where: { id }, data: req.body, include });
  await logAudit({ userId: req.user!.id, action: "ticket.update", entityType: "Ticket", entityId: id, metadata: req.body });

  if (req.body.assigneeId && req.body.assigneeId !== before?.assigneeId) {
    await notifyUsers({
      userIds: [req.body.assigneeId],
      excludeUserId: req.user!.id,
      type: "ticket_assigned",
      message: `You were assigned ticket ${ticket.ticketNumber}: ${ticket.title}`,
      linkUrl: `/helpdesk/${ticket.id}`,
    });
  }

  res.json(ticket);
}

export async function updateStatus(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { status } = req.body;
  const ticket = await prisma.ticket.update({
    where: { id },
    data: { status, resolvedAt: status === "RESOLVED" || status === "CLOSED" ? new Date() : null },
    include,
  });
  await logAudit({ userId: req.user!.id, action: "ticket.status_change", entityType: "Ticket", entityId: id, metadata: { status } });

  const watchers = await watcherIds(id);
  await notifyUsers({
    userIds: [ticket.requesterId, ...(ticket.assigneeId ? [ticket.assigneeId] : []), ...watchers],
    excludeUserId: req.user!.id,
    type: "ticket_status_change",
    message: `Ticket ${ticket.ticketNumber} is now ${status.replace("_", " ")}`,
    linkUrl: `/helpdesk/${ticket.id}`,
  });

  res.json(ticket);
}

export async function addComment(req: Request, res: Response) {
  const ticketId = Number(req.params.id);
  const staff = await isStaff(req.user!.roleId);
  const isInternal = staff && Boolean(req.body.isInternal);

  const comment = await prisma.ticketComment.create({
    data: { ticketId, authorId: req.user!.id, body: req.body.body, isInternal },
    include: { author: { select: { firstName: true, lastName: true } } },
  });
  await logAudit({ userId: req.user!.id, action: "ticket.comment", entityType: "Ticket", entityId: ticketId });

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (ticket) {
    const watchers = await watcherIds(ticketId);
    const recipients = isInternal
      ? watchers.concat(ticket.assigneeId ? [ticket.assigneeId] : [])
      : [ticket.requesterId, ...(ticket.assigneeId ? [ticket.assigneeId] : []), ...watchers];

    await notifyUsers({
      userIds: recipients,
      excludeUserId: req.user!.id,
      type: "ticket_comment",
      message: `New ${isInternal ? "internal note" : "comment"} on ticket ${ticket.ticketNumber}`,
      linkUrl: `/helpdesk/${ticketId}`,
    });
  }

  res.status(201).json(comment);
}

export async function toggleWatch(req: Request, res: Response) {
  const ticketId = Number(req.params.id);
  const userId = req.user!.id;
  const existing = await prisma.ticketWatcher.findUnique({ where: { ticketId_userId: { ticketId, userId } } });

  if (existing) {
    await prisma.ticketWatcher.delete({ where: { id: existing.id } });
    return res.json({ watching: false });
  }

  await prisma.ticketWatcher.create({ data: { ticketId, userId } });
  res.json({ watching: true });
}

export async function submitSatisfaction(req: Request, res: Response) {
  const id = Number(req.params.id);
  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) throw new ApiError(404, "Ticket not found");
  if (ticket.requesterId !== req.user!.id) throw new ApiError(403, "Only the requester can rate this ticket");
  if (!["RESOLVED", "CLOSED"].includes(ticket.status)) throw new ApiError(400, "Ticket must be resolved or closed before rating");

  const updated = await prisma.ticket.update({
    where: { id },
    data: { satisfactionRating: req.body.rating, satisfactionComment: req.body.comment },
    include,
  });
  await logAudit({ userId: req.user!.id, action: "ticket.satisfaction", entityType: "Ticket", entityId: id, metadata: req.body });
  res.json(updated);
}

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "..", "uploads", "tickets");

export async function addAttachment(req: Request, res: Response) {
  if (!req.file) throw new ApiError(400, "No file uploaded");
  const ticketId = Number(req.params.id);

  const attachment = await prisma.ticketAttachment.create({
    data: {
      ticketId,
      filename: req.file.originalname,
      storedPath: req.file.filename,
      sizeBytes: req.file.size,
      uploadedById: req.user!.id,
    },
    include: { uploadedBy: { select: { firstName: true, lastName: true } } },
  });

  await logAudit({ userId: req.user!.id, action: "ticket.attachment_upload", entityType: "Ticket", entityId: ticketId, metadata: { filename: attachment.filename } });
  res.status(201).json(attachment);
}

export async function downloadAttachment(req: Request, res: Response) {
  const attachment = await prisma.ticketAttachment.findUnique({ where: { id: Number(req.params.attachmentId) } });
  if (!attachment || attachment.ticketId !== Number(req.params.id)) throw new ApiError(404, "Attachment not found");

  const filePath = path.join(UPLOAD_ROOT, attachment.storedPath);
  if (!filePath.startsWith(UPLOAD_ROOT) || !fs.existsSync(filePath)) throw new ApiError(404, "File not found");

  res.download(filePath, attachment.filename);
}

export async function deleteAttachment(req: Request, res: Response) {
  const attachment = await prisma.ticketAttachment.findUnique({ where: { id: Number(req.params.attachmentId) } });
  if (!attachment || attachment.ticketId !== Number(req.params.id)) throw new ApiError(404, "Attachment not found");

  const filePath = path.join(UPLOAD_ROOT, attachment.storedPath);
  await prisma.ticketAttachment.delete({ where: { id: attachment.id } });
  if (filePath.startsWith(UPLOAD_ROOT) && fs.existsSync(filePath)) {
    fs.unlink(filePath, () => undefined);
  }

  await logAudit({ userId: req.user!.id, action: "ticket.attachment_delete", entityType: "Ticket", entityId: attachment.ticketId });
  res.json({ ok: true });
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  await prisma.ticket.delete({ where: { id } });
  await logAudit({ userId: req.user!.id, action: "ticket.delete", entityType: "Ticket", entityId: id });
  res.json({ ok: true });
}
