/**
 * Recurring on/off schedule for Lighting — "Mon-Fri at 18:00, turn on Porch Light". Ticks every
 * minute (same cadence networkMonitor.ts uses for its own admin-configurable interval), matches
 * automations whose daysOfWeek includes today and whose timeOfDay equals the current HH:mm, and
 * fires each one at most once per day via the lastRunDate dedup key — a minute-granularity tick
 * would otherwise re-fire an automation on every tick during its matching minute.
 */
import { prisma } from "../config/prisma";
import { detectIotDevice, getIotStatus, IotDeviceLike, needsDetection, setIotBrightness, setIotPower } from "./iotDeviceApi";
import { notifyUsers, getUserIdsWithPermission } from "./notify";

interface ActionSummary {
  succeeded: number;
  failed: number;
  errors: string[];
}

function toIotDevice(device: {
  protocol: any;
  ipAddress: string | null;
  port: number | null;
  gen: number | null;
  kind: any;
  channel: number;
  onUrl: string | null;
  offUrl: string | null;
  statusUrl: string | null;
  statusOnPath: string | null;
}): IotDeviceLike {
  return {
    protocol: device.protocol,
    ipAddress: device.ipAddress,
    port: device.port,
    gen: device.gen,
    kind: device.kind,
    channel: device.channel,
    onUrl: device.onUrl,
    offUrl: device.offUrl,
    statusUrl: device.statusUrl,
    statusOnPath: device.statusOnPath,
  };
}

// Shared by Scene activation and DEVICE-type Automations — both apply the same {deviceId, turnOn,
// brightness} shape across one or more devices, best-effort per device so one unreachable light
// doesn't stop the rest of the set (or the automation tick loop) from running.
async function applyDeviceActions(actions: { deviceId: number; turnOn: boolean; brightness: number | null }[]): Promise<ActionSummary> {
  const summary: ActionSummary = { succeeded: 0, failed: 0, errors: [] };
  for (const action of actions) {
    const device = await prisma.lightingDevice.findUnique({ where: { id: action.deviceId } });
    if (!device) continue;
    let gen = device.gen;
    let kind = device.kind;
    try {
      if (needsDetection(device.protocol, gen, kind)) {
        const detected = await detectIotDevice(toIotDevice(device));
        gen = detected.gen;
        kind = detected.kind;
      }
      await setIotPower(toIotDevice({ ...device, gen, kind }), action.turnOn);
      if (action.turnOn && action.brightness !== null && device.kind === "LIGHT") {
        await setIotBrightness(toIotDevice({ ...device, gen, kind }), action.brightness);
      }
      const status = await getIotStatus(toIotDevice({ ...device, gen, kind })).catch(() => null);
      await prisma.lightingDevice.update({
        where: { id: device.id },
        data: { gen, kind, ...(status ? { status: "ONLINE", isOn: status.on, brightness: status.brightness, powerW: status.powerW } : {}), lastCheckedAt: new Date() },
      });
      summary.succeeded++;
    } catch (err) {
      // Best-effort per device (see comment above) — but still logged, otherwise a command that
      // never reached a device (wrong IP, device offline, detection failure) leaves no trace
      // anywhere and looks identical to the automation silently doing nothing.
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(`Lighting automation: command to device ${device.id} ("${device.name}") failed:`, message);
      await prisma.lightingDevice.update({ where: { id: device.id }, data: { status: "OFFLINE", lastCheckedAt: new Date() } }).catch(() => undefined);
      summary.failed++;
      summary.errors.push(`${device.name}: ${message}`);
    }
  }
  return summary;
}

async function applySceneAction(sceneId: number): Promise<ActionSummary> {
  const scene = await prisma.lightingScene.findUnique({ where: { id: sceneId }, include: { actions: true } });
  if (!scene) return { succeeded: 0, failed: 0, errors: [] };
  return applyDeviceActions(scene.actions);
}

