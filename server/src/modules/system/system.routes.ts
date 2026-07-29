import os from "os";
import { Router } from "express";
import { verifyJwt } from "../../middleware/auth";

const router = Router();
router.use(verifyJwt);

function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

router.get("/info", (_req, res) => {
  res.json({
    nodeIp: getLocalIp(),
    hostname: os.hostname(),
    platform: os.platform(),
  });
});

// Reports back what the server actually observed about the requesting connection —
// real values only (no fabricated "public IP" lookups). In local dev this will
// legitimately show a loopback/private address since client and server are on the
// same machine/network.
router.get("/client-info", (req, res) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  const observedIp = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(",")[0].trim()) || req.socket.remoteAddress || req.ip;

  res.json({
    observedIp: observedIp?.replace("::ffff:", "") ?? "unknown",
    protocol: req.protocol,
    host: req.get("host"),
    appVersion: "1.0.0",
  });
});

export default router;
