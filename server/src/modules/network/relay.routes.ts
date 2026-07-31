import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyAgentKey } from "../../middleware/agentAuth";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { decryptSecret } from "../../lib/crypto";
import { ipToLong } from "../../lib/ipRange";
import { applyRelayResults } from "./scan.service";
import { processCompletedMonitorScan } from "../../lib/networkMonitor";
import { relayCompleteSchema, relayProgressSchema } from "./network.schema";

// On-prem relay agent protocol (agent/kynren_network_relay.py). A cloud-hosted server has no
// route into a private office LAN — no code running on it can ping/ARP/SNMP-poll local devices,
// full stop. When System Settings → Network Relay Agent is enabled, scans are queued here
// (status PENDING) instead of executed directly (see scan.service.ts's isNetworkRelayEnabled()),
// and an on-prem agent — the one machine that actually has a route into the LAN — polls this
// queue, does the real network work, and reports results back.
//
// Auth reuses the same AgentApiKey/X-Agent-Key mechanism as the per-machine device agent
// (server/src/modules/devices/agent.routes.ts) — conceptually the same trust boundary, just a
// different capability.
const router = Router();
router.use(verifyAgentKey);

router.get("/next-job", async (_req, res) => {
  const pending = await prisma.networkScan.findFirst({ where: { status: "PENDING" }, orderBy: { startedAt: "asc" } });
  if (!pending) {
    res.status(204).end();
    return;
  }

  // Conditional update so two relay pollers (or a poller racing a manual cancel) can't both
  // claim the same job.
  const claimed = await prisma.networkScan.updateMany({ where: { id: pending.id, status: "PENDING" }, data: { status: "RUNNING" } });
  if (claimed.count === 0) {
    res.status(204).end();
    return;
  }

  const rangeStart = ipToLong(pending.startIp);
  const rangeEnd = ipToLong(pending.endIp);
  const snmpCandidates = await prisma.monitoredNetworkDevice.findMany({
    where: { snmpEnabled: true, snmpCommunity: { not: null } },
  });
  const snmpTargets = snmpCandidates
    .filter((d) => {
      const value = ipToLong(d.ipAddress);
      return value >= rangeStart && value <= rangeEnd;
    })
    .map((d) => ({ deviceId: d.id, ip: d.ipAddress, port: d.snmpPort, community: decryptSecret(d.snmpCommunity!) }));

  res.json({ id: pending.id, startIp: pending.startIp, endIp: pending.endIp, snmpTargets });
});

router.patch("/jobs/:id/progress", validateBody(relayProgressSchema), async (req, res) => {
  const id = Number(req.params.id);
  await prisma.networkScan.updateMany({
    where: { id, status: "RUNNING" },
    data: { scannedHosts: req.body.scannedHosts, aliveHosts: req.body.aliveHosts },
  });
  res.json({ ok: true });
});

router.post("/jobs/:id/complete", validateBody(relayCompleteSchema), async (req, res) => {
  const id = Number(req.params.id);
  const scan = await prisma.networkScan.findUnique({ where: { id } });
  if (!scan) throw new ApiError(404, "Scan not found");

  const { results, snmpResults } = req.body as {
    results: { ipAddress: string; alive: boolean; hostname: string | null; macAddress: string | null; openPorts: number[]; responseTimeMs: number | null }[];
    snmpResults: { deviceId: number; sysDescr: string | null; upTimeTicks: number | null; interfaces: Record<string, unknown>[]; error: string | null }[];
  };

  const { aliveHosts, scannedHosts } = await applyRelayResults(id, results);
  await prisma.networkScan.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date(), aliveHosts, scannedHosts } });

  for (const r of snmpResults) {
    await prisma.monitoredNetworkDevice
      .update({
        where: { id: r.deviceId },
        data: r.error
          ? { snmpLastError: r.error, snmpLastPolledAt: new Date() }
          : {
              snmpSysDescr: r.sysDescr,
              snmpUpTimeTicks: r.upTimeTicks != null ? BigInt(r.upTimeTicks) : null,
              snmpInterfaces: r.interfaces as unknown as object,
              snmpLastPolledAt: new Date(),
              snmpLastError: null,
            },
      })
      .catch(() => undefined);
  }

  // Relay already supplied SNMP results above (if any were requested) — skip the server's own
  // (LAN-dependent, and therefore pointless in relay mode) SNMP polling pass.
  if (scan.triggeredBy === "SCHEDULED") {
    await processCompletedMonitorScan(id, { skipSnmp: true });
  }

  res.json({ ok: true });
});

export default router;
