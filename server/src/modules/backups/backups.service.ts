import { prisma } from "../../config/prisma";
import { logAudit } from "../../lib/auditLogger";

export interface BackupSettingsInput {
  isEnabled: boolean;
  daysOfWeek: number[];
  timeOfDay: string;
}

// Shared by the direct-save route below AND the App Settings "Change Management" scheduler/publish
// path (see modules/scheduledChanges) — a scheduled backup-schedule change re-runs this exact
// function at apply time.
export async function applyBackupSettings(values: BackupSettingsInput, userId: number) {
  const settings = await prisma.backupSettings.upsert({
    where: { id: 1 },
    update: { ...values, updatedById: userId },
    create: { id: 1, ...values, updatedById: userId },
  });
  await logAudit({ userId, action: "backups.settings_update", entityType: "BackupSettings", entityId: 1, metadata: values as unknown as Record<string, unknown> });
  return settings;
}
