/**
 * Recurring on/off schedule for Lighting — "Mon-Fri at 18:00, turn on Porch Light". Ticks every
 * minute (same cadence networkMonitor.ts uses for its own admin-configurable interval), matches
 * automations whose daysOfWeek includes today and whose timeOfDay equals the current HH:mm, and
 * fires each one at most once per day via the lastRunDate dedup key — a minute-granularity tick
 * would otherwise re-fire an automation on every tick during its matching minute.
 */
import { prisma } from "../config/prisma";
import { detectIotDevice, getIotStatus, IotDeviceLike, needsDetection, setIotBrightness, setIotPower } from "./iotDeviceApi";

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
async function applyDeviceActions(actions: { deviceId: number; turnOn: boolean; brightness: number | null }[]): Promise<void> {
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
    } catch (err) {
      // Best-effort per device (see comment above) — but still logged, otherwise a command that
      // never reached a device (wrong IP, device offline, detection failure) leaves no trace
      // anywhere and looks identical to the automation silently doing nothing.
      // eslint-disable-next-line no-console
      console.error(`Lighting automation: command to device ${device.id} ("${device.name}") failed:`, err instanceof Error ? err.message : err);
      await prisma.lightingDevice.update({ where: { id: device.id }, data: { status: "OFFLINE", lastCheckedAt: new Date() } }).catch(() => undefined);
    }
  }
}

async function applySceneAction(sceneId: number): Promise<void> {
  const scene = await prisma.lightingScene.findUnique({ where: { id: sceneId }, include: { actions: true } });
  if (!scene) return;
  await applyDeviceActions(scene.actions);
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

  for (const automation of due) {
    try {
      if (automation.actionType === "DEVICE" && automation.actions.length > 0) {
        await applyDeviceActions(automation.actions);
      } else if (automation.actionType === "SCENE" && automation.targetSceneId !== null) {
        await applySceneAction(automation.targetSceneId);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Lighting automation ${automation.id} ("${automation.name}") failed:`, err);
    } finally {
      await prisma.lightingAutomation.update({ where: { id: automation.id }, data: { lastRunDate: today } }).catch(() => undefined);
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
    try {
      await applyDeviceActions(automation.actions.map((a) => ({ deviceId: a.deviceId, turnOn: false, brightness: null })));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Lighting automation ${automation.id} ("${automation.name}") off-trigger failed:`, err);
    } finally {
      await prisma.lightingAutomation.update({ where: { id: automation.id }, data: { lastRunDateOff: today } }).catch(() => undefined);
    }
  }
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
