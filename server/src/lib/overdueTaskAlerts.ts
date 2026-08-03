import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { runForEachOrganization } from "../config/controlPlane";
import { notifyUsers } from "./notify";

// Same de-dup strategy as maintenanceAlerts.ts: don't re-notify about the exact same overdue
// item within a 24h window, so a 6-hourly scan doesn't spam a fresh email every run.
async function alreadyNotifiedRecently(userId: number, message: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await prisma.notification.findFirst({ where: { userId, type: "task_overdue", message, createdAt: { gte: since } } });
  return Boolean(existing);
}

function formatDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

/**
 * Scans real overdue items across three sources that each already track their own due date —
 * asset checkouts (dueBackAt), helpdesk tickets (dueAt), and IT project kanban tasks (dueDate) —
 * and notifies whoever the item is personally assigned to. (Overdue maintenance already has its
 * own scan in maintenanceAlerts.ts; that one dispatches TASK_OVERDUE email directly rather than
 * duplicating the scan here.)
 */
export async function runOverdueTaskCheck(): Promise<{ checkouts: number; tickets: number; kanbanTasks: number }> {
  const now = new Date();

  const [overdueCheckouts, overdueTickets, overdueKanban] = await Promise.all([
    prisma.assetCheckout.findMany({
      where: { checkedInAt: null, dueBackAt: { lt: now } },
      select: { checkedOutToId: true, dueBackAt: true, asset: { select: { id: true, name: true, assetTag: true } } },
    }),
    prisma.ticket.findMany({
      where: { status: { notIn: ["RESOLVED", "CLOSED"] }, dueAt: { lt: now }, assignees: { some: {} } },
      select: { id: true, ticketNumber: true, title: true, dueAt: true, assignees: { select: { userId: true } } },
    }),
    prisma.projectCard.findMany({
      where: { status: { not: "DONE" }, dueDate: { lt: now }, assigneeId: { not: null } },
      select: { id: true, title: true, dueDate: true, assigneeId: true },
    }),
  ]);

  for (const c of overdueCheckouts) {
    const message = `${c.asset.name} (${c.asset.assetTag}) is overdue for return.`;
    if (await alreadyNotifiedRecently(c.checkedOutToId, message)) continue;
    const taskUrl = `${env.CLIENT_ORIGIN}/assets/${c.asset.id}`;
    await notifyUsers({
      userIds: [c.checkedOutToId],
      type: "task_overdue",
      message,
      linkUrl: `/assets/${c.asset.id}`,
      email: {
        eventType: "TASK_OVERDUE",
        fallbackSubject: "Overdue: asset return",
        fallbackText: `${message}\n\nView it here: ${taskUrl}`,
        variables: { taskType: "Asset Checkout", taskName: `${c.asset.name} (${c.asset.assetTag})`, dueDate: formatDate(c.dueBackAt), taskUrl },
      },
    });
  }

  for (const t of overdueTickets) {
    const message = `Ticket ${t.ticketNumber} "${t.title}" is overdue.`;
    const toNotify: number[] = [];
    for (const a of t.assignees) {
      if (!(await alreadyNotifiedRecently(a.userId, message))) toNotify.push(a.userId);
    }
    if (toNotify.length === 0) continue;
    const taskUrl = `${env.CLIENT_ORIGIN}/helpdesk/${t.id}`;
    await notifyUsers({
      userIds: toNotify,
      type: "task_overdue",
      message,
      linkUrl: `/helpdesk/${t.id}`,
      email: {
        eventType: "TASK_OVERDUE",
        fallbackSubject: `Overdue ticket: ${t.ticketNumber}`,
        fallbackText: `${message}\n\nView it here: ${taskUrl}`,
        variables: { taskType: "Helpdesk Ticket", taskName: `${t.ticketNumber} — ${t.title}`, dueDate: formatDate(t.dueAt), taskUrl },
      },
    });
  }

  for (const k of overdueKanban) {
    const message = `Task "${k.title}" is overdue.`;
    if (await alreadyNotifiedRecently(k.assigneeId!, message)) continue;
    const taskUrl = `${env.CLIENT_ORIGIN}/operations`;
    await notifyUsers({
      userIds: [k.assigneeId!],
      type: "task_overdue",
      message,
      linkUrl: `/operations`,
      email: {
        eventType: "TASK_OVERDUE",
        fallbackSubject: `Overdue task: ${k.title}`,
        fallbackText: `${message}\n\nView it here: ${taskUrl}`,
        variables: { taskType: "IT Project Task", taskName: k.title, dueDate: formatDate(k.dueDate), taskUrl },
      },
    });
  }

  return { checkouts: overdueCheckouts.length, tickets: overdueTickets.length, kanbanTasks: overdueKanban.length };
}

