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
async function digestFetch(
  method: string,
  url: string,
  username: string,
  password: string,
  options?: { body?: string; contentType?: string; timeoutMs?: number }
): Promise<Response> {
  const { body, contentType, timeoutMs = 6000 } = options ?? {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const baseHeaders: Record<string, string> = {};
  if (body && contentType) baseHeaders["Content-Type"] = contentType;
  try {
    const first = await fetch(url, { method, headers: baseHeaders, body, signal: controller.signal });
    if (first.status !== 401) return first;

    const wwwAuth = first.headers.get("www-authenticate");
    if (!wwwAuth) return first;

    if (/^basic/i.test(wwwAuth)) {
      const basic = Buffer.from(`${username}:${password}`).toString("base64");
      return fetch(url, { method, headers: { ...baseHeaders, Authorization: `Basic ${basic}` }, body, signal: controller.signal });
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

    return fetch(url, { method, headers: { ...baseHeaders, Authorization: authHeader }, body, signal: controller.signal });
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

// ───────────────────────── Access Control (/ISAPI/AccessControl/*) ─────────────────────────
//
// Everything below targets Hikvision's documented door-controller ISAPI surface (the same
// family used above for cameras, just a different endpoint set). Unlike getDeviceInfo and
// getInputProxyChannels — which this codebase has exercised against real hardware — these
// calls are implemented directly from Hikvision's published ISAPI AccessControl spec and have
// NOT been verified against a physical controller. Endpoint paths and the top-level request/
// response envelope (UserInfo/CardInfo/AcsEventCond field names) are standard across
// Hikvision's access-control line, but exact field availability can vary by firmware/model.
// If a call from this section fails against a real device, check that device's own ISAPI
// capabilities document (usually at /ISAPI/System/capabilities) before assuming the code is
// wrong — this mirrors how getInputProxyChannels already treats an unexpected 404 as a
// legitimate "not supported on this device" outcome rather than an error.

function jsonUrl(hostname: string, port: number | null | undefined, path: string): string {
  return `${baseUrl(hostname, port)}${path}?format=json`;
}

/** PUT /ISAPI/AccessControl/RemoteControl/door/{doorNumber} — momentarily open/close one door. */
export async function controlDoor(
  hostname: string,
  port: number | null | undefined,
  username: string,
  password: string,
  doorNumber: number,
  action: "open" | "close"
): Promise<{ ok: boolean; message: string }> {
  const url = `${baseUrl(hostname, port)}/ISAPI/AccessControl/RemoteControl/door/${doorNumber}`;
  const body = `<RemoteControlDoor><cmd>${action}</cmd></RemoteControlDoor>`;
  try {
    const res = await digestFetch("PUT", url, username, password, { body, contentType: "application/xml" });
    if (res.status === 401) return { ok: false, message: "Authentication failed — check the ISAPI username/password." };
    if (!res.ok) return { ok: false, message: `Device responded with HTTP ${res.status}.` };
    return { ok: true, message: `Door ${doorNumber} ${action} command sent.` };
  } catch (err) {
    return { ok: false, message: `Could not reach device: ${connectionErrorMessage(err)}` };
  }
}

export interface IsapiDoorStatus {
  doorNumber: number;
  state: "open" | "closed" | "unknown";
}

/** GET /ISAPI/AccessControl/Door/status — best-effort door lock-state read; see file header note. */
export async function getDoorStatus(
  hostname: string,
  port: number | null | undefined,
  username: string,
  password: string
): Promise<{ ok: boolean; doors: IsapiDoorStatus[]; message: string }> {
  const url = jsonUrl(hostname, port, "/ISAPI/AccessControl/Door/status");
  try {
    const res = await digestFetch("GET", url, username, password);
    if (res.status === 401) return { ok: false, doors: [], message: "Authentication failed — check the ISAPI username/password." };
    if (res.status === 404) return { ok: true, doors: [], message: "This device did not report door status (endpoint not supported on this model/firmware)." };
    if (!res.ok) return { ok: false, doors: [], message: `Device responded with HTTP ${res.status}.` };

    const data = await res.json().catch(() => ({}) as Record<string, unknown>);
    let entries = (data as any).DoorStatus ?? (data as any).doorStatus ?? [];
    if (!Array.isArray(entries)) entries = [entries];

    const doors: IsapiDoorStatus[] = entries.map((d: Record<string, unknown>) => {
      const raw = String(d.doorState ?? d.status ?? "").toLowerCase();
      const state: IsapiDoorStatus["state"] = raw.includes("open") ? "open" : raw.includes("clos") || raw.includes("lock") ? "closed" : "unknown";
      return { doorNumber: Number(d.doorNo ?? d.doorNumber ?? 0), state };
    });
    return { ok: true, doors, message: `Read status for ${doors.length} door(s).` };
  } catch (err) {
    return { ok: false, doors: [], message: `Could not reach device: ${connectionErrorMessage(err)}` };
  }
}

/**
 * POST /ISAPI/AccessControl/UserInfo/Record — provisions (or overwrites) one person record on
 * the controller under employeeNo, with an optional validity window enforced by the device
 * itself. This is the same call Hikvision's own iVMS-4200 "Person" screen makes when adding
 * someone to a door controller.
 */
export async function createOrUpdateAcsUser(
  hostname: string,
  port: number | null | undefined,
  username: string,
  password: string,
  params: { employeeNo: string; name: string; validFrom?: Date | null; validTo?: Date | null }
): Promise<{ ok: boolean; message: string }> {
  const url = jsonUrl(hostname, port, "/ISAPI/AccessControl/UserInfo/Record");
  const hasValidity = Boolean(params.validFrom || params.validTo);
  const body = JSON.stringify({
    UserInfo: {
      employeeNo: params.employeeNo,
      name: params.name,
      userType: "normal",
      Valid: {
        enable: hasValidity,
        beginTime: (params.validFrom ?? new Date()).toISOString(),
        endTime: (params.validTo ?? new Date("2037-12-31T23:59:59")).toISOString(),
      },
    },
  });
  try {
    const res = await digestFetch("POST", url, username, password, { body, contentType: "application/json" });
    if (res.status === 401) return { ok: false, message: "Authentication failed — check the ISAPI username/password." };
    if (!res.ok) return { ok: false, message: `Device responded with HTTP ${res.status} provisioning the person record.` };
    return { ok: true, message: `Person record ${params.employeeNo} provisioned on the controller.` };
  } catch (err) {
    return { ok: false, message: `Could not reach device: ${connectionErrorMessage(err)}` };
  }
}

/** POST /ISAPI/AccessControl/CardInfo/Record — enrolls a card number against an already-provisioned employeeNo. */
export async function enrollCard(
  hostname: string,
  port: number | null | undefined,
  username: string,
  password: string,
  employeeNo: string,
  cardNumber: string
): Promise<{ ok: boolean; message: string }> {
  const url = jsonUrl(hostname, port, "/ISAPI/AccessControl/CardInfo/Record");
  const body = JSON.stringify({ CardInfo: { employeeNo, cardNo: cardNumber, cardType: "normalCard" } });
  try {
    const res = await digestFetch("POST", url, username, password, { body, contentType: "application/json" });
    if (res.status === 401) return { ok: false, message: "Authentication failed — check the ISAPI username/password." };
    if (!res.ok) return { ok: false, message: `Device responded with HTTP ${res.status} enrolling the card.` };
    return { ok: true, message: `Card ${cardNumber} enrolled against ${employeeNo}.` };
  } catch (err) {
    return { ok: false, message: `Could not reach device: ${connectionErrorMessage(err)}` };
  }
}

/** PUT /ISAPI/AccessControl/UserInfo/Delete — removes a person (and their cards/credentials) from the controller. */
export async function deleteAcsUser(
  hostname: string,
  port: number | null | undefined,
  username: string,
  password: string,
  employeeNo: string
): Promise<{ ok: boolean; message: string }> {
  const url = jsonUrl(hostname, port, "/ISAPI/AccessControl/UserInfo/Delete");
  const body = JSON.stringify({ UserInfoDelCond: { EmployeeNoList: [{ employeeNo }] } });
  try {
    const res = await digestFetch("PUT", url, username, password, { body, contentType: "application/json" });
    if (res.status === 401) return { ok: false, message: "Authentication failed — check the ISAPI username/password." };
    if (!res.ok) return { ok: false, message: `Device responded with HTTP ${res.status} removing the person record.` };
    return { ok: true, message: `Person record ${employeeNo} removed from the controller.` };
  } catch (err) {
    return { ok: false, message: `Could not reach device: ${connectionErrorMessage(err)}` };
  }
}

export interface IsapiAccessEvent {
  employeeNo: string | null;
  cardNumber: string | null;
  doorNumber: number | null;
  eventType: string;
  message: string | null;
  occurredAt: Date;
}

/**
 * POST /ISAPI/AccessControl/AcsEvent — pulls a page of access events (grants, denials, door
 * held-open, tamper, etc.) in a time window. Hikvision's search is paginated via
 * searchResultPosition; the caller is expected to loop while `hasMore` is true and results
 * keep coming, bumping searchResultPosition by the page size each time.
 */
export async function searchAcsEvents(
  hostname: string,
  port: number | null | undefined,
  username: string,
  password: string,
  params: { startTime: Date; endTime: Date; searchResultPosition?: number; maxResults?: number }
): Promise<{ ok: boolean; events: IsapiAccessEvent[]; hasMore: boolean; message: string }> {
  const url = jsonUrl(hostname, port, "/ISAPI/AccessControl/AcsEvent");
  const maxResults = params.maxResults ?? 30;
  const body = JSON.stringify({
    AcsEventCond: {
      searchID: crypto.randomUUID(),
      searchResultPosition: params.searchResultPosition ?? 0,
      maxResults,
      major: 0,
      minor: 0,
      startTime: params.startTime.toISOString(),
      endTime: params.endTime.toISOString(),
    },
  });
  try {
    const res = await digestFetch("POST", url, username, password, { body, contentType: "application/json" });
    if (res.status === 401) return { ok: false, events: [], hasMore: false, message: "Authentication failed — check the ISAPI username/password." };
    if (!res.ok) return { ok: false, events: [], hasMore: false, message: `Device responded with HTTP ${res.status} searching events.` };

    const data = await res.json().catch(() => ({}) as Record<string, unknown>);
    const acs = (data as any).AcsEvent ?? {};
    let entries = acs.InfoList ?? [];
    if (!Array.isArray(entries)) entries = entries ? [entries] : [];

    const events: IsapiAccessEvent[] = entries.map((e: Record<string, unknown>) => {
      const time = e.time as string | undefined;
      const doorNo = e.doorNo ?? e.doorNoString;
      return {
        employeeNo: (e.employeeNoString as string) ?? (e.employeeNo as string) ?? null,
        cardNumber: (e.cardNo as string) ?? null,
        doorNumber: doorNo !== undefined ? Number(doorNo) : null,
        eventType: String(e.subEventName ?? e.minor ?? "UNKNOWN"),
        message: (e.remark as string) ?? null,
        occurredAt: time ? new Date(time) : new Date(),
      };
    });
    const numOfMatches = Number(acs.numOfMatches ?? entries.length);
    return { ok: true, events, hasMore: numOfMatches >= maxResults, message: `Found ${events.length} event(s).` };
  } catch (err) {
    return { ok: false, events: [], hasMore: false, message: `Could not reach device: ${connectionErrorMessage(err)}` };
  }
}

