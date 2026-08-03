import fs from "fs";
import path from "path";
import multer from "multer";
import { Router } from "express";
import { prisma } from "../../config/prisma";
import { verifyAgentKey } from "../../middleware/agentAuth";
import { validateBody } from "../../middleware/validate";
import { ApiError } from "../../middleware/errorHandler";
import { decryptSecret } from "../../lib/crypto";
import { ipToLong } from "../../lib/ipRange";
import { applyRelayResults } from "./scan.service";
import { processCompletedMonitorScan } from "../../lib/networkMonitor";
import { resolveTopologyForDevices } from "../../lib/topologyEngine";
import { SESSION_ROOT } from "../../lib/streamRelay";
import { RECORDING_ROOT } from "../../lib/recording";
import {
  relayCompleteSchema,
  relayDeviceJobCompleteSchema,
  relayDiscoverySchema,
  relayLogSchema,
  relayProgressSchema,
  relayVideoJobCompleteSchema,
} from "./network.schema";

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
    snmpResults: {
      deviceId: number;
      sysDescr: string | null;
      upTimeTicks: number | null;
      interfaces: Record<string, unknown>[];
      error: string | null;
      sysName: string | null;
      macTable: { mac: string; port: string }[];
      lldpNeighbors: { localPort: string | null; remoteChassisId: string | null; remotePortId: string | null; remoteSysName: string | null; protocol: "LLDP" | "CDP" }[];
      vlans: { vlanId: number | string; name: string | null }[];
      poeStatus: { port: string; status: string }[];
    }[];
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
              snmpSysName: r.sysName,
              snmpUpTimeTicks: r.upTimeTicks != null ? BigInt(r.upTimeTicks) : null,
              snmpInterfaces: r.interfaces as unknown as object,
              snmpMacTable: r.macTable as unknown as object,
              snmpLldpNeighbors: r.lldpNeighbors as unknown as object,
              snmpVlans: r.vlans as unknown as object,
              snmpPoeStatus: r.poeStatus as unknown as object,
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

  // Fire-and-forget: try to resolve any freshly-reported LLDP/CDP neighbors into real
  // NetworkNode/NetworkEdge topology. Never blocks or fails the relay's own success response —
  // this is a nice-to-have enrichment, not something the relay protocol depends on.
  resolveTopologyForDevices(snmpResults.map((r) => r.deviceId)).catch(() => undefined);

  res.json({ ok: true });
});

// Best-effort report of subnets the relay's own machine sees as locally connected (see
// discover_local_subnets() in the Python agent) — purely informational, upserted so repeated
// reports from the same relay just refresh lastSeenAt instead of accumulating duplicates.
router.post("/discovery", validateBody(relayDiscoverySchema), async (req, res) => {
  const { subnets } = req.body as { subnets: { cidr: string; label?: string | null }[] };
  for (const s of subnets) {
    await prisma.relayDiscoveredSubnet
      .upsert({
        where: { cidr: s.cidr },
        update: { label: s.label ?? undefined, lastSeenAt: new Date() },
        create: { cidr: s.cidr, label: s.label ?? undefined },
      })
      .catch(() => undefined);
  }
  res.json({ ok: true });
});

// Best-effort log-line upload from the relay's own rotating/in-memory log buffer (see
// upload_logs() in the Python agent) — feeds the App Settings → Agent Log tab. Fire-and-forget
// per line, same convention as /discovery above: never let one bad row fail the whole batch.
router.post("/log", validateBody(relayLogSchema), async (req, res) => {
  const { lines } = req.body as { lines: string[] };
  if (lines.length > 0) {
    await prisma.agentLogEntry.createMany({ data: lines.map((message) => ({ message })) }).catch(() => undefined);
  }
  res.json({ ok: true });
});

// ───────────────────────── Generic device job (PING/HTTP) ─────────────────────────
//
// The counterpart to /next-job above, but for the generic on-demand relay jobs created by
// server/src/lib/relayDeviceJobs.ts (ISAPI calls, Shelly/Tasmota/generic lighting control, asset
// ping — see relayTransport.ts's relayAwareFetch/relayAwarePing, the single choke point every
// direct device call in this codebase now goes through). Separate endpoints from the scan-job
// pair above deliberately — different payload shape, different cadence, no reason to entangle
// the two protocols.

