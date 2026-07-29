import { execFile } from "child_process";
import dns from "dns";
import net from "net";
import { promisify } from "util";
import { isValidIpv4 } from "./ipRange";

const execFileAsync = promisify(execFile);
const IS_WINDOWS = process.platform === "win32";

export const COMMON_PORTS = [21, 22, 23, 25, 80, 443, 554, 3389, 8080, 8443];

export interface PingResult {
  alive: boolean;
  responseTimeMs: number | null;
}

export async function pingHost(ip: string, timeoutMs = 800): Promise<PingResult> {
  if (!isValidIpv4(ip)) return { alive: false, responseTimeMs: null };

  try {
    const args = IS_WINDOWS ? ["-n", "1", "-w", String(timeoutMs), ip] : ["-c", "1", "-W", String(Math.ceil(timeoutMs / 1000)), ip];
    const { stdout } = await execFileAsync("ping", args, { timeout: timeoutMs + 1000 });

    const timeMatch = stdout.match(/time[=<]([\d.]+)\s*ms/i);
    if (timeMatch) {
      return { alive: true, responseTimeMs: Math.round(Number(timeMatch[1])) };
    }
    // Some Windows locales report 0ms round-trips without a "time=" token when replies succeed.
    if (IS_WINDOWS && /Reply from/i.test(stdout)) {
      return { alive: true, responseTimeMs: 0 };
    }
    return { alive: false, responseTimeMs: null };
  } catch {
    return { alive: false, responseTimeMs: null };
  }
}

export async function getArpMac(ip: string): Promise<string | null> {
  if (!isValidIpv4(ip)) return null;
  try {
    const args = IS_WINDOWS ? ["-a", ip] : ["-n", ip];
    const { stdout } = await execFileAsync("arp", args, { timeout: 2000 });
    const macMatch = stdout.match(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i);
    return macMatch ? macMatch[0].replace(/-/g, ":").toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function reverseDns(ip: string, timeoutMs = 800): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    dns.reverse(ip, (err, hostnames) => {
      clearTimeout(timer);
      resolve(!err && hostnames.length > 0 ? hostnames[0] : null);
    });
  });
}

function checkPort(ip: string, port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const finish = (result: boolean) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, ip);
  });
}

export async function scanCommonPorts(ip: string, ports: number[] = COMMON_PORTS): Promise<number[]> {
  const results = await Promise.all(ports.map(async (port) => ((await checkPort(ip, port)) ? port : null)));
  return results.filter((p): p is number => p !== null);
}
