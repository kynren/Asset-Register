/**
 * Ticks every minute (same cadence as lightingAutomationScheduler/networkMonitor) and fires the
 * configured backup at most once per matching day, via the same daysOfWeek + timeOfDay +
 * lastRunDate dedup convention used there. OR'd against `lastRunDate: null` deliberately, not
 * `NOT: { lastRunDate: today }` alone — SQL's NULL = anything is unknown rather than true, so a
 * plain not-equal comparison would silently exclude a schedule that has never fired yet.
 */
import { prisma } from "../config/prisma";
import { runForEachOrganization } from "../config/controlPlane";
import { runBackupNow } from "./backupRunner";

async function tick(): Promise<void> {
  const settings = await prisma.backupSettings.findUnique({ where: { id: 1 } });
  if (!settings || !settings.isEnabled) return;

  const now = new Date();
  const dayOfWeek = now.getDay();
  const timeOfDay = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const today = now.toISOString().slice(0, 10);

  const due =
    settings.timeOfDay === timeOfDay &&
    settings.daysOfWeek.includes(dayOfWeek) &&
    (settings.lastRunDate === null || settings.lastRunDate !== today);

  if (!due) return;

  await prisma.backupSettings.update({ where: { id: 1 }, data: { lastRunDate: today } }).catch(() => undefined);
  await runBackupNow("SCHEDULED");
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startBackupScheduler() {
  if (intervalHandle) return;
  const run = () => {
    runForEachOrganization(tick).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Backup scheduler tick failed:", err);
    });
  };
  run();
  intervalHandle = setInterval(run, 60 * 1000);
  intervalHandle.unref();
}
