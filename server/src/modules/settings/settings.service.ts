import { prisma } from "../../config/prisma";
import { logAudit } from "../../lib/auditLogger";

// Shared by the direct-save route below AND the App Settings "Change Management" scheduler/publish
// path (see modules/scheduledChanges) — a scheduled system-settings change re-runs this exact
// function at apply time.
export async function applySystemSettings(values: Record<string, string>, userId: number): Promise<void> {
  await prisma.$transaction(
    Object.entries(values).map(([key, value]) =>
      prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
    )
  );
  await logAudit({ userId, action: "settings.update", metadata: values });
}