router.get("/next-device-job", async (_req, res) => {
  // Lower priority number claims first (see RelayDeviceJob.priority) — an on-demand check (NVR,
  // lighting, ICMP pinger, single asset ping) always jumps ahead of the background asset-heartbeat
  // sweep's own bulk pings, so a burst of heartbeat traffic can't starve a user waiting on a result.
  const pending = await prisma.relayDeviceJob.findFirst({ where: { status: "PENDING" }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
  if (!pending) {
    res.status(204).end();
    return;
  }

  const claimed = await prisma.relayDeviceJob.updateMany({ where: { id: pending.id, status: "PENDING" }, data: { status: "RUNNING" } });
  if (claimed.count === 0) {
    res.status(204).end();
    return;
  }

  res.json({
    id: pending.id,
    kind: pending.kind,
    target: pending.target,
    method: pending.method,
    path: pending.path,
    protocolScheme: pending.protocolScheme,
    requestHeaders: pending.requestHeaders,
    requestBody: pending.requestBody,
    digestUsername: pending.digestUsername,
    digestPassword: pending.digestPasswordEncrypted ? decryptSecret(pending.digestPasswordEncrypted) : null,
    timeoutMs: pending.timeoutMs,
  });
});

router.post("/device-jobs/:id/complete", validateBody(relayDeviceJobCompleteSchema), async (req, res) => {
  const id = Number(req.params.id);
  await prisma.relayDeviceJob.updateMany({
    where: { id, status: "RUNNING" },
    data: {
      status: req.body.status,
      responseStatus: req.body.responseStatus,
      responseHeaders: req.body.responseHeaders,
      responseBodyBase64: req.body.responseBodyBase64,
      errorMessage: req.body.errorMessage,
      completedAt: new Date(),
    },
  });
  res.json({ ok: true });
});

// ───────────────────────── Video job (live view / recording) ─────────────────────────
//
// The counterpart to /next-device-job above, but long-running: a claimed video job keeps the
// agent's own local ffmpeg process alive for minutes-to-hours instead of one request/response.
// The claiming agent uploads its ffmpeg output as it goes (HLS playlist/segments for LIVE, the
// finished .mp4 once for RECORDING) via /video-jobs/:id/segment, writing directly into the same
// SESSION_ROOT/RECORDING_ROOT directories streamRelay.ts/recording.ts already read from — no
// separate ingestion/merge step needed on the server side.

router.get("/next-video-job", async (_req, res) => {
  const pending = await prisma.relayVideoJob.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } });
  if (!pending) {
    res.status(204).end();
    return;
  }

  const claimed = await prisma.relayVideoJob.updateMany({ where: { id: pending.id, status: "PENDING" }, data: { status: "RUNNING" } });
  if (claimed.count === 0) {
    res.status(204).end();
    return;
  }

  res.json({ id: pending.id, kind: pending.kind, streamUrl: pending.streamUrl });
});

// Polled by the agent (every ~2s) while its local ffmpeg is running, so it can learn the server
// wants it to stop — the agent has no other way to be told, since it's the one polling, not the
// server pushing to it.
router.get("/video-jobs/:id/status", async (req, res) => {
  const job = await prisma.relayVideoJob.findUnique({ where: { id: req.params.id } });
  if (!job) throw new ApiError(404, "Video job not found");
  res.json({ status: job.status });
});

router.post("/video-jobs/:id/complete", validateBody(relayVideoJobCompleteSchema), async (req, res) => {
  await prisma.relayVideoJob.updateMany({
    where: { id: req.params.id, status: { in: ["RUNNING", "STOPPING"] } },
    data: { status: req.body.status, errorMessage: req.body.errorMessage ?? null },
  });
  res.json({ ok: true });
});

// Resolves each upload's destination directory purely from the job's own kind + id (LIVE ->
// SESSION_ROOT/<id>/, RECORDING -> RECORDING_ROOT/<cameraId>/, filename matched to the
// CameraRecording row already created by recording.ts) — cached on the request the first time a
// callback needs it so the two multer callbacks (destination, filename) don't each re-query.
async function resolveVideoJobForUpload(req: any): Promise<{ kind: "LIVE" | "RECORDING"; cameraDir?: string; recordingFileName?: string } | null> {
  if (req.__relayVideoJobUpload !== undefined) return req.__relayVideoJobUpload;

  const job = await prisma.relayVideoJob.findUnique({ where: { id: req.params.id } });
  if (!job) {
    req.__relayVideoJobUpload = null;
    return null;
  }

  if (job.kind === "LIVE") {
    req.__relayVideoJobUpload = { kind: "LIVE" as const };
    return req.__relayVideoJobUpload;
  }

  const recording = await prisma.cameraRecording.findUnique({ where: { id: Number(req.params.id) } });
  if (!recording) {
    req.__relayVideoJobUpload = null;
    return null;
  }

  req.__relayVideoJobUpload = {
    kind: "RECORDING" as const,
    cameraDir: path.join(RECORDING_ROOT, String(recording.cameraId)),
    recordingFileName: path.basename(recording.filePath),
  };
  return req.__relayVideoJobUpload;
}

const videoSegmentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      resolveVideoJobForUpload(req)
        .then((resolved) => {
          if (!resolved) return cb(new Error("Video job not found"), "");
          const dir = resolved.kind === "LIVE" ? path.join(SESSION_ROOT, req.params.id) : resolved.cameraDir!;
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        })
        .catch((err) => cb(err as Error, ""));
    },
    filename: (req, file, cb) => {
      resolveVideoJobForUpload(req)
        .then((resolved) => {
          if (!resolved) return cb(new Error("Video job not found"), file.originalname);
          if (resolved.kind === "RECORDING") return cb(null, resolved.recordingFileName!);
          const requested = typeof req.query.filename === "string" ? req.query.filename : file.originalname;
          cb(null, path.basename(requested));
        })
        .catch((err) => cb(err as Error, file.originalname));
    },
  }),
  // HLS segments at -hls_time 2 run a few hundred KB; a whole relayed recording upload is the
  // one case that can be much larger, hence the generous ceiling relative to other upload routes.
  limits: { fileSize: 500 * 1024 * 1024 },
});

router.post("/video-jobs/:id/segment", videoSegmentUpload.single("file"), async (req, res) => {
  if (!req.file) throw new ApiError(400, "No file uploaded.");
  res.json({ ok: true });
});

export default router;
