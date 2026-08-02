import { spawn } from "child_process";
import { prisma } from "../config/prisma";
import { runForEachOrganization } from "../config/controlPlane";
import { verifyEmailTransport } from "./email";
import { isNetworkRelayEnabled } from "../modules/network/scan.service";
import { SystemComponentStatus } from "@prisma/client";

interface CheckResult {
  status: SystemComponentStatus;
  message: string;
}

interface ComponentDef {
  key: string;
  name: string;
  sortOrder: number;
  check: () => Promise<CheckResult>;
}

// The API process running this check is, by definition, up — this exists so the status page has
// a first row confirming the server itself is alive, same as any real status page's "API" entry.
async function checkApi(): Promise<CheckResult> {
  return { status: "OPERATIONAL", message: "API server is responding." };
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "OPERATIONAL", message: "Database connection healthy." };
  } catch (err) {
    return { status: "OUTAGE", message: err instanceof Error ? err.message : "Database query failed." };
  }
}

async function checkEmail(): Promise<CheckResult> {
  const result = await verifyEmailTransport();
  if (!result.configured) return { status: "DEGRADED", message: "SMTP not configured — emails are logged to the server console instead of sent." };
  if (result.ok) return { status: "OPERATIONAL", message: "SMTP connection verified." };
  return { status: "OUTAGE", message: `SMTP configured but unreachable: ${result.error}` };
}

// Confirms the ffmpeg binary the NVR/camera live-view relay and recording pipeline both shell out
// to (see lib/streamRelay.ts, lib/recording.ts) is actually present and runnable on this host.
function checkNvrRelay(): Promise<CheckResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: CheckResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      const proc = spawn("ffmpeg", ["-version"], { stdio: ["ignore", "ignore", "ignore"] });
      const timeout = setTimeout(() => {
        proc.kill();
        finish({ status: "OUTAGE", message: "ffmpeg did not respond within 5s." });
      }, 5000);
      proc.on("error", () => {
        clearTimeout(timeout);
        finish({ status: "OUTAGE", message: "ffmpeg binary not found on this server." });
      });
      proc.on("exit", (code) => {
        clearTimeout(timeout);
        finish(code === 0 ? { status: "OPERATIONAL", message: "ffmpeg available." } : { status: "OUTAGE", message: `ffmpeg exited with code ${code}.` });
      });
    } catch (err) {
      finish({ status: "OUTAGE", message: err instanceof Error ? err.message : "Could not spawn ffmpeg." });
    }
  });
}

async function checkNetworkMonitor(): Promise<CheckResult> {
  const settings = await prisma.networkMonitorSettings.findUnique({ where: { id: 1 } });
  if (!settings || !settings.enabled) return { status: "OPERATIONAL", message: "Continuous monitoring is disabled in Network Topology Map settings." };
  if (!settings.lastRunAt) return { status: "DEGRADED", message: "Monitoring is enabled but hasn't completed a scan cycle yet." };

  const staleAfterMs = settings.intervalMinutes * 60 * 1000 * 3; // allow 3x the configured interval before flagging
  const isStale = Date.now() - settings.lastRunAt.getTime() > staleAfterMs;
  return isStale
    ? { status: "DEGRADED", message: `Last scan ran at ${settings.lastRunAt.toISOString()}, expected every ${settings.intervalMinutes} minute(s).` }
    : { status: "OPERATIONAL", message: `Last scan completed at ${settings.lastRunAt.toISOString()}.` };
}

// Reports whether an on-prem agent (the device agent or the network relay/"server" agent — both
// share the same AgentApiKey, see middleware/agentAuth.ts) has actually called in recently. The
// relay agent polls every 3s while it's running (kynren_network_relay.py's
// POLL_INTERVAL_SECONDS), so once it's enabled, silence beyond a generous multiple of that is a
// real "it stopped" signal rather than just landing between polls.
async function checkAgentConnectivity(): Promise<CheckResult> {
  const anyKeyConfigured = (await prisma.agentApiKey.count()) > 0;
  if (!anyKeyConfigured) return { status: "OPERATIONAL", message: "No agent API key configured — device/relay agents aren't in use." };

  const mostRecent = await prisma.agentApiKey.findFirst({
    where: { lastUsedAt: { not: null } },
    orderBy: { lastUsedAt: "desc" },
  });
  if (!mostRecent?.lastUsedAt) return { status: "DEGRADED", message: "Agent key(s) configured but no agent has connected yet." };

  const secondsAgo = Math.round((Date.now() - mostRecent.lastUsedAt.getTime()) / 1000);
  const relayEnabled = await isNetworkRelayEnabled();
  if (!relayEnabled) return { status: "OPERATIONAL", message: `Last agent contact ${secondsAgo}s ago.` };

  const STALE_AFTER_SECONDS = 30; // relay polls every ~3s — 10x that is a generous buffer
  return secondsAgo > STALE_AFTER_SECONDS
    ? { status: "DEGRADED", message: `Relay agent is enabled but hasn't polled in ${secondsAgo}s (expected every ~3s).` }
    : { status: "OPERATIONAL", message: `Relay agent last polled ${secondsAgo}s ago.` };
}

