/**
 * Shared ZigBee scaffold used by both the Lighting and Access Control modules (see
 * ZigbeeCoordinator/ZigbeeDevice in schema.prisma). NOT hardware-verified — there is no ZigBee
 * coordinator dongle available in this environment. This intentionally never fakes a successful
 * connection: `connect()` always reports failure with an explanatory message, since actually
 * bridging to hardware requires a real stack (e.g. zigbee-herdsman) driving a physical
 * coordinator, which isn't implemented here. Config (serial port) can still be saved so the UI
 * has somewhere to plug in a real integration later without another schema change.
 */
import { prisma } from "../config/prisma";

export type ZigbeeModuleName = "LIGHTING" | "ACCESS_CONTROL";

export async function getCoordinator(module: ZigbeeModuleName) {
  const existing = await prisma.zigbeeCoordinator.findUnique({ where: { module } });
  if (existing) return existing;
  return prisma.zigbeeCoordinator.create({ data: { module } });
}

export async function updateCoordinatorConfig(module: ZigbeeModuleName, serialPort: string | null) {
  await getCoordinator(module); // ensure a row exists
  return prisma.zigbeeCoordinator.update({ where: { module }, data: { serialPort } });
}

export interface ConnectResult {
  ok: boolean;
  message: string;
}

/** Always fails — see file header. Still updates the coordinator's status/lastError so the UI
 * reflects a real (failed) attempt rather than silently doing nothing. */
export async function attemptConnect(module: ZigbeeModuleName): Promise<ConnectResult> {
  const coordinator = await getCoordinator(module);
  const message = coordinator.serialPort
    ? `No ZigBee coordinator responded on ${coordinator.serialPort}. This build doesn't yet include a ZigBee radio stack (e.g. zigbee-herdsman) — connect a coordinator dongle and wire up a real driver to enable this.`
    : "Set a serial port for the coordinator first.";
  await prisma.zigbeeCoordinator.update({ where: { module }, data: { status: "ERROR", lastError: message } });
  return { ok: false, message };
}

export async function listDevices(module: ZigbeeModuleName) {
  return prisma.zigbeeDevice.findMany({ where: { module }, orderBy: { friendlyName: "asc" } });
}
