import { prisma } from "../config/prisma";
import { runForEachOrganization } from "../config/controlPlane";
import { encryptSecret } from "./crypto";

// How often the awaiting caller re-checks the job row's status. Short enough to feel responsive
// for on-demand UI actions (toggle a light, open a door, fetch a snapshot), long enough not to
// hammer Postgres while waiting out the relay agent's 3s poll interval.
const AWAIT_POLL_MS = 300;

export interface RelayHttpJobParams {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  digestAuth?: { username: string; password: string };
  timeoutMs: number;
}

export interface RelayHttpJobResult {
  ok: boolean;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBodyBase64?: string;
  errorMessage?: string;
}

export interface RelayPingJobResult {
  ok: boolean;
  alive?: boolean;
  responseTimeMs?: number | null;
  errorMessage?: string;
}

export interface RelayTcpProbeResult {
  ok: boolean;
  reachable?: boolean;
  latencyMs?: number | null;
  protocolConfirmed?: boolean;
  message?: string;
  errorMessage?: string;
}

async function awaitJobCompletion(jobId: number, timeoutMs: number) {
  // Small buffer over the agent-side timeout — the agent itself gives up around `timeoutMs`, so
  // waiting slightly longer here lets its own FAILED submission win the race instead of us
  // reporting a timeout a moment before it would have reported the real error.
  const deadline = Date.now() + timeoutMs + 2000;
  while (Date.now() < deadline) {
    const row = await prisma.relayDeviceJob.findUnique({ where: { id: jobId } });
    if (!row || row.status === "COMPLETED" || row.status === "FAILED") return row;
    await new Promise((resolve) => setTimeout(resolve, AWAIT_POLL_MS));
  }
  return null;
}

export async function enqueueAndAwaitHttp(params: RelayHttpJobParams, priority = 0): Promise<RelayHttpJobResult> {
  const parsed = new URL(params.url);
  const defaultPort = parsed.protocol === "https:" ? 443 : 80;
  const job = await prisma.relayDeviceJob.create({
    data: {
      kind: "HTTP",
      status: "PENDING",
      target: `${parsed.hostname}:${parsed.port || defaultPort}`,
      method: params.method,
      path: parsed.pathname + parsed.search,
      protocolScheme: parsed.protocol.replace(":", ""),
      requestHeaders: params.headers ?? undefined,
      requestBody: params.body ?? undefined,
      digestUsername: params.digestAuth?.username,
      digestPasswordEncrypted: params.digestAuth ? encryptSecret(params.digestAuth.password) : undefined,
      timeoutMs: params.timeoutMs,
      priority,
    },
  });

  const result = await awaitJobCompletion(job.id, params.timeoutMs);
  await prisma.relayDeviceJob.delete({ where: { id: job.id } }).catch(() => undefined);

  if (!result) return { ok: false, errorMessage: "Relay job timed out — the on-prem agent never responded." };
  if (result.status === "FAILED") return { ok: false, errorMessage: result.errorMessage ?? "Relay request failed." };
  return {
    ok: true,
    responseStatus: result.responseStatus ?? undefined,
    responseHeaders: (result.responseHeaders as Record<string, string> | null) ?? undefined,
    responseBodyBase64: result.responseBodyBase64 ?? undefined,
  };
}

export async function enqueueAndAwaitPing(target: string, timeoutMs: number, priority = 0): Promise<RelayPingJobResult> {
  const job = await prisma.relayDeviceJob.create({
    data: { kind: "PING", status: "PENDING", target, timeoutMs, priority },
  });

  const result = await awaitJobCompletion(job.id, timeoutMs);
  await prisma.relayDeviceJob.delete({ where: { id: job.id } }).catch(() => undefined);

  if (!result) return { ok: false, errorMessage: "Relay job timed out." };
  if (result.status === "FAILED") return { ok: false, errorMessage: result.errorMessage ?? undefined };

  try {
    const parsedBody = result.responseBodyBase64 ? JSON.parse(Buffer.from(result.responseBodyBase64, "base64").toString("utf8")) : null;
    return { ok: true, alive: Boolean(parsedBody?.alive), responseTimeMs: parsedBody?.responseTimeMs ?? null };
  } catch {
    return { ok: false, errorMessage: "Malformed ping result from relay agent." };
  }
}

// The relay-executed counterpart to lib/deviceConnection.ts's direct net.Socket test — used by
// the NVR/Camera "Test Connection" button when the on-prem relay agent is the only thing with a
// real route to the device's LAN (see agent/kynren_network_relay.py's TCP_PROBE handling in
// run_device_job()). Reuses the generic target/protocolScheme columns rather than adding
// TCP_PROBE-specific ones — target carries "host:port", protocolScheme optionally carries a
// protocol hint (e.g. "RTSP") the agent uses to decide whether to also send an RTSP OPTIONS probe.
export async function enqueueAndAwaitTcpProbe(host: string, port: number, protocol: string | undefined, timeoutMs: number): Promise<RelayTcpProbeResult> {
  const job = await prisma.relayDeviceJob.create({
    data: { kind: "TCP_PROBE", status: "PENDING", target: `${host}:${port}`, protocolScheme: protocol, timeoutMs },
  });

  const result = await awaitJobCompletion(job.id, timeoutMs);
  await prisma.relayDeviceJob.delete({ where: { id: job.id } }).catch(() => undefined);

  if (!result) return { ok: false, errorMessage: "Relay job timed out — the on-prem agent never responded." };
  if (result.status === "FAILED") return { ok: false, errorMessage: result.errorMessage ?? "Relay TCP probe failed." };

  try {
    const parsedBody = result.responseBodyBase64 ? JSON.parse(Buffer.from(result.responseBodyBase64, "base64").toString("utf8")) : null;
    return {
      ok: true,
      reachable: Boolean(parsedBody?.reachable),
      latencyMs: parsedBody?.latencyMs ?? null,
      protocolConfirmed: Boolean(parsedBody?.protocolConfirmed),
      message: parsedBody?.message,
    };
  } catch {
    return { ok: false, errorMessage: "Malformed TCP probe result from relay agent." };
  }
}

// Safety net for rows abandoned by a crashed/restarted request (the normal path in
// enqueueAndAwaitHttp/enqueueAndAwaitPing already deletes its own row once read) — sweeps every
// organization's schema, same runForEachOrganization pattern every other scheduler in this
// codebase uses.
const CLEANUP_TICK_MS = 5 * 60 * 1000;
const STALE_AFTER_MS = 10 * 60 * 1000;

async function cleanupStaleJobs(): Promise<void> {
  await prisma.relayDeviceJob.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - STALE_AFTER_MS) } } });
}

let cleanupIntervalHandle: NodeJS.Timeout | null = null;

export function startRelayDeviceJobCleanupScheduler() {
  if (cleanupIntervalHandle) return;
  const run = () => {
    runForEachOrganization(cleanupStaleJobs).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Relay device job cleanup failed:", err);
    });
  };
  run();
  cleanupIntervalHandle = setInterval(run, CLEANUP_TICK_MS);
  cleanupIntervalHandle.unref();
}
