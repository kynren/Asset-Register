// A curated (non-exhaustive) table of common OUI prefixes -> vendor name.
// Covers the manufacturers most likely to show up on a typical corporate/office LAN.
const OUI_PREFIXES: Record<string, string> = {
  "00:1A:11": "Google",
  "F4:F5:D8": "Google",
  "3C:5A:B4": "Google",
  "AC:87:A3": "Apple",
  "F0:18:98": "Apple",
  "A4:83:E7": "Apple",
  "DC:A6:32": "Raspberry Pi Foundation",
  "B8:27:EB": "Raspberry Pi Foundation",
  "E4:5F:01": "Raspberry Pi Foundation",
  "00:14:22": "Dell",
  "D4:BE:D9": "Dell",
  "B0:7B:25": "Dell",
  "18:A9:9B": "Dell",
  "F8:BC:12": "Dell",
  "00:21:5A": "HP",
  "3C:D9:2B": "HP",
  "A0:1D:48": "HP",
  "00:1B:78": "HP",
  "9C:8E:99": "HP",
  "00:26:55": "Lenovo",
  "54:EE:75": "Lenovo",
  "00:23:AE": "Lenovo",
  "00:50:56": "VMware",
  "00:0C:29": "VMware",
  "00:1C:14": "VMware",
  "08:00:27": "VirtualBox",
  "00:15:5D": "Microsoft (Hyper-V)",
  "00:03:FF": "Microsoft",
  "7C:1E:52": "Microsoft Surface",
  "00:1E:C9": "Cisco",
  "00:1B:D4": "Cisco",
  "00:26:99": "Cisco",
  "F8:72:EA": "Cisco",
  "00:04:96": "TP-Link",
  "50:C7:BF": "TP-Link",
  "AC:84:C6": "TP-Link",
  "C4:E9:84": "TP-Link",
  "14:CC:20": "TP-Link",
  "1C:61:B4": "Netgear",
  "A0:40:A0": "Netgear",
  "20:E5:2A": "Netgear",
  "00:14:6C": "Netgear",
  "00:18:4D": "Ubiquiti",
  "24:A4:3C": "Ubiquiti",
  "04:18:D6": "Ubiquiti",
  "F0:9F:C2": "Ubiquiti",
  "00:40:8C": "Axis Communications",
  "AC:CC:8E": "Axis Communications",
  "00:0F:7C": "Hikvision",
  "4C:BD:8F": "Hikvision",
  "44:19:B6": "Hikvision",
  "BC:AD:28": "Hikvision",
  "28:57:BE": "Dahua Technology",
  "3C:EF:8C": "Dahua Technology",
  "9C:8E:CD": "Dahua Technology",
  "00:0E:C6": "D-Link",
  "1C:7E:E5": "D-Link",
  "00:1E:58": "D-Link",
  "B4:2E:99": "Samsung",
  "8C:79:F5": "Samsung",
  "5C:0A:5B": "Samsung",
  "3C:5A:37": "Intel",
  "00:1B:21": "Intel",
  "A4:C3:F0": "Intel",
  "94:65:9C": "Intel",
  "3C:97:0E": "Sonos",
  "48:A6:B8": "Sonos",
  "70:B3:D5": "IEEE Registration Authority",
  "00:1D:D8": "Microsoft",
  "00:E0:4C": "Realtek",
  "52:54:00": "QEMU/KVM Virtual Machine",
};

export function lookupVendor(mac: string | null | undefined): string | null {
  if (!mac) return null;
  const prefix = mac.toUpperCase().slice(0, 8);
  return OUI_PREFIXES[prefix] ?? null;
}

// Online fallback for MAC prefixes not in the curated table above, via the free (key-less)
// api.macvendors.com lookup. That API caps unauthenticated callers at ~1 req/sec, so calls are
// serialized through a single module-level queue (never parallelized, even across concurrent
// scans) and cached by OUI prefix — a /24 sweep typically only has a handful of distinct
// prefixes, so the cache does almost all the work after the first host of each vendor. Fails
// soft on any error/timeout/rate-limit so a slow or unreachable API never blocks a scan.
const onlineVendorCache = new Map<string, string | null>();
let onlineLookupQueue: Promise<void> = Promise.resolve();
let lastOnlineLookupAt = 0;
const ONLINE_LOOKUP_MIN_INTERVAL_MS = 1100;
const ONLINE_LOOKUP_TIMEOUT_MS = 2500;

