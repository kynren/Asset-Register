import { ChildProcess, spawn } from "child_process";
import { Response } from "express";

const IS_WINDOWS = process.platform === "win32";

/**
 * Spawns the OS ping command and streams each real reply/timeout line to the client as it
 * arrives (Server-Sent Events), rather than waiting for the whole run to finish. Used for the
 * Interactive Ping Console's live "typing" feel with genuine per-packet timing data.
 */
export function streamPing(host: string, count: number | "continuous", res: Response, onDone: () => void): ChildProcess {
  const args = IS_WINDOWS
    ? count === "continuous"
      ? ["-t", host]
      : ["-n", String(count), host]
    : count === "continuous"
      ? [host]
      : ["-c", String(count), host];

  const proc = spawn("ping", args);
  let seq = 0;

  function send(event: Record<string, unknown>) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  let buffer = "";
  proc.stdout?.setEncoding("utf8");
  proc.stdout?.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      const winReply = trimmed.match(/Reply from ([\d.a-fA-F:]+): bytes=(\d+) time[=<](\d+)ms TTL=(\d+)/i);
      const posixReply = trimmed.match(/bytes from ([\d.a-fA-F:]+).*?icmp_seq=(\d+).*?ttl=(\d+).*?time[=<]?([\d.]+)\s*ms/i);
      const isTimeout = /Request timed out|Destination host unreachable|no answer|100% packet loss/i.test(trimmed);

      if (winReply) {
        seq += 1;
        send({ type: "reply", seq, host: winReply[1], bytes: Number(winReply[2]), timeMs: Number(winReply[3]), ttl: Number(winReply[4]), raw: trimmed });
      } else if (posixReply) {
        seq = Number(posixReply[2]);
        send({ type: "reply", seq, host: posixReply[1], timeMs: Number(posixReply[4]), ttl: Number(posixReply[3]), raw: trimmed });
      } else if (isTimeout) {
        seq += 1;
        send({ type: "timeout", seq, raw: trimmed });
      }
    }
  });

  proc.stderr?.setEncoding("utf8");
  proc.stderr?.on("data", (chunk: string) => {
    const trimmed = chunk.trim();
    if (trimmed) send({ type: "error", raw: trimmed });
  });

  proc.once("error", (err: NodeJS.ErrnoException) => {
    send({ type: "error", raw: `Could not start ping: ${err.message}` });
    onDone();
  });

  proc.once("exit", () => {
    send({ type: "done" });
    onDone();
  });

  return proc;
}
