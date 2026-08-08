import { axiosClient } from "../../api/axiosClient";

// Mirrors client/src/lib/pingSession.ts's module-level singleton so navigating away from the
// Pinger screen mid-run doesn't abort it (matches the web fix noted there). React Native's fetch
// doesn't expose a readable response-body stream the way web's does, so this can't reuse the
// server's GET /network/ping-stream SSE endpoint — instead it drives the same visual "live console"
// effect by calling the plain POST /network/ping (single ping, JSON response) in a loop, spaced out
// on a timer, which is the one-shot endpoint the SSE route itself already relay-proxies through.
export interface ConsoleLine {
  id: number;
  kind: "reply" | "timeout" | "error" | "info";
  text: string;
}

export interface PingSessionState {
  host: string;
  count: number | "continuous";
  running: boolean;
  lines: ConsoleLine[];
}

let state: PingSessionState = { host: "", count: 4, running: false, lines: [] };
let stopped = true;
let lineIdCounter = 0;
const listeners = new Set<() => void>();

function setState(partial: Partial<PingSessionState>) {
  state = { ...state, ...partial };
  listeners.forEach((listener) => listener());
}

export function subscribePingSession(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getPingSessionSnapshot(): PingSessionState {
  return state;
}

function appendLine(kind: ConsoleLine["kind"], text: string) {
  lineIdCounter += 1;
  setState({ lines: [...state.lines.slice(-200), { id: lineIdCounter, kind, text }] });
}

export function setPingHost(host: string) {
  if (!state.running) setState({ host });
}

export function setPingCount(count: number | "continuous") {
  if (!state.running) setState({ count });
}

export function hydratePingHostIfEmpty(host: string) {
  if (!state.host && host) setState({ host });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startPingSession(host: string, count: number | "continuous") {
  if (!host.trim()) return;
  stopped = false;
  setState({ host, count, running: true, lines: [] });
  appendLine("info", `Pinging ${host} ${count === "continuous" ? "continuously" : `with ${count} packet(s)`}...`);

  let sent = 0;
  const target = count === "continuous" ? Infinity : count;
  while (!stopped && sent < target) {
    try {
      const res = await axiosClient.post("/network/ping", { ipAddress: host.trim() });
      const { alive, responseTimeMs, ttl } = res.data as { alive: boolean; responseTimeMs: number | null; ttl: number | null };
      if (alive) appendLine("reply", `Reply from ${host}: time=${responseTimeMs}ms${ttl ? ` TTL=${ttl}` : ""}`);
      else appendLine("timeout", "Request timed out.");
    } catch {
      if (stopped) break;
      appendLine("error", "Ping request failed.");
    }
    sent += 1;
    if (stopped || sent >= target) break;
    await delay(900);
  }

  if (!stopped) appendLine("info", "Ping sequence complete.");
  setState({ running: false });
}

export function stopPingSession() {
  stopped = true;
  setState({ running: false });
  appendLine("info", "Stopped by user.");
}
