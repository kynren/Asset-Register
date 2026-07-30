import os from "os";
import { Router } from "express";
import { verifyJwt } from "../../middleware/auth";
import { getLocalNicIp, resolveClientIp } from "../../lib/network";
import { prisma } from "../../config/prisma";

const router = Router();
router.use(verifyJwt);

router.get("/info", async (_req, res) => {
  res.json({
    nodeIp: (await getLocalNicIp()) ?? "127.0.0.1",
    hostname: os.hostname(),
    platform: os.platform(),
  });
});

// Reports back what this device's own IP is — real values only (no fabricated "public IP"
// lookups). A remote server behind NAT can only ever see the shared public/router IP of an
// incoming connection, which is legitimately identical for every device on the same office
// network — it's not a bug, it's just not useful for telling machines apart. So this prefers
// the IP the Kynren agent already collected directly on whichever device the current user's
// assigned asset is linked to (agent's own routing-table read of its real NIC — see
// agent/kynren_agent.py get_primary_ip()), and only falls back to the connection-observed IP
// (with the loopback-substitution behavior below) when no such device is linked.
router.get("/client-info", async (req, res) => {
  const ownedAssets = await prisma.asset.findMany({
    where: { assignedToId: req.user!.id, deviceId: { not: null } },
    select: { device: { select: { ipAddresses: true, hostname: true, lastSeen: true } } },
  });
  const agentDevice = ownedAssets
    .map((a) => a.device)
    .filter((d): d is NonNullable<typeof d> => !!d && d.ipAddresses.length > 0)
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())[0];

  if (agentDevice) {
    res.json({
      observedIp: agentDevice.ipAddresses[0],
      source: "agent",
      deviceHostname: agentDevice.hostname,
      deviceLastSeen: agentDevice.lastSeen,
      appVersion: "1.0.0",
    });
    return;
  }

  const forwardedFor = req.headers["x-forwarded-for"];
  const rawIp = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(",")[0].trim()) || req.socket.remoteAddress || req.ip;

  res.json({
    observedIp: (await resolveClientIp(rawIp)) ?? "unknown",
    source: "connection",
    protocol: req.protocol,
    host: req.get("host"),
    appVersion: "1.0.0",
  });
});

export default router;
