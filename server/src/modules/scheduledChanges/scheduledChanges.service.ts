import { Prisma, ScheduledChange, ScheduledChangeType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../middleware/errorHandler";
import { logAudit } from "../../lib/auditLogger";
import { notifyUsers } from "../../lib/notify";
import { applySystemSettings } from "../settings/settings.service";
import { applyBackupSettings, BackupSettingsInput } from "../backups/backups.service";
import { applyRolePermissions, RolePermissionInput } from "../roles/roles.controller";

// Snapshots the state a change's payload would overwrite, captured at schedule-creation time (not
// at apply time) so the "before" side of the Change Management detail view reflects what the
// scheduling admin actually saw when they made the choice — not whatever the state happens to be
// whenever someone later opens the detail modal.
export async function captureBeforeSnapshot(changeType: ScheduledChangeType, targetId: number | null): Promise<Prisma.InputJsonValue> {
  switch (changeType) {
    case "SYSTEM_SETTINGS": {
      const rows = await prisma.systemSetting.findMany();
      const values: Record<string, string> = {};
      for (const r of rows) values[r.key] = r.value;
      return { values };
    }
    case "BACKUP_SETTINGS": {
      const settings = await prisma.backupSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
      return { isEnabled: settings.isEnabled, daysOfWeek: settings.daysOfWeek, timeOfDay: settings.timeOfDay };
    }
    case "ROLE_PERMISSIONS": {
      if (targetId === null) throw new ApiError(400, "targetId is required for ROLE_PERMISSIONS");
      const role = await prisma.role.findUnique({ where: { id: targetId }, include: { permissions: true } });
      if (!role) throw new ApiError(404, "Role not found");
      return { roleName: role.name, permissions: role.permissions.map((p) => ({ module: p.module, canView: p.canView, canCreate: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete, canExport: p.canExport })) };
    }
  }
}

export async function buildSummary(changeType: ScheduledChangeType, payload: unknown, targetId: number | null): Promise<string> {
  switch (changeType) {
    case "SYSTEM_SETTINGS": {
      const count = Object.keys((payload as { values: Record<string, string> }).values).length;
      return `System Settings updated (${count} field${count === 1 ? "" : "s"})`;
    }
    case "BACKUP_SETTINGS":
      return "Backup schedule updated";
    case "ROLE_PERMISSIONS": {
      const role = targetId !== null ? await prisma.role.findUnique({ where: { id: targetId }, select: { name: true } }) : null;
      return `Permissions updated for role "${role?.name ?? "unknown"}"`;
    }
  }
}

// One PENDING change per (changeType, targetId) at a time — otherwise a second schedule's
// beforeSnapshot would be misleading (it wouldn't reflect the first pending change, since neither
// has actually applied yet) and Publish Now / Cancel on one would leave the other's diff stale.
export async function assertNoPendingConflict(changeType: ScheduledChangeType, targetId: number | null, excludeId?: number): Promise<void> {
  const existing = await prisma.scheduledChange.findFirst({
    where: { changeType, targetId, status: "PENDING", ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  if (existing) {
    throw new ApiError(409, "There's already a pending scheduled change for this — edit or cancel it instead of scheduling a second one.");
  }
}

export interface ApplyResult {
  ok: boolean;
  error?: string;
}

// Shared by the "Publish Now" route and the scheduler tick (lib/scheduledChangeScheduler.ts) — the
// single place that actually dispatches a scheduled change's payload to the right apply function.
// Re-checks PENDING immediately before applying (guards against publish-now and the scheduler tick
// racing each other) and never throws — a failure is recorded on the row and returned, not thrown,
// so one bad change can't take down a scheduler tick that's also processing other orgs/items.
export async function applyScheduledChange(change: ScheduledChange): Promise<ApplyResult> {
  const fresh = await prisma.scheduledChange.findUnique({ where: { id: change.id } });
  if (!fresh || fresh.status !== "PENDING") {
    return { ok: false, error: "Already processed" };
  }

  try {
    switch (change.changeType) {
      case "SYSTEM_SETTINGS":
        await applySystemSettings((change.payload as { values: Record<string, string> }).values, change.createdById);
        break;
      case "BACKUP_SETTINGS":
        await applyBackupSettings(change.payload as unknown as BackupSettingsInput, change.createdById);
        break;
      case "ROLE_PERMISSIONS": {
        if (change.targetId === null) throw new ApiError(400, "Missing targetId for role permissions change");
        const { permissions } = change.payload as { permissions: RolePermissionInput[] };
        await applyRolePermissions(change.targetId, permissions, change.createdById);
        break;
      }
    }

    await prisma.scheduledChange.update({ where: { id: change.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    await logAudit({ userId: change.createdById, action: "scheduledChange.publish", entityType: "ScheduledChange", entityId: change.id });
    await notifyUsers({
      userIds: [change.createdById],
      type: "scheduled_change_published",
      message: `Your scheduled change "${change.summary}" was published.`,
      linkUrl: "/app-settings",
    });
    return { ok: true };
  } catch (err) {
    const errorMessage = err instanceof ApiError ? err.message : "Failed to apply this change.";
    await prisma.scheduledChange.update({ where: { id: change.id }, data: { status: "FAILED", errorMessage } });
    await logAudit({ userId: change.createdById, action: "scheduledChange.fail", entityType: "ScheduledChange", entityId: change.id, metadata: { error: errorMessage } });
    await notifyUsers({
      userIds: [change.createdById],
      type: "scheduled_change_failed",
      message: `Your scheduled change "${change.summary}" failed to publish: ${errorMessage}`,
      linkUrl: "/app-settings",
    });
    return { ok: false, error: errorMessage };
  }
}