// SLA escalation: unlike the generic overdue-ticket scan above (keyed off the priority-derived
// `dueAt`), this watches the SLA-specific TTO/TTR clocks and escalates a breach to everyone
// currently on the hook for the ticket — its individual assignees plus every member of any
// assigned team. GLPI escalates to a *different*, higher-tier group via per-level SLA config;
// we don't model escalation levels, so "escalate" here means "widen the notification to the
// whole owning team" rather than routing to a separate escalation group.
export async function runSlaBreachCheck(): Promise<{ ttoBreaches: number; ttrBreaches: number }> {
  const now = new Date();

  const [ttoBreached, ttrBreached] = await Promise.all([
    prisma.ticket.findMany({
      where: { ttoDueAt: { lt: now }, ttoMetAt: null, status: { notIn: ["RESOLVED", "CLOSED"] } },
      select: {
        id: true, ticketNumber: true, title: true, ttoDueAt: true,
        assignees: { select: { userId: true } },
        assignedTeams: { select: { teamId: true } },
      },
    }),
    prisma.ticket.findMany({
      where: { ttrDueAt: { lt: now }, ttrMetAt: null, status: { notIn: ["RESOLVED", "CLOSED"] } },
      select: {
        id: true, ticketNumber: true, title: true, ttrDueAt: true,
        assignees: { select: { userId: true } },
        assignedTeams: { select: { teamId: true } },
      },
    }),
  ]);

  async function escalationRecipients(t: { assignees: { userId: number }[]; assignedTeams: { teamId: number }[] }): Promise<number[]> {
    const ids = new Set(t.assignees.map((a) => a.userId));
    for (const at of t.assignedTeams) {
      for (const id of await teamMemberIds(at.teamId)) ids.add(id);
    }
    return [...ids];
  }

  let ttoBreaches = 0;
  for (const t of ttoBreached) {
    const recipients = await escalationRecipients(t);
    if (!recipients.length) continue;
    const message = `SLA breach: ticket ${t.ticketNumber} "${t.title}" is past its time-to-own deadline and still unassigned.`;
    const toNotify: number[] = [];
    for (const userId of recipients) {
      if (!(await alreadyNotifiedRecently(userId, message))) toNotify.push(userId);
    }
    if (!toNotify.length) continue;
    await notifyUsers({
      userIds: toNotify,
      type: "sla_breach",
      message,
      linkUrl: `/helpdesk/${t.id}`,
      email: {
        eventType: "TASK_OVERDUE",
        fallbackSubject: `SLA breach (TTO): ${t.ticketNumber}`,
        fallbackText: `${message}\n\nView it here: ${env.CLIENT_ORIGIN}/helpdesk/${t.id}`,
        variables: { taskType: "SLA — Time to Own", taskName: `${t.ticketNumber} — ${t.title}`, dueDate: formatDate(t.ttoDueAt), taskUrl: `${env.CLIENT_ORIGIN}/helpdesk/${t.id}` },
      },
    });
    ttoBreaches++;
  }

  let ttrBreaches = 0;
  for (const t of ttrBreached) {
    const recipients = await escalationRecipients(t);
    if (!recipients.length) continue;
    const message = `SLA breach: ticket ${t.ticketNumber} "${t.title}" is past its resolution deadline.`;
    const toNotify: number[] = [];
    for (const userId of recipients) {
      if (!(await alreadyNotifiedRecently(userId, message))) toNotify.push(userId);
    }
    if (!toNotify.length) continue;
    await notifyUsers({
      userIds: toNotify,
      type: "sla_breach",
      message,
      linkUrl: `/helpdesk/${t.id}`,
      email: {
        eventType: "TASK_OVERDUE",
        fallbackSubject: `SLA breach (TTR): ${t.ticketNumber}`,
        fallbackText: `${message}\n\nView it here: ${env.CLIENT_ORIGIN}/helpdesk/${t.id}`,
        variables: { taskType: "SLA — Time to Resolve", taskName: `${t.ticketNumber} — ${t.title}`, dueDate: formatDate(t.ttrDueAt), taskUrl: `${env.CLIENT_ORIGIN}/helpdesk/${t.id}` },
      },
    });
    ttrBreaches++;
  }

  return { ttoBreaches, ttrBreaches };
}

async function teamMemberIds(teamId: number): Promise<number[]> {
  const members = await prisma.teamMember.findMany({ where: { teamId }, select: { userId: true } });
  return members.map((m) => m.userId);
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startOverdueTaskScheduler(intervalHours = 6) {
  if (intervalHandle) return;
  const run = () => {
    runForEachOrganization(runOverdueTaskCheck).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Overdue task check failed:", err);
    });
    runForEachOrganization(runSlaBreachCheck).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("SLA breach check failed:", err);
    });
  };
  run();
  intervalHandle = setInterval(run, intervalHours * 60 * 60 * 1000);
  intervalHandle.unref();
}
