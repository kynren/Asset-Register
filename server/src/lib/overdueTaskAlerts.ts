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
      where: { status: { notIn: ["RESOLVED", "CLOSED"] }, dueAt: { lt: now }, assigneeId: { not: null } },
      select: { id: true, ticketNumber: true, title: true, dueAt: true, assigneeId: true },
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
    if (await alreadyNotifiedRecently(t.assigneeId!, message)) continue;
    const taskUrl = `${env.CLIENT_ORIGIN}/helpdesk/${t.id}`;
    await notifyUsers({
      userIds: [t.assigneeId!],
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

let intervalHandle: NodeJS.Timeout | null = null;

export function startOverdueTaskScheduler(intervalHours = 6) {
  if (intervalHandle) return;
  const run = () => {
    runForEachOrganization(runOverdueTaskCheck).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Overdue task check failed:", err);
    });
  };
  run();
  intervalHandle = setInterval(run, intervalHours * 60 * 60 * 1000);
  intervalHandle.unref();
}
