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

const CAMERA_VENDORS = ["Hikvision", "Dahua Technology", "Axis Communications"];
const NETWORKING_VENDORS = ["Cisco", "TP-Link", "Netgear", "Ubiquiti", "D-Link"];
const VIRTUAL_VENDORS = ["VMware", "VirtualBox", "Microsoft (Hyper-V)", "QEMU/KVM Virtual Machine"];

export function guessDeviceType(vendor: string | null, openPorts: number[] = []): string | null {
  if (vendor && CAMERA_VENDORS.includes(vendor)) return "IP Camera / NVR";
  if (vendor && NETWORKING_VENDORS.includes(vendor)) return "Network Infrastructure";
  if (vendor && VIRTUAL_VENDORS.includes(vendor)) return "Virtual Machine";
  if (vendor === "Raspberry Pi Foundation") return "Single-board Computer";
  if (vendor === "Apple") return openPorts.includes(548) || openPorts.includes(5000) ? "Apple Device" : "Apple Device";
  if (openPorts.includes(554)) return "IP Camera / NVR";
  if (openPorts.includes(3389)) return "Windows PC / Server";
  if (openPorts.includes(631) || openPorts.includes(9100)) return "Printer";
  if (openPorts.includes(22) && !openPorts.includes(3389)) return "Linux / Network Device";
  if (openPorts.includes(80) || openPorts.includes(443)) return "Networked Device (Web Interface)";
  return vendor ? "Unclassified Device" : null;
}
