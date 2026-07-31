import { execFile } from "child_process";
import dgram from "dgram";
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

// A conservative hostname pattern (RFC 952/1123-ish): alnum start/end, dots/hyphens/underscores
// in between. Deliberately rejects anything starting with "-" so a target string can never be
// mistaken for a flag by the ping binary when passed as an execFile argument.
const HOSTNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,253}[A-Za-z0-9])?$/;

function isValidPingTarget(target: string): boolean {
  return isValidIpv4(target) || HOSTNAME_PATTERN.test(target);
}

export async function pingHost(target: string, timeoutMs = 800): Promise<PingResult> {
  if (!isValidPingTarget(target)) return { alive: false, responseTimeMs: null };

  try {
    const args = IS_WINDOWS ? ["-n", "1", "-w", String(timeoutMs), target] : ["-c", "1", "-W", String(Math.ceil(timeoutMs / 1000)), target];
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

// Encodes a raw 16-byte NetBIOS name into the 32-byte "half-ASCII" form the wire protocol uses:
// each nibble of each byte becomes its own byte, offset into 'A'..'P'. This is the same encoding
// nbtscan/nmblookup use, and it's how a plain reverse-DNS lookup fails to work on most LANs
// (nothing registers PTR records) while this still resolves the machine's actual Windows name.
function encodeNetbiosName(name16: Buffer): Buffer {
  const encoded = Buffer.alloc(32);
  for (let i = 0; i < 16; i++) {
    encoded[i * 2] = 0x41 + ((name16[i] >> 4) & 0x0f);
    encoded[i * 2 + 1] = 0x41 + (name16[i] & 0x0f);
  }
  return encoded;
}

// Builds a NetBIOS Name Service NBSTAT ("node status") query for the wildcard name "*", which
// asks the target to list every NetBIOS name it has registered — including its computer name.
function buildNbstatQuery(transactionId: number): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(transactionId, 0);
  header.writeUInt16BE(0x0000, 2); // flags: standard query
  header.writeUInt16BE(0x0001, 4); // questions
  header.writeUInt16BE(0x0000, 6);
  header.writeUInt16BE(0x0000, 8);
  header.writeUInt16BE(0x0000, 10);

  const name16 = Buffer.alloc(16, 0x00);
  name16[0] = 0x2a; // '*'
  const encodedName = encodeNetbiosName(name16);

  const question = Buffer.concat([
    Buffer.from([0x20]), // encoded-name length
    encodedName,
    Buffer.from([0x00]), // name terminator
    Buffer.from([0x00, 0x21]), // QTYPE = NBSTAT
    Buffer.from([0x00, 0x01]), // QCLASS = IN
  ]);

  return Buffer.concat([header, question]);
}

// Pulls the first non-group ("unique") name with suffix 0x00 out of an NBSTAT response — that's
// the target's registered computer name. Anything short of a clean parse is treated as "no name"
// rather than thrown, since this reads attacker-uncontrolled but still arbitrary network bytes.
function parseNbstatResponse(response: Buffer): string | null {
  const RDATA_OFFSET = 12 + 34 + 2 + 2 + 4 + 2; // header + RR name + type + class + ttl + rdlength
  if (response.length <= RDATA_OFFSET) return null;

  const numNames = response[RDATA_OFFSET];
  const entriesStart = RDATA_OFFSET + 1;
  let fallback: string | null = null;

  for (let i = 0; i < numNames; i++) {
    const entryStart = entriesStart + i * 18;
    if (entryStart + 18 > response.length) break;

    const rawName = response.subarray(entryStart, entryStart + 15).toString("ascii").replace(/\0/g, " ").trim();
    const suffix = response[entryStart + 15];
    const flags = response.readUInt16BE(entryStart + 16);
    const isGroup = (flags & 0x8000) !== 0;
    if (!rawName) continue;

    if (fallback === null) fallback = rawName;
    if (suffix === 0x00 && !isGroup) return rawName;
  }
  return fallback;
}

// Active NetBIOS name lookup — the fallback of last resort when reverse DNS comes back empty,
// which is the common case on LANs without proper PTR records. Works against any Windows host
// (and many NAS/embedded devices) whether or not the Kynren agent is installed on it.
export async function getNetbiosName(ip: string, timeoutMs = 600): Promise<string | null> {
  if (!isValidIpv4(ip)) return null;

  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;

    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    socket.once("error", () => finish(null));
    socket.once("message", (msg) => {
      try {
        finish(parseNbstatResponse(msg));
      } catch {
        finish(null);
      }
    });

    const query = buildNbstatQuery(Math.floor(Math.random() * 0xffff));
    socket.send(query, 137, ip, (err) => {
      if (err) finish(null);
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
