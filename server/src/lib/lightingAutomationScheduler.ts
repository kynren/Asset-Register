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

async function applyDeviceAction(deviceId: number, turnOn: boolean): Promise<void> {
  const device = await prisma.lightingDevice.findUnique({ where: { id: deviceId } });
  if (!device) return;
  let gen = device.gen;
  let kind = device.kind;
  if (needsDetection(device.protocol, gen, kind)) {
    const detected = await detectIotDevice(toIotDevice(device));
    gen = detected.gen;
    kind = detected.kind;
  }
  await setIotPower(toIotDevice({ ...device, gen, kind }), turnOn);
  const status = await getIotStatus(toIotDevice({ ...device, gen, kind })).catch(() => null);
  await prisma.lightingDevice.update({
    where: { id: deviceId },
    data: { gen, kind, ...(status ? { status: "ONLINE", isOn: status.on, brightness: status.brightness, powerW: status.powerW } : {}), lastCheckedAt: new Date() },
  });
}

async function applySceneAction(sceneId: number): Promise<void> {
  const scene = await prisma.lightingScene.findUnique({ where: { id: sceneId }, include: { actions: { include: { device: true } } } });
  if (!scene) return;
  for (const action of scene.actions) {
    const device = action.device;
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
    } catch {
      // Best-effort per device, same as the manual "Activate" endpoint — one unreachable light
      // in a scene shouldn't stop the rest of the scene (or the automation tick loop) from running.
    }
  }
}

async function runAutomationTick(): Promise<void> {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun..6=Sat, matches LightingAutomation.daysOfWeek
  const timeOfDay = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const today = now.toISOString().slice(0, 10);

  const due = await prisma.lightingAutomation.findMany({
    where: { isEnabled: true, timeOfDay, daysOfWeek: { has: dayOfWeek }, NOT: { lastRunDate: today } },
  });

  for (const automation of due) {
    try {
      if (automation.actionType === "DEVICE" && automation.targetDeviceId !== null && automation.turnOn !== null) {
        await applyDeviceAction(automation.targetDeviceId, automation.turnOn);
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
