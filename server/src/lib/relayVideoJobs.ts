import { prisma } from "../config/prisma";
import { runForEachOrganization } from "../config/controlPlane";

// Long-running counterpart to relayDeviceJobs.ts's PING/HTTP job queue. A video job (live HLS
// relay or a camera recording) runs for minutes-to-hours instead of completing in one request/
// response round trip, so it's tracked as its own row with a state machine
// (PENDING -> RUNNING -> STOPPING -> STOPPED/FAILED) rather than awaited synchronously. The id is
// always the same id streamRelay.ts/recording.ts already use as the session id / recording id, so
// callers never need a separate lookup table to connect a job back to where its uploaded
// segments/file belong on disk (see relay.routes.ts's /video-jobs/:id/segment).

export async function enqueueVideoJob(id: string, kind: "LIVE" | "RECORDING", streamUrl: string): Promise<void> {
  await prisma.relayVideoJob.create({ data: { id, kind, streamUrl, status: "PENDING" } });
}

// Callable whether or not the agent has claimed the job yet — PENDING moves straight to STOPPING
// too, so a job cancelled before an agent ever picks it up still won't be claimed and started.
export async function requestStop(id: string): Promise<void> {
  await prisma.relayVideoJob.updateMany({ where: { id, status: { in: ["PENDING", "RUNNING"] } }, data: { status: "STOPPING" } });
}

export async function getVideoJobStatus(id: string): Promise<{ status: string; errorMessage: string | null } | null> {
  const job = await prisma.relayVideoJob.findUnique({ where: { id }, select: { status: true, errorMessage: true } });
  return job ?? null;
}

// Safety net for jobs an agent claimed but then vanished before ever completing (crash, network
// loss) — without this a STOPPING/RUNNING row could sit forever, wedging isSessionRelayBacked-type
// callers that poll for a terminal state. Mirrors relayDeviceJobs.ts's stale-job sweep.
const CLEANUP_TICK_MS = 5 * 60 * 1000;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export async function cleanupStaleVideoJobs(): Promise<void> {
  await prisma.relayVideoJob.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - STALE_AFTER_MS) } } });
}

let cleanupIntervalHandle: NodeJS.Timeout | null = null;

export function startRelayVideoJobCleanupScheduler() {
  if (cleanupIntervalHandle) return;
  const run = () => {
    runForEachOrganization(cleanupStaleVideoJobs).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Relay video job cleanup failed:", err);
    });
  };
  run();
  cleanupIntervalHandle = setInterval(run, CLEANUP_TICK_MS);
  cleanupIntervalHandle.unref();
}
