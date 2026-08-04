import net from "net";
import { expandRange } from "../../lib/ipRange";
import { mapLimit } from "../../lib/concurrency";

const MAX_HOSTS_PER_SCAN = 1024;
const SCAN_CONCURRENCY = 24;

// Paxton Net2's Local Web API / Net2 Web API listen on 8443 (secure REST API) or 8080 (plain
// HTTP API) by default — there's no documented broadcast/UDP discovery protocol for it (unlike,
// say, ONVIF's WS-Discovery for cameras), so a TCP-connect port sweep across the range is the only
// viable discovery method, mirroring the general-purpose scanner in server/src/lib/ping.ts.
export const NET2_PORTS = [8443, 8080];

function checkPort(ip: string, port: number, timeoutMs = 500): Promise<boolean> {
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

export interface Net2DiscoveryCandidate {
  ipAddress: string;
  openPorts: number[];
}

export async function discoverNet2Servers(startIp: string, endIp: string): Promise<Net2DiscoveryCandidate[]> {
  const addresses = expandRange(startIp, endIp, MAX_HOSTS_PER_SCAN);
  const results = await mapLimit(addresses, SCAN_CONCURRENCY, async (ip): Promise<Net2DiscoveryCandidate> => {
    const openPorts: number[] = [];
    for (const port of NET2_PORTS) {
      if (await checkPort(ip, port)) openPorts.push(port);
    }
    return { ipAddress: ip, openPorts };
  });
  return results.filter((r) => r.openPorts.length > 0);
}

export async function testNet2Connection(ipAddress: string, port: number): Promise<boolean> {
  return checkPort(ipAddress, port, 2000);
}
