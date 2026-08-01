import { prisma } from "../config/prisma";

interface LldpNeighbor {
  localPort: string | null;
  remoteChassisId: string | null;
  remotePortId: string | null;
  remoteSysName: string | null;
  protocol: string;
}

interface MonitoredDeviceLike {
  ipAddress: string;
  hostname: string | null;
  vendor: string | null;
}

// NetworkNode has no FK to MonitoredNetworkDevice (only an optional one to the agent-reported
// `Device` model) — a monitored switch is represented on the topology graph purely by IP address,
// found-or-created here the first time it shows up as either end of a discovered link.
async function findOrCreateNodeForDevice(device: MonitoredDeviceLike): Promise<number> {
  const existing = await prisma.networkNode.findFirst({ where: { ipAddress: device.ipAddress } });
  if (existing) return existing.id;
  const created = await prisma.networkNode.create({
    data: { type: "SWITCH", label: device.hostname || device.ipAddress, ipAddress: device.ipAddress, vendor: device.vendor },
  });
  return created.id;
}

// Resolves an LLDP/CDP neighbor entry to a node on the topology graph — tries matching the
// remote chassis ID (usually a MAC, LLDP chassis-ID-subtype 4) against a known
// MonitoredNetworkDevice's MAC first, then falls back to a hostname/sysName match. A neighbor
// that can't be resolved to any known device is left alone rather than fabricating a placeholder
// node for an unidentified MAC — the switch's own SNMP data doesn't tell us enough to be
// confident about anything beyond "something is plugged into this port".
async function resolveNeighborNode(neighbor: LldpNeighbor): Promise<number | null> {
  if (neighbor.remoteChassisId) {
    const byMac = await prisma.monitoredNetworkDevice.findFirst({
      where: { macAddress: { equals: neighbor.remoteChassisId, mode: "insensitive" } },
    });
    if (byMac) return findOrCreateNodeForDevice(byMac);
  }
  if (neighbor.remoteSysName) {
    const byHostname = await prisma.monitoredNetworkDevice.findFirst({
      where: { hostname: { equals: neighbor.remoteSysName, mode: "insensitive" } },
    });
    if (byHostname) return findOrCreateNodeForDevice(byHostname);
  }
  return null;
}

// Finds an existing auto-discovered edge between these two nodes (in either direction — LLDP
// links are physical and thus inherently undirected even though NetworkEdge stores a
// source/target) and refreshes its ports, or creates a new one. Never touches a manually-drawn
// edge (discoveredVia null) — a human who drew a link on the topology graph gets to keep it even
// if SNMP data later disagrees.
async function upsertDiscoveredEdge(sourceId: number, targetId: number, sourcePort: string | null, targetPort: string | null, protocol: string): Promise<void> {
  const existing = await prisma.networkEdge.findFirst({
    where: { discoveredVia: { not: null }, OR: [{ sourceId, targetId }, { sourceId: targetId, targetId: sourceId }] },
  });
  if (existing) {
    await prisma.networkEdge.update({ where: { id: existing.id }, data: { sourcePort, targetPort, discoveredVia: protocol } });
    return;
  }
  await prisma.networkEdge.create({ data: { sourceId, targetId, sourcePort, targetPort, discoveredVia: protocol } });
}

/**
 * Turns freshly-SNMP-polled LLDP/CDP neighbor data (see relay.routes.ts's /jobs/:id/complete
 * handler, which calls this after persisting each device's snmpLldpNeighbors) into real
 * NetworkNode/NetworkEdge rows on the Topology Graph. Best-effort and idempotent — safe to call
 * repeatedly with the same device IDs as new poll cycles come in; errors on one device never
 * block resolution for the others.
 */
export async function resolveTopologyForDevices(deviceIds: number[]): Promise<void> {
  const uniqueIds = [...new Set(deviceIds)];
  for (const deviceId of uniqueIds) {
    try {
      const device = await prisma.monitoredNetworkDevice.findUnique({ where: { id: deviceId } });
      if (!device || !device.snmpLldpNeighbors) continue;
      const neighbors = device.snmpLldpNeighbors as unknown as LldpNeighbor[];
      if (!Array.isArray(neighbors) || neighbors.length === 0) continue;

      const sourceNodeId = await findOrCreateNodeForDevice(device);
      for (const neighbor of neighbors) {
        const targetNodeId = await resolveNeighborNode(neighbor);
        if (targetNodeId === null || targetNodeId === sourceNodeId) continue;
        await upsertDiscoveredEdge(sourceNodeId, targetNodeId, neighbor.localPort, neighbor.remotePortId, neighbor.protocol);
      }
    } catch {
      // One device's malformed/unexpected LLDP data shouldn't block topology resolution for the rest.
    }
  }
}
