import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { ApiError } from "../../middleware/errorHandler";
import { hasPermission } from "../../middleware/rbac";
import { logAudit } from "../../lib/auditLogger";
import { notifyUsers } from "../../lib/notify";
import { getPagination, paginatedResponse } from "../../lib/pagination";
import { computeDueAt } from "./sla";

const include = {
  requester: { select: { id: true, firstName: true, lastName: true } },
  assignees: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
  asset: { select: { id: true, assetTag: true, name: true } },
  location: { select: { id: true, name: true } },
  assignedTeams: { include: { team: { select: { id: true, name: true } } } },
  category: true,
};

async function isStaff(roleId: number) {
  return hasPermission(roleId, "helpdesk", "edit");
}

async function watcherIds(ticketId: number): Promise<number[]> {
  const watchers = await prisma.ticketWatcher.findMany({ where: { ticketId }, select: { userId: true } });
  return watchers.map((w) => w.userId);
}

async function teamMemberIds(teamId: number): Promise<number[]> {
  const members = await prisma.teamMember.findMany({ where: { teamId }, select: { userId: true } });
  return members.map((m) => m.userId);
}

// Replaces a ticket's assignee/team-assignment join rows with the given arrays (delete-all-then-
// recreate, same convention teams.routes.ts uses for TeamMember) and returns only the ids that
// are newly added — so re-saving unrelated ticket fields doesn't re-notify people already
// assigned. `undefined` for either array means "don't touch that assignment type".
async function syncAssignments(
  ticketId: number,
  assigneeIds: number[] | undefined,
  assignedTeamIds: number[] | undefined
): Promise<{ newAssigneeIds: number[]; newTeamIds: number[] }> {
  let newAssigneeIds: number[] = [];
  let newTeamIds: number[] = [];

  if (assigneeIds !== undefined) {
    const existing = await prisma.ticketAssignee.findMany({ where: { ticketId }, select: { userId: true } });
    const existingIds = new Set(existing.map((a) => a.userId));
    newAssigneeIds = assigneeIds.filter((id) => !existingIds.has(id));
    await prisma.$transaction([
      prisma.ticketAssignee.deleteMany({ where: { ticketId } }),
      ...(assigneeIds.length
        ? [prisma.ticketAssignee.createMany({ data: assigneeIds.map((userId) => ({ ticketId, userId })) })]
        : []),
    ]);
  }

  if (assignedTeamIds !== undefined) {
    const existing = await prisma.ticketAssignedTeam.findMany({ where: { ticketId }, select: { teamId: true } });
    const existingIds = new Set(existing.map((t) => t.teamId));
    newTeamIds = assignedTeamIds.filter((id) => !existingIds.has(id));
    await prisma.$transaction([
      prisma.ticketAssignedTeam.deleteMany({ where: { ticketId } }),
      ...(assignedTeamIds.length
        ? [prisma.ticketAssignedTeam.createMany({ data: assignedTeamIds.map((teamId) => ({ ticketId, teamId })) })]
        : []),
    ]);
  }

  return { newAssigneeIds, newTeamIds };
}

async function notifyNewAssignments(ticket: { id: number; ticketNumber: string; title: string; priority: string }, newAssigneeIds: number[], newTeamIds: number[], excludeUserId: number) {
  const ticketUrl = `${env.CLIENT_ORIGIN}/helpdesk/${ticket.id}`;
  const emailConfig = {
    eventType: "TICKET_ASSIGNED" as const,
    fallbackSubject: `You were assigned ticket ${ticket.ticketNumber}`,
    fallbackText: `You were assigned ticket ${ticket.ticketNumber}: ${ticket.title}.\n\nView it here: ${ticketUrl}`,
    variables: { ticketNumber: ticket.ticketNumber, ticketTitle: ticket.title, priority: ticket.priority, ticketUrl },
  };

  if (newAssigneeIds.length) {
    await notifyUsers({
      userIds: newAssigneeIds,
      excludeUserId,
      kind: "TICKET_ASSIGNED",
      type: "ticket_assigned",
      message: `You were assigned ticket ${ticket.ticketNumber}: ${ticket.title}`,
      linkUrl: `/helpdesk/${ticket.id}`,
      email: emailConfig,
    });
  }

  for (const teamId of newTeamIds) {
    const memberIds = await teamMemberIds(teamId);
    await notifyUsers({
      userIds: memberIds,
      excludeUserId,
      kind: "TICKET_ASSIGNED",
      type: "ticket_assigned",
      message: `Your team was assigned ticket ${ticket.ticketNumber}: ${ticket.title}`,
      linkUrl: `/helpdesk/${ticket.id}`,
      email: emailConfig,
    });
  }
}