async function runAutomationTick(): Promise<void> {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun..6=Sat, matches LightingAutomation.daysOfWeek
  const timeOfDay = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const today = now.toISOString().slice(0, 10);

  // OR'd against `lastRunDate: null` deliberately, not `NOT: { lastRunDate: today }` alone — SQL's
  // NULL = anything is unknown rather than true, so a plain not-equal comparison silently excludes
  // rows where lastRunDate is still null, which is every automation that has never fired yet. That
  // meant brand-new automations could match every other condition and still never actually trigger.
  const due = await prisma.lightingAutomation.findMany({
    where: {
      isEnabled: true,
      timeOfDay,
      daysOfWeek: { has: dayOfWeek },
      OR: [{ lastRunDate: null }, { lastRunDate: { not: today } }],
    },
    include: { actions: true },
  });

  // Temporary diagnostic — this tick runs every 60s regardless of whether anything matches, but
  // previously logged nothing on a no-op pass, making it impossible to tell "not ticking" apart
  // from "ticking but nothing due" from the outside. Remove once the current triage is resolved.
  // eslint-disable-next-line no-console
  console.log(`[lighting-scheduler] tick at ${now.toISOString()} (dayOfWeek=${dayOfWeek}, timeOfDay=${timeOfDay}) — due=${due.length}`);

  for (const automation of due) {
    await notifyAutomationStart(automation.name);
    let summary: ActionSummary = { succeeded: 0, failed: 0, errors: [] };
    try {
      if (automation.actionType === "DEVICE" && automation.actions.length > 0) {
        summary = await applyDeviceActions(automation.actions);
      } else if (automation.actionType === "SCENE" && automation.targetSceneId !== null) {
        summary = await applySceneAction(automation.targetSceneId);
      }
    } catch (err) {
      summary.errors.push(err instanceof Error ? err.message : String(err));
      // eslint-disable-next-line no-console
      console.error(`Lighting automation ${automation.id} ("${automation.name}") failed:`, err);
    } finally {
      await prisma.lightingAutomation.update({ where: { id: automation.id }, data: { lastRunDate: today } }).catch(() => undefined);
      await recordAutomationRun(automation.id, automation.name, "ON", summary);
    }
  }

  // Paired "off" trigger — DEVICE automations only, turns every action device off regardless of
  // how it was configured for the on-leg (brightness doesn't apply to an off state).
  const dueOff = await prisma.lightingAutomation.findMany({
    where: {
      isEnabled: true,
      actionType: "DEVICE",
      offTimeOfDay: timeOfDay,
      daysOfWeek: { has: dayOfWeek },
      OR: [{ lastRunDateOff: null }, { lastRunDateOff: { not: today } }],
    },
    include: { actions: true },
  });

  for (const automation of dueOff) {
    await notifyAutomationStart(automation.name);
    let summary: ActionSummary = { succeeded: 0, failed: 0, errors: [] };
    try {
      summary = await applyDeviceActions(automation.actions.map((a) => ({ deviceId: a.deviceId, turnOn: false, brightness: null })));
    } catch (err) {
      summary.errors.push(err instanceof Error ? err.message : String(err));
      // eslint-disable-next-line no-console
      console.error(`Lighting automation ${automation.id} ("${automation.name}") off-trigger failed:`, err);
    } finally {
      await prisma.lightingAutomation.update({ where: { id: automation.id }, data: { lastRunDateOff: today } }).catch(() => undefined);
      await recordAutomationRun(automation.id, automation.name, "OFF", summary);
    }
  }
}

// Fired the moment a due automation is picked up, before the device commands are sent — the
// user asked for a notification "when an automation starts", not just on completion. Recipients
// mirror the lighting module's own edit permission, matching the pattern networkMonitor.ts uses.
async function notifyAutomationStart(automationName: string): Promise<void> {
  const userIds = await getUserIdsWithPermission("lighting", "canEdit");
  if (userIds.length === 0) return;
  await notifyUsers({ userIds, type: "lighting_automation_start", message: `Automation "${automationName}" is starting.`, linkUrl: "/lighting" });
}

async function recordAutomationRun(automationId: number, automationName: string, trigger: "ON" | "OFF", summary: ActionSummary): Promise<void> {
  const status = summary.failed === 0 ? "SUCCESS" : summary.succeeded === 0 ? "FAILED" : "PARTIAL";
  await prisma.lightingAutomationRun
    .create({
      data: {
        automationId,
        automationName,
        trigger,
        status,
        deviceCount: summary.succeeded + summary.failed,
        failedCount: summary.failed,
        message: summary.errors.length > 0 ? summary.errors.join("; ") : null,
      },
    })
    .catch(() => undefined);
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startLightingAutomationScheduler() {
  if (intervalHandle) return;
  const run = () => {
    runAutomationTick().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Lighting automation tick failed:", err);
    });
  };
  run();
  intervalHandle = setInterval(run, 60 * 1000);
  intervalHandle.unref();
}
