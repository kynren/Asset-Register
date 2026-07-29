import crypto from "crypto";
import { parseStringPromise } from "xml2js";

/**
 * Real client for Hikvision's ISAPI (Intelligent Security API) — the same documented,
 * HTTP-based protocol Hikvision's own iVMS-4200 client uses (alongside their proprietary
 * binary HCNetSDK, which isn't practical to embed in a Node service) to talk to NVRs, DVRs,
 * and cameras: device identification, the channel list an NVR manages ("groups" in the
 * iVMS resource tree), and stream/snapshot URLs. Auth is HTTP Digest per the ISAPI spec,
 * implemented here by hand since Node's fetch has no built-in digest support.
 */

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
}

function md5(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex");
}

function parseWwwAuthenticate(header: string): DigestChallenge | null {
  const get = (key: string) => {
    const m = header.match(new RegExp(`${key}="?([^",]+)"?`, "i"));
    return m ? m[1] : undefined;
  };
  const realm = get("realm");
  const nonce = get("nonce");
  if (!realm || !nonce) return null;
  return { realm, nonce, qop: get("qop"), opaque: get("opaque") };
}

/** Issues an HTTP request, transparently handling a Digest (or Basic) auth challenge. */
async function digestFetch(method: string, url: string, username: string, password: string, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const first = await fetch(url, { method, signal: controller.signal });
    if (first.status !== 401) return first;

    const wwwAuth = first.headers.get("www-authenticate");
    if (!wwwAuth) return first;

    if (/^basic/i.test(wwwAuth)) {
      const basic = Buffer.from(`${username}:${password}`).toString("base64");
      return fetch(url, { method, headers: { Authorization: `Basic ${basic}` }, signal: controller.signal });
    }

    const challenge = parseWwwAuthenticate(wwwAuth);
    if (!challenge) return first;

    const { realm, nonce, qop, opaque } = challenge;
    const { pathname, search } = new URL(url);
    const uri = pathname + search;
    const ha1 = md5(`${username}:${realm}:${password}`);
    const ha2 = md5(`${method}:${uri}`);
    const nc = "00000001";
    const cnonce = crypto.randomBytes(8).toString("hex");
    const response = qop ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${nonce}:${ha2}`);

    let authHeader = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
    if (qop) authHeader += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
    if (opaque) authHeader += `, opaque="${opaque}"`;

    return fetch(url, { method, headers: { Authorization: authHeader }, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function baseUrl(hostname: string, port?: number | null): string {
  return `http://${hostname}:${port ?? 80}`;
}

function connectionErrorMessage(err: unknown): string {
  const e = err as { name?: string; code?: string; message?: string };
  if (e?.name === "AbortError") return "Connection timed out.";
  if (e?.code === "ECONNREFUSED") return "Connection refused — nothing is listening on that host/port.";
  if (e?.code === "EHOSTUNREACH" || e?.code === "ENETUNREACH") return "Host unreachable.";
  return e?.message ?? "Unknown network error.";
}

export interface IsapiDeviceInfo {
  deviceName: string;
  model: string;
  serialNumber: string;
  firmwareVersion: string;
  deviceType: string;
}

/** GET /ISAPI/System/deviceInfo — real device identification, same call iVMS makes when adding a device. */
export async function getDeviceInfo(
  hostname: string,
  port: number | null | undefined,
  username: string,
  password: string
): Promise<{ ok: boolean; info: IsapiDeviceInfo | null; message: string }> {
  const url = `${baseUrl(hostname, port)}/ISAPI/System/deviceInfo`;
  try {
    const res = await digestFetch("GET", url, username, password);
    if (res.status === 401) return { ok: false, info: null, message: "Authentication failed — check the ISAPI username/password." };
    if (!res.ok) return { ok: false, info: null, message: `Device responded with HTTP ${res.status}.` };

    const xml = await res.text();
    const parsed = await parseStringPromise(xml, { explicitArray: false });
    const d = parsed.DeviceInfo ?? {};
    const info: IsapiDeviceInfo = {
      deviceName: d.deviceName ?? "",
      model: d.model ?? "",
      serialNumber: d.serialNumber ?? "",
      firmwareVersion: d.firmwareVersion ?? "",
      deviceType: d.deviceType ?? "",
    };
    return { ok: true, info, message: `Connected via ISAPI — ${info.deviceName || info.model || "device"} responded.` };
  } catch (err) {
    return { ok: false, info: null, message: `Could not connect via ISAPI: ${connectionErrorMessage(err)}` };
  }
}

export interface IsapiChannel {
  channelNumber: number;
  name: string;
  ipAddress: string | null;
  port: number | null;
}

/**
 * GET /ISAPI/ContentMgmt/InputProxy/channels — the real list of IP camera channels an NVR
 * manages (Hikvision's "proxy channels"). This is the actual data behind the device group
 * iVMS-4200 shows in its resource tree for an added NVR — not a fabricated channel list.
 */
export async function getInputProxyChannels(
  hostname: string,
  port: number | null | undefined,
  username: string,
  password: string
): Promise<{ ok: boolean; channels: IsapiChannel[]; message: string }> {
  const url = `${baseUrl(hostname, port)}/ISAPI/ContentMgmt/InputProxy/channels`;
  try {
    const res = await digestFetch("GET", url, username, password);
    if (res.status === 401) return { ok: false, channels: [], message: "Authentication failed — check the ISAPI username/password." };
    if (res.status === 404) {
      // Genuinely valid outcome: this device has no proxy channels (e.g. a standalone camera, not an NVR).
      return { ok: true, channels: [], message: "This device reported no managed camera channels (likely a standalone camera, not an NVR/DVR)." };
    }
    if (!res.ok) return { ok: false, channels: [], message: `Device responded with HTTP ${res.status}.` };

    const xml = await res.text();
    const parsed = await parseStringPromise(xml, { explicitArray: false });
    let entries = parsed.InputProxyChannelList?.InputProxyChannel ?? [];
    if (!Array.isArray(entries)) entries = [entries];

    const channels: IsapiChannel[] = entries.map((ch: Record<string, unknown>) => {
      const descriptor = (ch.sourceInputPortDescriptor ?? {}) as Record<string, unknown>;
      return {
        channelNumber: Number(ch.id) || 0,
        name: String(ch.name ?? `Channel ${ch.id}`),
        ipAddress: (descriptor.ipAddress as string) ?? null,
        port: descriptor.managePortNo ? Number(descriptor.managePortNo) : null,
      };
    });

    return { ok: true, channels, message: `Found ${channels.length} camera channel(s) via ISAPI.` };
  } catch (err) {
    return { ok: false, channels: [], message: `Could not connect via ISAPI: ${connectionErrorMessage(err)}` };
  }
}

/** Hikvision's standard RTSP path convention: channel 1 main stream = 101, sub stream = 102, channel 2 = 201/202, etc. */
export function isapiStreamChannelId(channelNumber: number, streamType: "main" | "sub" = "main"): string {
  return `${channelNumber}0${streamType === "main" ? 1 : 2}`;
}

export function buildIsapiRtspUrl(hostname: string, rtspPort: number | null | undefined, username: string, password: string, channelNumber: number, streamType: "main" | "sub" = "main"): string {
  const auth = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : "";
  return `rtsp://${auth}${hostname}:${rtspPort ?? 554}/Streaming/Channels/${isapiStreamChannelId(channelNumber, streamType)}`;
}

