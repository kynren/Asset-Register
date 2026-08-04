import { ChildProcessByStdio, spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { isNetworkRelayEnabled } from "../modules/network/scan.service";
import { enqueueVideoJob, getVideoJobStatus, requestStop } from "./relayVideoJobs";

export const SESSION_ROOT = path.join(__dirname, "..", "..", "uploads", "stream-sessions");
fs.mkdirSync(SESSION_ROOT, { recursive: true });

type SessionStatus = "starting" | "ready" | "failed";

interface StreamSession {
  id: string;
  streamUrl: string;
  process: ChildProcessByStdio<null, null, Readable> | null;
  dir: string;
  status: SessionStatus;
  error: string | null;
  stderrTail: string;
  lastAccessedAt: number;
  createdAt: number;
  // True when an on-prem relay agent (not this process) owns the ffmpeg process and is uploading
  // HLS segments into `dir` over HTTP — see relay.routes.ts's /video-jobs/:id/segment. Everything
  // that reads from `dir` (getSessionStatus/getSessionFilePath) is unaffected either way; only
  // startup and teardown differ.
  relayBacked: boolean;
}

const sessions = new Map<string, StreamSession>();

// A live view is meant to run continuously for as long as it's actually being watched —
// IDLE_TIMEOUT_MS (reset on every playlist/segment/status request) is what reaps a session
// once the viewer navigates away. MAX_SESSION_AGE_MS is only a backstop against a runaway
// ffmpeg process outliving a session nobody is polling anymore; it's generous on purpose so
// it never interrupts an actively-watched stream.
const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_SESSION_AGE_MS = 12 * 60 * 60 * 1000;

function sweepIdleSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastAccessedAt > IDLE_TIMEOUT_MS || now - session.createdAt > MAX_SESSION_AGE_MS) {
      stopSession(id);
    }
  }
}
setInterval(sweepIdleSessions, 30_000).unref();

/**
 * Starts an HLS relay session for browser playback of an RTSP stream. If the on-prem Network
 * Relay Agent is enabled, the actual ffmpeg process runs on the agent's machine (the one that can
 * actually reach the camera's LAN) and uploads segments here; otherwise ffmpeg is spawned locally
 * exactly as before, and if ffmpeg isn't installed the session is marked "failed" with a clear
 * message rather than pretending to produce video.
 */
export async function startStreamSession(streamUrl: string): Promise<string> {
  const id = crypto.randomUUID();
  const dir = path.join(SESSION_ROOT, id);
  fs.mkdirSync(dir, { recursive: true });

  const relayBacked = await isNetworkRelayEnabled();

  const session: StreamSession = {
    id,
    streamUrl,
    process: null,
    dir,
    status: "starting",
    error: null,
    stderrTail: "",
    lastAccessedAt: Date.now(),
    createdAt: Date.now(),
    relayBacked,
  };
  sessions.set(id, session);

  if (relayBacked) {
    await enqueueVideoJob(id, "LIVE", streamUrl);
    return id;
  }

  const playlistPath = path.join(dir, "playlist.m3u8");
  const args = [
    "-rtsp_transport", "tcp",
    "-timeout", "5000000",
    "-i", streamUrl,
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-f", "hls",
    "-hls_time", "2",
    "-hls_list_size", "4",
    "-hls_flags", "delete_segments",
    playlistPath,
  ];

  const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  session.process = proc;

  proc.stderr.on("data", (chunk: Buffer) => {
    session.stderrTail = (session.stderrTail + chunk.toString("utf8")).slice(-2000);
  });

  proc.once("error", (err: NodeJS.ErrnoException) => {
    session.status = "failed";
    session.error =
      err.code === "ENOENT"
        ? "ffmpeg is not installed on this server. Live playback requires ffmpeg to be available on PATH."
        : `ffmpeg failed to start: ${err.message}`;
  });

  proc.once("exit", (code) => {
    clearTimeout(connectTimeout);
    if (session.status !== "ready" && code !== 0) {
      session.status = "failed";
      session.error = session.error ?? `ffmpeg exited unexpectedly (code ${code}). ${session.stderrTail.trim().split("\n").slice(-2).join(" ")}`.trim();
    }
  });

  // ffmpeg's own `-timeout` only bounds I/O stalls *after* the RTSP socket connects — when a
  // camera IP is unreachable (dropped packets, no RST/ICMP reply, wrong subnet) the initial TCP
  // connect() itself can hang for the OS's default connect timeout (tens of seconds on Windows),
  // well past what a "why won't this camera connect" click deserves to wait, and without ever
  // triggering the exit handler above. This watchdog kills a still-"starting" process after 15s
  // and reports a clear, specific reason instead of leaving the client to time out at 35s with
  // no explanation.
  const connectTimeout = setTimeout(() => {
    if (session.status === "starting") {
      session.status = "failed";
      session.error = "Could not connect to the camera within 15 seconds. Check that the stream URL is correct and that this server has network access to the camera (use the Network Relay Agent if the camera is on a different network).";
      proc.kill("SIGKILL");
    }
  }, 15000);

  return id;
}

export async function getSessionStatus(id: string): Promise<{ status: SessionStatus | "not_found"; error: string | null }> {
  const session = sessions.get(id);
  if (!session) return { status: "not_found", error: "Stream session not found or has expired." };

  session.lastAccessedAt = Date.now();

  if (session.status === "starting") {
    const playlistPath = path.join(session.dir, "playlist.m3u8");
    try {
      if (fs.existsSync(playlistPath) && fs.readFileSync(playlistPath, "utf8").includes(".ts")) {
        session.status = "ready";
      }
    } catch {
      // playlist may be mid-write; treat as still starting
    }
  }

  // Relay-backed sessions have no local process to report failure — the agent posts it into the
  // RelayVideoJob row instead (no agent ever claiming the job counts too, since it just never
  // leaves PENDING/RUNNING). Without this check a failed relay job left the session stuck in
  // "starting" forever with no error, so the client only ever saw its own generic 35s timeout
  // message instead of the real reason (e.g. "no relay agent connected", ffmpeg failure on the
  // agent's machine).
  if (session.status === "starting" && session.relayBacked) {
    const job = await getVideoJobStatus(id);
    if (job?.status === "FAILED") {
      session.status = "failed";
      session.error = job.errorMessage ?? "Live feed failed on the relay agent.";
    } else if (!job) {
      session.status = "failed";
      session.error = "Relay video job not found — it may have been cleaned up.";
    }
  }

  return { status: session.status, error: session.error };
}

export function getSessionFilePath(id: string, file: string): string | null {
  const session = sessions.get(id);
  if (!session) return null;
  session.lastAccessedAt = Date.now();
  return path.join(session.dir, file);
}

export function stopSession(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  if (session.relayBacked) {
    requestStop(id).catch(() => undefined);
  } else {
    session.process?.kill("SIGKILL");
  }
  fs.rm(session.dir, { recursive: true, force: true }, () => undefined);
}
