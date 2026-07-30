import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { sendEventEmail } from "./emailNotify";

async function getAlertWindowDays(): Promise<number> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "maintenanceAlertDays" } });
  const parsed = setting ? Number(setting.value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

interface OverdueEmailConfig {
  taskName: string;
  dueDate: string;
}

async function notifyEligibleUsers(message: string, type: string, linkUrl: string, overdueEmail?: OverdueEmailConfig) {
  // Alert everyone whose role can act on assets (edit permission), not just admins.
  const eligibleRoles = await prisma.rolePermission.findMany({
    where: { module: "assets", canEdit: true },
    select: { roleId: true },
  });
  const roleIds = eligibleRoles.map((r) => r.roleId);
  if (roleIds.length === 0) return;

  const users = await prisma.user.findMany({ where: { roleId: { in: roleIds }, isActive: true }, select: { id: true, email: true } });

  // Avoid re-notifying about the same thing within a 24h window.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const alreadyNotified = await prisma.notification.findMany({
    where: { message, type, createdAt: { gte: since } },
    select: { userId: true },
  });
  const alreadyNotifiedIds = new Set(alreadyNotified.map((n) => n.userId));

  const toCreate = users.filter((u) => !alreadyNotifiedIds.has(u.id));
  if (toCreate.length === 0) return;

  await prisma.notification.createMany({
    data: toCreate.map((u) => ({ userId: u.id, type, message, linkUrl })),
  });

  // Only overdue maintenance (not the "upcoming" reminder) goes out as a TASK_OVERDUE email —
  // fired only for the users who actually got a fresh notification above, so it shares the
  // same 24h de-dup boundary rather than re-emailing everyone on every scan.
  if (overdueEmail) {
    const taskUrl = `${env.CLIENT_ORIGIN}${linkUrl}`;
    await Promise.all(
      toCreate.map((u) =>
        sendEventEmail({
          eventType: "TASK_OVERDUE",
          to: u.email,
          variables: { taskType: "Asset Maintenance", taskName: overdueEmail.taskName, dueDate: overdueEmail.dueDate, taskUrl },
          fallbackSubject: `Overdue: ${overdueEmail.taskName}`,
          fallbackText: `${message}\n\nView it here: ${taskUrl}`,
        })
      )
    );
  }
}

/**
 * Scans real Asset records for warranties/service dates due within the configured alert
 * window and raises real Notification rows — no fabricated alerts, and de-duplicated so
 * the same upcoming date doesn't spam a fresh notification every run.
 */
export async function runMaintenanceAlertCheck(): Promise<{ warrantyAlerts: number; serviceAlerts: number }> {
  const windowDays = await getAlertWindowDays();
  const now = new Date();
  const horizon = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const [warrantyDue, serviceDue] = await Promise.all([
    prisma.asset.findMany({
      where: { warrantyExpiresAt: { gte: now, lte: horizon } },
      select: { id: true, assetTag: true, name: true, warrantyExpiresAt: true },
    }),
    prisma.asset.findMany({
      where: { nextServiceDate: { lte: horizon } },
      select: { id: true, assetTag: true, name: true, nextServiceDate: true },
    }),
  ]);

  for (const asset of warrantyDue) {
    const daysLeft = Math.ceil((asset.warrantyExpiresAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const message = `Warranty for ${asset.name} (${asset.assetTag}) expires in ${daysLeft} day(s).`;
    await notifyEligibleUsers(message, "warranty_expiring", `/assets/${asset.id}`);
  }

  for (const asset of serviceDue) {
    const overdue = asset.nextServiceDate!.getTime() < now.getTime();
    const daysLeft = Math.ceil((asset.nextServiceDate!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    const message = overdue
      ? `${asset.name} (${asset.assetTag}) is overdue for scheduled maintenance.`
      : `${asset.name} (${asset.assetTag}) is due for maintenance in ${daysLeft} day(s).`;
    const overdueEmail = overdue
      ? { taskName: `${asset.name} (${asset.assetTag})`, dueDate: asset.nextServiceDate!.toISOString().slice(0, 10) }
      : undefined;
    await notifyEligibleUsers(message, "maintenance_due", `/assets/${asset.id}`, overdueEmail);
  }

  return { warrantyAlerts: warrantyDue.length, serviceAlerts: serviceDue.length };
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startMaintenanceAlertScheduler(intervalHours = 6) {
  if (intervalHandle) return;
  const run = () => {
    runMaintenanceAlertCheck().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Maintenance alert check failed:", err);
    });
  };
  run();
  intervalHandle = setInterval(run, intervalHours * 60 * 60 * 1000);
  intervalHandle.unref();
}
