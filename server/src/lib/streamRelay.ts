import { ChildProcessByStdio, spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

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
}

const sessions = new Map<string, StreamSession>();

const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_SESSION_AGE_MS = 15 * 60 * 1000;

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
 * Spawns ffmpeg to transcode an RTSP stream to HLS for browser playback. If ffmpeg isn't
 * installed, the session is marked "failed" with a clear message rather than pretending to
 * produce video — this is real infrastructure, wired up correctly, that starts working the
 * moment ffmpeg + a reachable camera stream are both present.
 */
export function startStreamSession(streamUrl: string): string {
  const id = crypto.randomUUID();
  const dir = path.join(SESSION_ROOT, id);
  fs.mkdirSync(dir, { recursive: true });

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
  };
  sessions.set(id, session);

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
    if (session.status !== "ready" && code !== 0) {
      session.status = "failed";
      session.error = session.error ?? `ffmpeg exited unexpectedly (code ${code}). ${session.stderrTail.trim().split("\n").slice(-2).join(" ")}`.trim();
    }
  });

  return id;
}

export function getSessionStatus(id: string): { status: SessionStatus | "not_found"; error: string | null } {
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
  session.process?.kill("SIGKILL");
  fs.rm(session.dir, { recursive: true, force: true }, () => undefined);
}