export async function lookupVendorOnline(mac: string | null | undefined): Promise<string | null> {
  if (!mac) return null;
  const prefix = mac.toUpperCase().slice(0, 8);
  if (onlineVendorCache.has(prefix)) return onlineVendorCache.get(prefix) ?? null;

  let result: string | null = null;
  const task = onlineLookupQueue.then(async () => {
    const wait = ONLINE_LOOKUP_MIN_INTERVAL_MS - (Date.now() - lastOnlineLookupAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastOnlineLookupAt = Date.now();
    try {
      const res = await fetch(`https://api.macvendors.com/${prefix}`, { signal: AbortSignal.timeout(ONLINE_LOOKUP_TIMEOUT_MS) });
      if (res.ok) {
        const text = (await res.text()).trim();
        result = text || null;
      }
    } catch {
      result = null;
    }
  });
  onlineLookupQueue = task.catch(() => undefined);
  await task;

  onlineVendorCache.set(prefix, result);
  return result;
}

// Broad device-class taxonomy for the IP Range Scanner and Switching tab. Matching is done via
// lowercase substring against the vendor string rather than exact equality, since the online
// fallback above returns full IEEE-registered legal names (e.g. "Sonos, Inc.", "Raspberry Pi
// Trading Ltd") that won't exact-match the short curated names in OUI_PREFIXES.
const CAMERA_VENDORS = ["hikvision", "dahua", "axis communications"];
const NETWORKING_VENDORS = ["cisco", "tp-link", "tp link", "netgear", "ubiquiti", "d-link", "mikrotik", "juniper", "aruba networks", "fortinet", "huawei technologies"];
const VIRTUAL_VENDORS = ["vmware", "virtualbox", "hyper-v", "qemu", "kvm virtual machine", "xensource"];
const RASPBERRY_PI_VENDORS = ["raspberry pi"];
const LIGHTING_VENDORS = ["signify", "philips", "lifx", "lutron", "wiz connected"];
const SOUND_VENDORS = ["sonos", "bose corporation", "yamaha corporation", "denon", "bang & olufsen", "harman"];
const IOT_VENDORS = ["espressif", "nest labs", "tuya", "shelly", "particle industries", "xiaomi", "amazon technologies", "roborock", "ecobee", "google, inc", "google llc"];
const COMPUTER_VENDORS = ["dell", "hewlett packard", "hp inc", "lenovo", "intel corporate", "apple", "microsoft surface", "asustek", "acer"];

function vendorMatches(vendor: string, needles: string[]): boolean {
  const v = vendor.toLowerCase();
  return needles.some((n) => v.includes(n));
}

export function guessDeviceType(vendor: string | null, openPorts: number[] = []): string | null {
  if (vendor && vendorMatches(vendor, CAMERA_VENDORS)) return "IP Camera / NVR";
  if (vendor && vendorMatches(vendor, NETWORKING_VENDORS)) return "Network Switching / Routing";
  if (vendor && vendorMatches(vendor, VIRTUAL_VENDORS)) return "Virtual Machine";
  if (vendor && vendorMatches(vendor, RASPBERRY_PI_VENDORS)) return "Raspberry Pi";
  if (vendor && vendorMatches(vendor, LIGHTING_VENDORS)) return "Lighting";
  if (vendor && vendorMatches(vendor, SOUND_VENDORS)) return "Sound System";
  if (vendor && vendorMatches(vendor, IOT_VENDORS)) return "IoT Device";
  if (vendor && vendorMatches(vendor, COMPUTER_VENDORS)) return "Computer";
  if (openPorts.includes(554)) return "IP Camera / NVR";
  if (openPorts.includes(3389)) return "Computer";
  if (openPorts.includes(631) || openPorts.includes(9100)) return "Printer";
  if (openPorts.includes(22) && !openPorts.includes(3389)) return "Linux / Network Device";
  if (openPorts.includes(80) || openPorts.includes(443)) return "Networked Device (Web Interface)";
  return vendor ? "Unclassified Device" : null;
}
