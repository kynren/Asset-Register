import { ChildProcessByStdio, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { prisma } from "../config/prisma";
import { runForEachOrganization } from "../config/controlPlane";
import { isNetworkRelayEnabled } from "../modules/network/scan.service";
import { enqueueVideoJob, requestStop } from "./relayVideoJobs";

export const RECORDING_ROOT = path.join(__dirname, "..", "..", "uploads", "recordings");
fs.mkdirSync(RECORDING_ROOT, { recursive: true });

interface ActiveRecording {
  recordingId: number;
  cameraId: number;
  process: ChildProcessByStdio<null, null, Readable> | null;
  filePath: string;
  stderrTail: string;
  failed: boolean;
  failMessage: string | null;
  // True when an on-prem relay agent owns the ffmpeg process and uploads the finished .mp4 to
  // `filePath` in one shot once it stops — see relay.routes.ts's /video-jobs/:id/segment.
  relayBacked: boolean;
}

const active = new Map<number, ActiveRecording>();

/**
 * Spawns ffmpeg to record an RTSP stream to disk and creates a real CameraRecording row up
 * front. If ffmpeg isn't installed or the stream is unreachable, the recording is marked
 * failed with the real error rather than pretending footage was captured — same honest-failure
 * pattern as the live HLS relay in streamRelay.ts.
 */
export async function startRecording(cameraId: number, streamUrl: string, trigger: string): Promise<{ recordingId: number }> {
  if (active.has(cameraId)) {
    throw new Error("A recording is already in progress for this camera.");
  }

  const dir = path.join(RECORDING_ROOT, String(cameraId));
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`;
  const filePath = path.join(dir, fileName);

  const recording = await prisma.cameraRecording.create({
    data: { cameraId, filePath: path.relative(RECORDING_ROOT, filePath), startedAt: new Date(), trigger },
  });

  const relayBacked = await isNetworkRelayEnabled();
  const entry: ActiveRecording = { recordingId: recording.id, cameraId, process: null, filePath, stderrTail: "", failed: false, failMessage: null, relayBacked };
  active.set(cameraId, entry);

  if (relayBacked) {
    // Recording id doubles as the relay video job id — the agent uploads the finished .mp4 to
    // /video-jobs/<recordingId>/segment, which resolves this same CameraRecording row to learn
    // where on disk it belongs (see relay.routes.ts's resolveVideoJobForUpload).
    await enqueueVideoJob(String(recording.id), "RECORDING", streamUrl);
    return { recordingId: recording.id };
  }

  const args = ["-rtsp_transport", "tcp", "-timeout", "5000000", "-i", streamUrl, "-c", "copy", "-f", "mp4", "-movflags", "frag_keyframe+empty_moov", filePath];
  const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  entry.process = proc;

  proc.stderr.on("data", (chunk: Buffer) => {
    entry.stderrTail = (entry.stderrTail + chunk.toString("utf8")).slice(-2000);
  });

  proc.once("error", (err: NodeJS.ErrnoException) => {
    entry.failed = true;
    entry.failMessage =
      err.code === "ENOENT" ? "ffmpeg is not installed on this server. Recording requires ffmpeg to be available on PATH." : `ffmpeg failed to start: ${err.message}`;
  });

  proc.once("exit", (code) => {
    if (code !== 0 && code !== null) {
      entry.failed = true;
      entry.failMessage = entry.failMessage ?? `ffmpeg exited unexpectedly (code ${code}). ${entry.stderrTail.trim().split("\n").slice(-2).join(" ")}`.trim();
    }
  });

  return { recordingId: recording.id };
}

export function getActiveRecording(cameraId: number): { recordingId: number; failed: boolean; failMessage: string | null } | null {
  const entry = active.get(cameraId);
  if (!entry) return null;
  return { recordingId: entry.recordingId, failed: entry.failed, failMessage: entry.failMessage };
}

export async function stopRecording(cameraId: number): Promise<{ recordingId: number; failed: boolean; failMessage: string | null } | null> {
  const entry = active.get(cameraId);
  if (!entry) return null;
  active.delete(cameraId);

  if (entry.relayBacked) {
    await requestStop(String(entry.recordingId));
  } else {
    entry.process?.kill("SIGTERM");
  }

  let sizeBytes: number | undefined;
  try {
    sizeBytes = fs.statSync(entry.filePath).size;
  } catch {
    sizeBytes = undefined;
  }

  await prisma.cameraRecording.update({
    where: { id: entry.recordingId },
    data: { endedAt: new Date(), sizeBytes },
  });

  return { recordingId: entry.recordingId, failed: entry.failed, failMessage: entry.failMessage };
}

async function getRetentionDays(): Promise<number> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "cameraRetentionDays" } });
  const parsed = setting ? Number(setting.value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

/**
 * Deletes CameraRecording rows (and their files, if present) older than the configured
 * retention window. Real deletion of real rows/files — no simulated cleanup counters.
 */
export async function runRetentionSweep(): Promise<{ deleted: number; retentionDays: number }> {
  const retentionDays = await getRetentionDays();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const expired = await prisma.cameraRecording.findMany({ where: { startedAt: { lt: cutoff } } });

  for (const rec of expired) {
    const absolutePath = path.join(RECORDING_ROOT, rec.filePath);
    fs.rm(absolutePath, { force: true }, () => undefined);
  }

  if (expired.length > 0) {
    await prisma.cameraRecording.deleteMany({ where: { id: { in: expired.map((r) => r.id) } } });
  }

  return { deleted: expired.length, retentionDays };
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startRetentionScheduler(intervalHours = 24) {
  if (intervalHandle) return;
  const run = () => {
    runForEachOrganization(runRetentionSweep).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Camera recording retention sweep failed:", err);
    });
  };
  run();
  intervalHandle = setInterval(run, intervalHours * 60 * 60 * 1000);
  intervalHandle.unref();
}
