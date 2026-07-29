import os from "os";
import { Router } from "express";
import { verifyJwt } from "../../middleware/auth";
import { getLocalNicIp, resolveClientIp } from "../../lib/network";

const router = Router();
router.use(verifyJwt);

router.get("/info", (_req, res) => {
  res.json({
    nodeIp: getLocalNicIp() ?? "127.0.0.1",
    hostname: os.hostname(),
    platform: os.platform(),
  });
});

// Reports back what the server actually observed about the requesting connection — real
// values only (no fabricated "public IP" lookups). A loopback connection (client and server
// on the same machine, as in local dev) is resolved to that machine's real NIC IP instead of
// 127.0.0.1, since the loopback address itself never identifies which device connected.
router.get("/client-info", (req, res) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  const rawIp = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(",")[0].trim()) || req.socket.remoteAddress || req.ip;

  res.json({
    observedIp: resolveClientIp(rawIp) ?? "unknown",
    protocol: req.protocol,
    host: req.get("host"),
    appVersion: "1.0.0",
  });
});

export default router;
