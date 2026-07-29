const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isValidIpv4(ip: string): boolean {
  const match = ip.match(IPV4_REGEX);
  if (!match) return false;
  return match.slice(1).every((octet) => Number(octet) >= 0 && Number(octet) <= 255);
}

export function ipToLong(ip: string): number {
  return ip.split(".").reduce((acc, octet) => acc * 256 + Number(octet), 0);
}

export function longToIp(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

export function expandRange(startIp: string, endIp: string, maxHosts: number): string[] {
  if (!isValidIpv4(startIp) || !isValidIpv4(endIp)) {
    throw new Error("Invalid IPv4 address in range");
  }
  const start = ipToLong(startIp);
  const end = ipToLong(endIp);
  if (end < start) {
    throw new Error("Range end must be greater than or equal to range start");
  }
  const count = end - start + 1;
  if (count > maxHosts) {
    throw new Error(`Range too large (${count} addresses) — max ${maxHosts} per scan`);
  }

  const addresses: string[] = [];
  for (let value = start; value <= end; value++) {
    addresses.push(longToIp(value));
  }
  return addresses;
}
