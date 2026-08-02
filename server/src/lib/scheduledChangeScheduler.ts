/**
 * Ticks every minute (same cadence as backupScheduler/lightingAutomationScheduler) and applies
 * every PENDING ScheduledChange whose scheduledFor time has passed. applyScheduledChange() never
 * throws — a bad change is marked FAILED and logged, not allowed to abort the tick for the rest of
 * this organization's due changes or for any other organization.
 */
import { prisma } from "../config/prisma";
import { runForEachOrganization } from "../config/controlPlane";
import { applyScheduledChange } from "../modules/scheduledChanges/scheduledChanges.service";

async function tick(): Promise<void> {
  const due = await prisma.scheduledChange.findMany({
    where: { status: "PENDING", scheduledFor: { lte: new Date() } },
  });

  for (const change of due) {
    try {
      await applyScheduledChange(change);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Scheduled change ${change.id} failed unexpectedly:`, err);
    }
  }
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startScheduledChangeScheduler() {
  if (intervalHandle) return;
  const run = () => {
    runForEachOrganization(tick).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Scheduled change tick failed:", err);
    });
  };
  run();
  intervalHandle = setInterval(run, 60 * 1000);
  intervalHandle.unref();
}