const COMPONENTS: ComponentDef[] = [
  { key: "api", name: "API Server", sortOrder: 1, check: checkApi },
  { key: "database", name: "Database", sortOrder: 2, check: checkDatabase },
  { key: "email", name: "Email Notifications", sortOrder: 3, check: checkEmail },
  { key: "nvr-relay", name: "NVR / Camera Relay", sortOrder: 4, check: checkNvrRelay },
  { key: "network-monitor", name: "Network Monitor", sortOrder: 5, check: checkNetworkMonitor },
  { key: "agent-connectivity", name: "Device / Relay Agent", sortOrder: 6, check: checkAgentConnectivity },
];

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const STATUS_RANK: Record<SystemComponentStatus, number> = { OPERATIONAL: 0, DEGRADED: 1, OUTAGE: 2 };

function worseOf(a: SystemComponentStatus, b: SystemComponentStatus): SystemComponentStatus {
  return STATUS_RANK[b] > STATUS_RANK[a] ? b : a;
}

/**
 * Runs every registered component's health check once and folds the result into today's
 * (UTC) SystemComponentDailyStatus row for that component — creating the component and/or
 * today's row on first run. A day's status is the worst single check result seen that day,
 * same convention real status pages use ("a 2-minute blip still marks the whole day degraded").
 */
export async function runSystemStatusCheck(): Promise<void> {
  const today = startOfUtcDay(new Date());

  for (const def of COMPONENTS) {
    let result: CheckResult;
    try {
      result = await def.check();
    } catch (err) {
      result = { status: "OUTAGE", message: err instanceof Error ? err.message : "Health check failed unexpectedly." };
    }

    const component = await prisma.systemComponent.upsert({
      where: { key: def.key },
      update: { name: def.name, sortOrder: def.sortOrder },
      create: { key: def.key, name: def.name, sortOrder: def.sortOrder },
    });

    const existing = await prisma.systemComponentDailyStatus.findUnique({
      where: { componentId_date: { componentId: component.id, date: today } },
    });

    await prisma.systemComponentDailyStatus.upsert({
      where: { componentId_date: { componentId: component.id, date: today } },
      update: {
        status: existing ? worseOf(existing.status, result.status) : result.status,
        checksOk: { increment: result.status === "OPERATIONAL" ? 1 : 0 },
        checksTotal: { increment: 1 },
        lastMessage: result.message,
      },
      create: {
        componentId: component.id,
        date: today,
        status: result.status,
        checksOk: result.status === "OPERATIONAL" ? 1 : 0,
        checksTotal: 1,
        lastMessage: result.message,
      },
    });
  }
}

// Wall-clock tick — actual check cadence is gated by SystemStatusSettings.checkIntervalMinutes
// (default 60, admin-configurable per organization via PUT /system/status/settings), same
// dueAt-against-lastRunAt pattern networkMonitor.ts uses for NetworkMonitorSettings.intervalMinutes.
const TICK_MS = 60 * 1000;

async function tick(): Promise<void> {
  const settings = await prisma.systemStatusSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  const dueAt = settings.lastRunAt ? settings.lastRunAt.getTime() + settings.checkIntervalMinutes * 60 * 1000 : 0;
  if (Date.now() < dueAt) return;

  await runSystemStatusCheck();
  await prisma.systemStatusSettings.update({ where: { id: 1 }, data: { lastRunAt: new Date() } });
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startSystemStatusScheduler() {
  if (intervalHandle) return;
  const run = () => {
    runForEachOrganization(tick).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("System status check failed:", err);
    });
  };
  run();
  intervalHandle = setInterval(run, TICK_MS);
  intervalHandle.unref();
}