export async function list(req: Request, res: Response) {
  const { page, pageSize, skip, take } = getPagination(req);
  const { status, priority, type, categoryId, assignedToMe, mine, overdue, search } = req.query as Record<string, string | undefined>;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (type) where.type = type;
  if (categoryId) where.categoryId = Number(categoryId);
  if (assignedToMe === "true") where.assignees = { some: { userId: req.user!.id } };
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
      { assignees: { some: { user: { OR: [{ firstName: { contains: search, mode: "insensitive" } }, { lastName: { contains: search, mode: "insensitive" } }] } } } },
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
  const { assigneeIds, assignedTeamIds, ...rest } = req.body;
  const ticket = await prisma.ticket.create({
    data: { ...rest, ticketNumber, requesterId: req.user!.id, dueAt: req.body.dueAt ?? computeDueAt(priority) },
    include,
  });
  await logAudit({ userId: req.user!.id, action: "ticket.create", entityType: "Ticket", entityId: ticket.id });

  const { newAssigneeIds, newTeamIds } = await syncAssignments(ticket.id, assigneeIds ?? [], assignedTeamIds ?? []);
  await notifyNewAssignments(ticket, newAssigneeIds, newTeamIds, req.user!.id);

  const refreshed = await prisma.ticket.findUnique({ where: { id: ticket.id }, include });
  res.status(201).json(refreshed);
}

export async function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { assigneeIds, assignedTeamIds, ...rest } = req.body;
  const ticket = await prisma.ticket.update({ where: { id }, data: rest, include });
  await logAudit({ userId: req.user!.id, action: "ticket.update", entityType: "Ticket", entityId: id, metadata: req.body });

  const { newAssigneeIds, newTeamIds } = await syncAssignments(id, assigneeIds, assignedTeamIds);
  await notifyNewAssignments(ticket, newAssigneeIds, newTeamIds, req.user!.id);

  const refreshed = newAssigneeIds.length || newTeamIds.length || assigneeIds !== undefined || assignedTeamIds !== undefined
    ? await prisma.ticket.findUnique({ where: { id }, include })
    : ticket;
  res.json(refreshed);
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
    userIds: [ticket.requesterId, ...ticket.assignees.map((a) => a.userId), ...watchers],
    excludeUserId: req.user!.id,
    kind: "TICKET_WATCHING",
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

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { assignees: true } });
  if (ticket) {
    const watchers = await watcherIds(ticketId);
    const assigneeIds = ticket.assignees.map((a) => a.userId);
    const recipients = isInternal
      ? watchers.concat(assigneeIds)
      : [ticket.requesterId, ...assigneeIds, ...watchers];

    await notifyUsers({
      userIds: recipients,
      excludeUserId: req.user!.id,
      kind: "TICKET_WATCHING",
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

  let commentId: number | undefined;
  if (req.body.commentId) {
    const comment = await prisma.ticketComment.findUnique({ where: { id: Number(req.body.commentId) } });
    if (!comment || comment.ticketId !== ticketId) throw new ApiError(400, "Comment does not belong to this ticket");
    commentId = comment.id;
  }

  const attachment = await prisma.ticketAttachment.create({
    data: {
      ticketId,
      commentId,
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
