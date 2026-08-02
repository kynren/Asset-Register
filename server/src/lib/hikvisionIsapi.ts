import crypto from "crypto";
import { parseStringPromise } from "xml2js";
import { isNetworkRelayEnabled } from "../modules/network/scan.service";
import { relayAwareFetch } from "./relayTransport";

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

/**
 * Issues an HTTP request, transparently handling a Digest (or Basic) auth challenge. When the
 * on-prem relay agent is enabled, the whole two-roundtrip digest dance happens on the agent's
 * side of the LAN instead (Python `requests`' HTTPDigestAuth does this internally in one call) —
 * the server never sees the device's 401/challenge, it just gets back the final result.
 */
async function digestFetch(
  method: string,
  url: string,
  username: string,
  password: string,
  options?: { body?: string; contentType?: string; timeoutMs?: number }
): Promise<{ status: number; ok: boolean; headers: { get(name: string): string | null }; text(): Promise<string>; json(): Promise<unknown> }> {
  const { body, contentType, timeoutMs = 6000 } = options ?? {};

  if (await isNetworkRelayEnabled()) {
    const headers: Record<string, string> = {};
    if (body && contentType) headers["Content-Type"] = contentType;
    return relayAwareFetch(url, { method, headers, body, digestAuth: { username, password }, timeoutMs });
  }

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

export type DoorControlAction = "open" | "close" | "alwaysOpen" | "alwaysClose" | "resume";

/**
 * PUT /ISAPI/AccessControl/RemoteControl/door/{doorNumber} — remote door control. Hikvision's
 * `cmd` field supports five values: `open`/`close` are momentary (the door re-locks per its own
 * configured relock delay), `alwaysOpen`/`alwaysClose` override the door into a held state until
 * explicitly changed, and `resume` cancels an always-open/always-close override and returns the
 * door to its normal schedule-driven behavior.
 */
export async function controlDoor(
  hostname: string,
  port: number | null | undefined,
  username: string,
  password: string,
  doorNumber: number,
  action: DoorControlAction
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
  /** Physical door-contact position (is the door itself open or closed). */
  doorState: "open" | "closed" | "unknown";
  /** Whether the electric lock/strike is engaged. Not every model/firmware reports this
   * alongside door-contact state — "unknown" here means the caller should leave whatever
   * lockState is already on record (e.g. from the last control command) rather than overwrite
   * a known value with a guess. */
  lockState: "locked" | "unlocked" | "unknown";
}

/**
 * GET /ISAPI/AccessControl/Door/status/<doorNo> — attempted real-time physical door state for
 * one door.
 *
 * Unlike this file's other AccessControl endpoints, this one is NOT independently documented —
 * no path-segment "Door/status/<doorNo>" GET appears in Hikvision's own community-referenced
 * ISAPI guides, which only document PUT RemoteControl/door/<doorNo> for door *control*, never a
 * GET for door *status*. It was inferred by analogy with DoorStatusPlan/<DoorNo>. Real hardware
 * testing (2026-08) has since falsified both forms tried: the bulk "all doors" query returned
 * HTTP 400, and this per-door path form also returns HTTP 400 on the same controller (firmware
 * V1.1.1, generic "Access Controller" model) — while /ISAPI/System/deviceInfo and the ISAPI
 * digest-auth handshake itself work fine on that device, so this is specifically about this
 * resource, not connectivity/auth. Treat a failure here as "live status unavailable", not proof
 * the door itself doesn't exist — discoverDoors (accessControl.routes.ts) still adds a door row
 * from getDoorCapabilities' count even when this call fails, just without a known open/locked
 * state.
 */
export async function getDoorStatus(
  hostname: string,
  port: number | null | undefined,
  username: string,
  password: string,
  doorNumber: number
): Promise<{ ok: boolean; door: IsapiDoorStatus | null; notFound: boolean; authFailed: boolean; unreachable: boolean; message: string }> {
  const url = jsonUrl(hostname, port, `/ISAPI/AccessControl/Door/status/${doorNumber}`);
  try {
    const res = await digestFetch("GET", url, username, password);
    if (res.status === 401) {
      return { ok: false, door: null, notFound: false, authFailed: true, unreachable: false, message: "Authentication failed — check the ISAPI username/password." };
    }
    if (res.status === 404) {
      return { ok: true, door: null, notFound: true, authFailed: false, unreachable: false, message: `Door ${doorNumber} not found on this controller.` };
    }
    if (!res.ok) {
      // Real hardware (multiple firmware versions) has been observed returning a non-404 error
      // (commonly HTTP 400) for THIS status endpoint on doors that genuinely exist — see the
      // module doc comment above. So a non-404, non-401 failure here is not treated as proof the
      // door doesn't exist, only that its live status can't be read this way.
      return { ok: false, door: null, notFound: false, authFailed: false, unreachable: false, message: `Device responded with HTTP ${res.status} reading door ${doorNumber} status.` };
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, any>;
    const d = data.DoorStatus ?? data.doorStatus ?? data;
    const doorRaw = String(d.doorState ?? d.status ?? "").toLowerCase();
    const doorState: IsapiDoorStatus["doorState"] = doorRaw.includes("open") ? "open" : doorRaw.includes("clos") ? "closed" : "unknown";

    const lockRaw = String(d.lockState ?? d.doorLockStatus ?? d.lockStatus ?? "").toLowerCase();
    const lockState: IsapiDoorStatus["lockState"] = lockRaw.includes("unlock")
      ? "unlocked"
      : lockRaw.includes("lock")
        ? "locked"
        : "unknown";

    return { ok: true, door: { doorNumber, doorState, lockState }, notFound: false, authFailed: false, unreachable: false, message: `Read status for door ${doorNumber}.` };
  } catch (err) {
    // A thrown exception (timeout, ECONNREFUSED, DNS failure, ...) means the device itself
    // couldn't be reached at all — unlike an HTTP-level error, this genuinely says nothing is
    // there to probe further, so the caller stops rather than guessing at more door numbers.
    return { ok: false, door: null, notFound: false, authFailed: false, unreachable: true, message: `Could not reach device: ${connectionErrorMessage(err)}` };
  }
}

/**
 * Asks the controller how many physical doors it actually supports (e.g. a DS-K2604 reports 4,
 * a DS-K2601 reports 1). discoverDoors (accessControl.routes.ts) calls this first and then reads
 * every door number in that range via getDoorStatus, so a multi-door panel's doors are all
 * discovered up front rather than requiring the user to add each one manually. If a device
 * doesn't report a capability count, discoverDoors falls back to probing door numbers
 * incrementally instead.
 *
 * Per Hikvision's own ISAPI documentation (tpp.hikvision.com), the authoritative source for max
 * door count is the door-control-schedule capability doc, JSON_Cap_DoorStatusPlan, served at
 * `/ISAPI/AccessControl/DoorStatusPlan/capabilities` — "you can get the maximum number of doors
 * supported by the device from the configuration capability of the door control schedule." This
 * is tried first; `/ISAPI/AccessControl/Door/capabilities` (also a real, documented path, per
 * Hikvision's Wiki page listing) is tried as a fallback in case a given firmware only implements
 * one of the two. If neither yields a parseable count, this returns `count: null` rather than
 * guessing — the caller falls back to whatever getDoorStatus reported.
 */
export async function getDoorCapabilities(
  hostname: string,
  port: number | null | undefined,
  username: string,
  password: string
): Promise<{ ok: boolean; count: number | null; message: string }> {
  function extractMaxDoorNo(data: Record<string, any>): number | null {
    const doorNoRange =
      data.DoorStatusPlanCap?.doorNo ?? data.DoorCap?.doorNo ?? data.DoorCaps?.doorNo ?? data.doorNo;
    const max = doorNoRange?.["@max"] ?? doorNoRange?.max;
    return max !== undefined ? Number(max) : null;
  }

  async function tryEndpoint(path: string): Promise<{ ok: boolean; count: number | null; notFound?: boolean; authFailed?: boolean; httpStatus?: number } | { networkError: unknown }> {
    try {
      const res = await digestFetch("GET", jsonUrl(hostname, port, path), username, password);
      if (res.status === 401) return { ok: false, count: null, authFailed: true };
      if (res.status === 404) return { ok: false, count: null, notFound: true };
      if (!res.ok) return { ok: false, count: null, httpStatus: res.status };
      const data = (await res.json().catch(() => ({}))) as Record<string, any>;
      return { ok: true, count: extractMaxDoorNo(data) };
    } catch (err) {
      return { networkError: err };
    }
  }

  const first = await tryEndpoint("/ISAPI/AccessControl/DoorStatusPlan/capabilities");
  if ("networkError" in first) return { ok: false, count: null, message: `Could not reach device: ${connectionErrorMessage(first.networkError)}` };
  if (first.authFailed) return { ok: false, count: null, message: "Authentication failed — check the ISAPI username/password." };
  if (first.ok && first.count) return { ok: true, count: first.count, message: `This controller supports ${first.count} door(s).` };

  // Fall through to the second (also-documented) path whenever the first didn't yield a usable
  // count — whether that's a clean 404 or some other HTTP error. Real hardware in the field has
  // returned non-404 errors (e.g. 400) for a resource its firmware simply doesn't implement, so
  // treating only 404 as "try the fallback" was too strict and caused door discovery to abort
  // entirely instead of trying the second endpoint or, failing that, probing door numbers directly.
  const second = await tryEndpoint("/ISAPI/AccessControl/Door/capabilities");
  if ("networkError" in second) return { ok: false, count: null, message: `Could not reach device: ${connectionErrorMessage(second.networkError)}` };
  if (second.authFailed) return { ok: false, count: null, message: "Authentication failed — check the ISAPI username/password." };
  if (second.ok && second.count) return { ok: true, count: second.count, message: `This controller supports ${second.count} door(s).` };

  // Neither endpoint gave us a door count, but that's not a hard failure — the device is reachable
  // and authenticated, it just doesn't expose a capabilities count on either known path. The caller
  // treats count:null as "unknown" and falls back to probing door numbers directly.
  return { ok: true, count: null, message: "This device did not report a door count on either known capabilities endpoint — probing door numbers directly instead." };
}

/**
 * POST /ISAPI/AccessControl/UserInfo/Record — provisions (or overwrites) one person record on
 * the controller under employeeNo, with an optional validity window enforced by the device
 * itself. This is the same call Hikvision's own iVMS-4200 "Person" screen makes when adding
 * someone to a door controller.
 *
 * `rightPlan`, when given, mirrors Hikvision's own per-door schedule assignment: each entry is
 * one door this person may use plus a `planTemplateNo` referencing a schedule template already
 * configured on the controller (device-side, not something this app authors). `doorRight` (a
 * comma-joined list of door numbers) is set alongside it, matching the field Hikvision's own
 * UserInfo/Record body carries next to RightPlan. Omitting `rightPlan` entirely (undefined, not
 * an empty array) leaves the controller's own default access behavior for that person in place.
 */
export async function createOrUpdateAcsUser(
  hostname: string,
  port: number | null | undefined,
  username: string,
  password: string,
  params: {
    employeeNo: string;
    name: string;
    validFrom?: Date | null;
    validTo?: Date | null;
    rightPlan?: { doorNumber: number; planTemplateNo: string }[];
  }
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
      ...(params.rightPlan && params.rightPlan.length > 0
        ? {
            doorRight: params.rightPlan.map((r) => r.doorNumber).join(","),
            RightPlan: params.rightPlan.map((r) => ({ doorNo: r.doorNumber, planTemplateNo: r.planTemplateNo })),
          }
        : {}),
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

/**
 * GET /ISAPI/AccessControl/CaptureCardInfo — reads whatever card is presented at a reader wired
 * to this controller, for card-enrollment UIs ("tap a card, its number appears in the field").
 * This is a real, documented Hikvision ISAPI endpoint (confirmed via Hikvision's own tpp.hikvision.com
 * Wiki, which lists both `/ISAPI/AccessControl/CaptureCardInfo?format=json` and
 * `/ISAPI/AccessControl/CaptureCardInfo/capabilities?format=json`) — an earlier version of this
 * function guessed a `CaptureCardId` path that doesn't appear in Hikvision's own documentation
 * and has been corrected.
 *
 * This only reads via a reader wired to a *network-connected* access control panel ("Remote"
 * mode in Hikvision's own card-enrollment dialog). It deliberately does NOT attempt to read a
 * USB-attached desktop card enrollment station (Hikvision's DS-K1F100 series etc., "Local" mode)
 * — those connect directly to a PC over USB with no IP/ISAPI stack at all, so a browser-based web
 * app has no way to reach one; only desktop client software with local USB driver access
 * (iVMS-4200/HikCentral) can. The frontend disables Read entirely when the user selects Local
 * mode rather than attempting (and silently failing) a network call that could never work.
 *
 * Blocks on the device side until a card is presented or it times out, so it's given a much
 * longer timeout than this module's other calls (real desktop enrollment tools give an operator
 * ~10-15s to tap the card). A device that reports no card presented within that window is a
 * normal outcome, not an error — the caller should let the user try again.
 */
export async function captureCardId(
  hostname: string,
  port: number | null | undefined,
  username: string,
  password: string
): Promise<{ ok: boolean; cardNo: string | null; message: string }> {
  const url = jsonUrl(hostname, port, "/ISAPI/AccessControl/CaptureCardInfo");
  try {
    const res = await digestFetch("GET", url, username, password, { timeoutMs: 15000 });
    if (res.status === 401) return { ok: false, cardNo: null, message: "Authentication failed — check the ISAPI username/password." };
    if (res.status === 404) return { ok: false, cardNo: null, message: "This device does not support card capture (endpoint not supported on this model/firmware)." };
    if (!res.ok) return { ok: false, cardNo: null, message: `Device responded with HTTP ${res.status}.` };

    const data = (await res.json().catch(() => ({}))) as Record<string, any>;
    const cardNo = data.CaptureCardInfo?.cardNo ?? data.CardNoInfo?.cardNo ?? data.cardNo ?? null;
    return cardNo
      ? { ok: true, cardNo: String(cardNo), message: `Read card ${cardNo}.` }
      : { ok: false, cardNo: null, message: "No card was presented at the reader — try again and tap the card within the time limit." };
  } catch (err) {
    return { ok: false, cardNo: null, message: `Could not reach device: ${connectionErrorMessage(err)}` };
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

