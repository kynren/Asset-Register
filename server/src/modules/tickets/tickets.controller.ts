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
import { computeDueAt, computeSlaDueDates, resolveSlaForCategory } from "./sla";
import { applyTicketRules } from "./ticketRules";

const include = {
  requester: { select: { id: true, firstName: true, lastName: true } },
  assignees: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
  asset: { select: { id: true, assetTag: true, name: true } },
  location: { select: { id: true, name: true } },
  assignedTeams: { include: { team: { select: { id: true, name: true } } } },
  category: true,
  sla: true,
  template: { select: { id: true, name: true } },
};

const userBrief = { select: { id: true, firstName: true, lastName: true } };

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

  // TTO ("time to own") is met the moment the ticket first gets an owner — mirrors GLPI's
  // take-ownership semantics rather than time-to-first-response. Only stamped once.
  if (newAssigneeIds.length || newTeamIds.length) {
    await prisma.ticket.updateMany({ where: { id: ticketId, ttoMetAt: null }, data: { ttoMetAt: new Date() } });
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
  const { status, priority, type, itilType, categoryId, assignedToMe, mine, overdue, search } = req.query as Record<string, string | undefined>;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (type) where.type = type;
  if (itilType) where.itilType = itilType;
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

export async function stats(req: Request, res: Response) {
  const now = new Date();
  const { status, priority, categoryId, itilType } = req.query as Record<string, string | undefined>;
  const where = {
    ...(status ? { status: status as any } : {}),
    ...(priority ? { priority: priority as any } : {}),
    ...(categoryId ? { categoryId: Number(categoryId) } : {}),
    ...(itilType ? { itilType: itilType as any } : {}),
  };
  const [byStatus, byPriority, overdueCount, myOpenCount] = await Promise.all([
    prisma.ticket.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["priority"], where, _count: { _all: true } }),
    prisma.ticket.count({ where: { ...where, dueAt: { lt: now }, status: { notIn: ["RESOLVED", "CLOSED"] } } }),
    prisma.ticket.count({ where: { ...where, assignees: { some: { userId: req.user!.id } }, status: { notIn: ["RESOLVED", "CLOSED"] } } }),
  ]);

  const total = byStatus.reduce((sum, g) => sum + g._count._all, 0);
  res.json({
    total,
    byStatus: byStatus.map((g) => ({ status: g.status, count: g._count._all })),
    byPriority: byPriority.map((g) => ({ priority: g.priority, count: g._count._all })),
    overdueCount,
    myOpenCount,
  });
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
      tasks: { include: { assignedTo: userBrief, author: userBrief }, orderBy: { createdAt: "desc" } },
      solutions: { include: { author: userBrief, answeredBy: userBrief }, orderBy: { createdAt: "desc" } },
      approvals: { include: { requestedBy: userBrief, targetUser: userBrief, targetTeam: { select: { id: true, name: true } }, answeredBy: userBrief }, orderBy: { createdAt: "desc" } },
      linksFrom: { include: { linkedTicket: { select: { id: true, ticketNumber: true, title: true, status: true, itilType: true } } } },
      linksTo: { include: { ticket: { select: { id: true, ticketNumber: true, title: true, status: true, itilType: true } } } },
      knowledgeArticles: { include: { article: { select: { id: true, title: true } } } },
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
  const { assigneeIds, assignedTeamIds, ...rest } = req.body;

  const data: Record<string, unknown> = { ...rest, requesterId: req.user!.id };

  // Template predefined fields fill in anything the caller didn't already set — an explicit
  // value on the create payload always wins over the template's default.
  if (data.templateId) {
    const fields = await prisma.ticketTemplateField.findMany({ where: { templateId: Number(data.templateId), mode: "PREDEFINED" } });
    for (const f of fields) {
      if (data[f.fieldKey] == null && f.predefinedValue != null) {
        const numericFields = new Set(["categoryId", "assetId", "locationId", "slaId"]);
        data[f.fieldKey] = numericFields.has(f.fieldKey) ? Number(f.predefinedValue) : f.predefinedValue;
      }
    }
  }

  // Business rules run after template defaults so a rule can still override a template's
  // predefined value, then before SLA resolution so a rule-assigned category can drive the SLA.
  await applyTicketRules(data);

  if (!data.slaId) {
    const resolvedSla = await resolveSlaForCategory(data.categoryId as number | null | undefined);
    if (resolvedSla) data.slaId = resolvedSla.id;
  }
  const sla = data.slaId ? await prisma.ticketSla.findUnique({ where: { id: Number(data.slaId) } }) : null;
  const { ttoDueAt, ttrDueAt } = computeSlaDueDates(sla);

  const priority = (data.priority as string) || "MEDIUM";
  const ticket = await prisma.ticket.create({
    data: { ...data, ticketNumber, dueAt: data.dueAt ?? computeDueAt(priority), ttoDueAt, ttrDueAt } as any,
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
  const resolving = status === "RESOLVED" || status === "CLOSED";
  const ticket = await prisma.ticket.update({
    where: { id },
    // ttrMetAt is left untouched on reopen (undefined) — it records the most recent resolution
    // time, not "currently resolved," so reopening a ticket doesn't erase SLA history.
    data: { status, resolvedAt: resolving ? new Date() : null, ttrMetAt: resolving ? new Date() : undefined },
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

// ───────────────────────── Tasks ─────────────────────────

export async function createTask(req: Request, res: Response) {
  const ticketId = Number(req.params.id);
  const task = await prisma.ticketTask.create({
    data: { ...req.body, ticketId, authorId: req.user!.id },
    include: { assignedTo: userBrief, author: userBrief },
  });
  await logAudit({ userId: req.user!.id, action: "ticket.task_create", entityType: "Ticket", entityId: ticketId });

  if (task.assignedToId && task.assignedToId !== req.user!.id) {
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (ticket) {
      await notifyUsers({
        userIds: [task.assignedToId],
        excludeUserId: req.user!.id,
        kind: "TICKET_ASSIGNED",
        type: "ticket_task_assigned",
        message: `You were assigned a task on ticket ${ticket.ticketNumber}: ${task.content}`,
        linkUrl: `/helpdesk/${ticketId}`,
      });
    }
  }

  res.status(201).json(task);
}

export async function updateTask(req: Request, res: Response) {
  const ticketId = Number(req.params.id);
  const taskId = Number(req.params.taskId);
  const existing = await prisma.ticketTask.findUnique({ where: { id: taskId } });
  if (!existing || existing.ticketId !== ticketId) throw new ApiError(404, "Task not found");

  const task = await prisma.ticketTask.update({ where: { id: taskId }, data: req.body, include: { assignedTo: userBrief, author: userBrief } });
  await logAudit({ userId: req.user!.id, action: "ticket.task_update", entityType: "Ticket", entityId: ticketId, metadata: req.body });
  res.json(task);
}

export async function deleteTask(req: Request, res: Response) {
  const ticketId = Number(req.params.id);
  const taskId = Number(req.params.taskId);
  const existing = await prisma.ticketTask.findUnique({ where: { id: taskId } });
  if (!existing || existing.ticketId !== ticketId) throw new ApiError(404, "Task not found");

  await prisma.ticketTask.delete({ where: { id: taskId } });
  await logAudit({ userId: req.user!.id, action: "ticket.task_delete", entityType: "Ticket", entityId: ticketId });
  res.json({ ok: true });
}

// ───────────────────────── Solutions ─────────────────────────

// Proposing a solution mirrors GLPI's flow: the ticket moves straight to RESOLVED and the
// solution itself carries WAITING (needs the requester's confirmation) unless the org's
// autoCloseDelayDays is configured to 0, in which case it's accepted immediately.
export async function proposeSolution(req: Request, res: Response) {
  const ticketId = Number(req.params.id);
  const settings = await prisma.helpdeskSettings.findUnique({ where: { id: 1 } });
  const autoAccept = (settings?.autoCloseDelayDays ?? 4) === 0;

  const [solution, ticket] = await prisma.$transaction([
    prisma.ticketSolution.create({
      data: {
        ticketId,
        content: req.body.content,
        authorId: req.user!.id,
        status: autoAccept ? "ACCEPTED" : "WAITING",
        ...(autoAccept ? { answeredById: req.user!.id, answeredAt: new Date() } : {}),
      },
      include: { author: userBrief, answeredBy: userBrief },
    }),
    prisma.ticket.update({
      where: { id: ticketId },
      data: { status: autoAccept ? "CLOSED" : "RESOLVED", resolvedAt: new Date(), ttrMetAt: new Date() },
      include,
    }),
  ]);
  await logAudit({ userId: req.user!.id, action: "ticket.solution_propose", entityType: "Ticket", entityId: ticketId });

  const watchers = await watcherIds(ticketId);
  await notifyUsers({
    userIds: [ticket.requesterId, ...watchers],
    excludeUserId: req.user!.id,
    kind: "TICKET_WATCHING",
    type: "ticket_solution_proposed",
    message: `A solution was proposed for ticket ${ticket.ticketNumber}`,
    linkUrl: `/helpdesk/${ticketId}`,
  });

  res.status(201).json({ solution, ticket });
}

// Requester accepts (solution stays ACCEPTED, ticket stays RESOLVED) or refuses (comment
// required — reopens the ticket to IN_PROGRESS so a new solution can be proposed).
export async function answerSolution(req: Request, res: Response) {
  const ticketId = Number(req.params.id);
  const solutionId = Number(req.params.solutionId);
  const solution = await prisma.ticketSolution.findUnique({ where: { id: solutionId } });
  if (!solution || solution.ticketId !== ticketId) throw new ApiError(404, "Solution not found");
  if (solution.status !== "WAITING") throw new ApiError(400, "This solution has already been answered");

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new ApiError(404, "Ticket not found");
  if (ticket.requesterId !== req.user!.id) throw new ApiError(403, "Only the requester can answer this solution");

  const { accept, comment } = req.body as { accept: boolean; comment?: string };
  if (!accept && !comment?.trim()) throw new ApiError(400, "A comment is required to refuse a solution");

  const [updatedSolution, updatedTicket] = await prisma.$transaction([
    prisma.ticketSolution.update({
      where: { id: solutionId },
      data: { status: accept ? "ACCEPTED" : "REFUSED", answeredById: req.user!.id, answeredAt: new Date(), answerComment: comment },
      include: { author: userBrief, answeredBy: userBrief },
    }),
    prisma.ticket.update({
      where: { id: ticketId },
      data: accept ? { status: "CLOSED" } : { status: "IN_PROGRESS", resolvedAt: null },
      include,
    }),
  ]);
  await logAudit({ userId: req.user!.id, action: "ticket.solution_answer", entityType: "Ticket", entityId: ticketId, metadata: { accept } });

  const assigneeIds = updatedTicket.assignees.map((a) => a.userId);
  await notifyUsers({
    userIds: [solution.authorId, ...assigneeIds],
    excludeUserId: req.user!.id,
    kind: "TICKET_WATCHING",
    type: "ticket_solution_answered",
    message: `The proposed solution for ticket ${updatedTicket.ticketNumber} was ${accept ? "accepted" : "refused"}`,
    linkUrl: `/helpdesk/${ticketId}`,
  });

  res.json({ solution: updatedSolution, ticket: updatedTicket });
}

// ───────────────────────── Approvals ─────────────────────────

export async function requestApproval(req: Request, res: Response) {
  const ticketId = Number(req.params.id);
  const { targetUserId, targetTeamId, comment } = req.body as { targetUserId?: number | null; targetTeamId?: number | null; comment?: string };

  const approval = await prisma.ticketApproval.create({
    data: { ticketId, requestedById: req.user!.id, targetUserId: targetUserId ?? undefined, targetTeamId: targetTeamId ?? undefined, comment },
    include: { requestedBy: userBrief, targetUser: userBrief, targetTeam: { select: { id: true, name: true } } },
  });
  await logAudit({ userId: req.user!.id, action: "ticket.approval_request", entityType: "Ticket", entityId: ticketId });

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  const recipientIds = targetUserId ? [targetUserId] : targetTeamId ? await teamMemberIds(targetTeamId) : [];
  if (ticket && recipientIds.length) {
    await notifyUsers({
      userIds: recipientIds,
      excludeUserId: req.user!.id,
      kind: "TICKET_WATCHING",
      type: "ticket_approval_requested",
      message: `Your approval was requested on ticket ${ticket.ticketNumber}`,
      linkUrl: `/helpdesk/${ticketId}`,
    });
  }

  res.status(201).json(approval);
}

export async function answerApproval(req: Request, res: Response) {
  const ticketId = Number(req.params.id);
  const approvalId = Number(req.params.approvalId);
  const approval = await prisma.ticketApproval.findUnique({ where: { id: approvalId } });
  if (!approval || approval.ticketId !== ticketId) throw new ApiError(404, "Approval request not found");
  if (approval.status !== "WAITING") throw new ApiError(400, "This approval has already been answered");

  const userId = req.user!.id;
  const isTargetUser = approval.targetUserId === userId;
  const isTargetTeamMember = approval.targetTeamId ? (await teamMemberIds(approval.targetTeamId)).includes(userId) : false;
  if (!isTargetUser && !isTargetTeamMember) throw new ApiError(403, "You are not the target of this approval request");

  const { accept, comment } = req.body as { accept: boolean; comment?: string };
  const updated = await prisma.ticketApproval.update({
    where: { id: approvalId },
    data: { status: accept ? "ACCEPTED" : "REFUSED", answeredById: userId, answeredAt: new Date(), answerComment: comment },
    include: { requestedBy: userBrief, targetUser: userBrief, targetTeam: { select: { id: true, name: true } }, answeredBy: userBrief },
  });
  await logAudit({ userId, action: "ticket.approval_answer", entityType: "Ticket", entityId: ticketId, metadata: { accept } });

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (ticket) {
    await notifyUsers({
      userIds: [approval.requestedById],
      excludeUserId: userId,
      kind: "TICKET_WATCHING",
      type: "ticket_approval_answered",
      message: `Approval on ticket ${ticket.ticketNumber} was ${accept ? "granted" : "refused"}`,
      linkUrl: `/helpdesk/${ticketId}`,
    });
  }

  res.json(updated);
}

const approvalTicketBrief = { select: { id: true, ticketNumber: true, title: true, status: true } };
const approvalInclude = {
  ticket: approvalTicketBrief,
  requestedBy: userBrief,
  targetUser: userBrief,
  targetTeam: { select: { id: true, name: true } },
  answeredBy: userBrief,
};

// Cross-ticket approvals inbox/outbox — every per-ticket approval endpoint above is scoped to one
// ticket's approvals array; this is the only place a user sees every approval touching them at
// once. "Needs my approval" is deliberately narrowed to WAITING rows (an actionable queue), while
// "sent by me" shows the full history so the requester can track outcomes.
export async function listMyApprovals(req: Request, res: Response) {
  const userId = req.user!.id;
  const myTeams = await prisma.teamMember.findMany({ where: { userId }, select: { teamId: true } });
  const myTeamIds = myTeams.map((t) => t.teamId);

  const [needsApproval, sentByMe] = await Promise.all([
    prisma.ticketApproval.findMany({
      where: {
        status: "WAITING",
        OR: [{ targetUserId: userId }, ...(myTeamIds.length ? [{ targetTeamId: { in: myTeamIds } }] : [])],
      },
      include: approvalInclude,
      orderBy: { createdAt: "desc" },
    }),
    prisma.ticketApproval.findMany({
      where: { requestedById: userId },
      include: approvalInclude,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  res.json({ needsApproval, sentByMe });
}

// ───────────────────────── Linked tickets ─────────────────────────

export async function createLink(req: Request, res: Response) {
  const ticketId = Number(req.params.id);
  const { linkedTicketId, linkType } = req.body as { linkedTicketId: number; linkType?: string };
  if (linkedTicketId === ticketId) throw new ApiError(400, "A ticket cannot be linked to itself");

  const link = await prisma.ticketLink.create({
    data: { ticketId, linkedTicketId, linkType: (linkType as any) ?? "RELATES_TO" },
    include: { linkedTicket: { select: { id: true, ticketNumber: true, title: true, status: true, itilType: true } } },
  });
  await logAudit({ userId: req.user!.id, action: "ticket.link_create", entityType: "Ticket", entityId: ticketId, metadata: { linkedTicketId } });
  res.status(201).json(link);
}

export async function deleteLink(req: Request, res: Response) {
  const ticketId = Number(req.params.id);
  const linkId = Number(req.params.linkId);
  const link = await prisma.ticketLink.findUnique({ where: { id: linkId } });
  if (!link || link.ticketId !== ticketId) throw new ApiError(404, "Link not found");

  await prisma.ticketLink.delete({ where: { id: linkId } });
  await logAudit({ userId: req.user!.id, action: "ticket.link_delete", entityType: "Ticket", entityId: ticketId });
  res.json({ ok: true });
}

// ───────────────────────── Knowledge base ─────────────────────────

export async function attachKnowledgeArticle(req: Request, res: Response) {
  const ticketId = Number(req.params.id);
  const { articleId } = req.body as { articleId: number };

  const attachment = await prisma.ticketKnowledgeArticle.create({
    data: { ticketId, articleId },
    include: { article: { select: { id: true, title: true } } },
  });
  await logAudit({ userId: req.user!.id, action: "ticket.kb_attach", entityType: "Ticket", entityId: ticketId, metadata: { articleId } });
  res.status(201).json(attachment);
}

export async function detachKnowledgeArticle(req: Request, res: Response) {
  const ticketId = Number(req.params.id);
  const linkId = Number(req.params.linkId);
  const link = await prisma.ticketKnowledgeArticle.findUnique({ where: { id: linkId } });
  if (!link || link.ticketId !== ticketId) throw new ApiError(404, "Attached article not found");

  await prisma.ticketKnowledgeArticle.delete({ where: { id: linkId } });
  await logAudit({ userId: req.user!.id, action: "ticket.kb_detach", entityType: "Ticket", entityId: ticketId });
  res.json({ ok: true });
}
