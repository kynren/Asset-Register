import { prisma } from "../config/prisma";
import { cleanupDump, deliverToDestination, runPgDump } from "./backupService";

// Orchestrates one full backup attempt: pg_dump once, then deliver the same file to every
// enabled destination independently, recording a BackupRun (+ one BackupRunDestination per
// destination) so there's a real audit trail of what happened — not just "did the last one work".
export async function runBackupNow(trigger: "SCHEDULED" | "MANUAL"): Promise<void> {
  const run = await prisma.backupRun.create({ data: { trigger, status: "RUNNING" } });

  const dump = await runPgDump();
  if (!dump.ok || !dump.filePath || !dump.fileName || dump.sizeBytes === undefined) {
    await prisma.backupRun.update({
      where: { id: run.id },
      data: { status: "FAILED", message: dump.error ?? "pg_dump failed for an unknown reason.", finishedAt: new Date() },
    });
    return;
  }

  try {
    const destinations = await prisma.backupDestination.findMany({ where: { isEnabled: true } });

    if (destinations.length === 0) {
      await prisma.backupRun.update({
        where: { id: run.id },
        data: { status: "FAILED", fileSizeBytes: dump.sizeBytes, message: "Backup produced but no enabled destinations to deliver it to.", finishedAt: new Date() },
      });
      return;
    }

    let succeeded = 0;
    for (const destination of destinations) {
      const result = await deliverToDestination(destination, dump.filePath, { fileName: dump.fileName, sizeBytes: dump.sizeBytes });
      if (result.ok) succeeded++;
      await prisma.backupRunDestination.create({
        data: {
          runId: run.id,
          destinationId: destination.id,
          destinationName: destination.name,
          destinationType: destination.type,
          ok: result.ok,
          message: result.message,
        },
      });
    }

    const status = succeeded === destinations.length ? "SUCCESS" : succeeded > 0 ? "PARTIAL" : "FAILED";
    await prisma.backupRun.update({
      where: { id: run.id },
      data: { status, fileSizeBytes: dump.sizeBytes, finishedAt: new Date() },
    });
  } finally {
    await cleanupDump(dump.filePath);
  }
}
