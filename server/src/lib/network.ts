export function subnetOf(ip: string | undefined): string | null {
  if (!ip) return null;
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

export function isOnline(lastSeen: Date, thresholdMinutes = 15): boolean {
  return Date.now() - new Date(lastSeen).getTime() < thresholdMinutes * 60 * 1000;
}
