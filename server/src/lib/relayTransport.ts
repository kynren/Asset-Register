import { isNetworkRelayEnabled } from "../modules/network/scan.service";
import { pingHost, PingResult } from "./ping";
import { enqueueAndAwaitHttp, enqueueAndAwaitPing } from "./relayDeviceJobs";

// Single choke point every direct device-facing network call in this codebase routes through
// (hikvisionIsapi.ts's digestFetch, shellyApi.ts, tasmotaApi.ts, iotDeviceApi.ts's generic-HTTP
// branch, and asset ping in assetHeartbeat.ts/assets.controller.ts). When the on-prem relay
// agent is disabled (the default — see System Settings → Network Relay Agent), these behave
// exactly as a direct fetch()/pingHost() call always has. When enabled, the actual network call
// happens on the relay agent's machine instead — see relayDeviceJobs.ts for the job queue this
// hands off to, and agent/kynren_network_relay.py's fetch_next_device_job()/HTTP+PING handlers
// for the other end.

export interface RelayAwareFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  digestAuth?: { username: string; password: string };
  timeoutMs?: number;
}

export interface RelayAwareResponse {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

const DEFAULT_TIMEOUT_MS = 8000;

export async function relayAwareFetch(url: string, init: RelayAwareFetchInit = {}): Promise<RelayAwareResponse> {
  if (!(await isNetworkRelayEnabled())) {
    return fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: init.signal,
    });
  }

  const result = await enqueueAndAwaitHttp({
    url,
    method: init.method ?? "GET",
    headers: init.headers,
    body: init.body,
    digestAuth: init.digestAuth,
    timeoutMs: init.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  if (!result.ok) throw new Error(result.errorMessage ?? "Relay request failed.");

  const bodyBuffer = Buffer.from(result.responseBodyBase64 ?? "", "base64");
  const headers = result.responseHeaders ?? {};
  const status = result.responseStatus ?? 0;

  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null },
    text: async () => bodyBuffer.toString("utf8"),
    json: async () => JSON.parse(bodyBuffer.toString("utf8")),
    arrayBuffer: async () => bodyBuffer.buffer.slice(bodyBuffer.byteOffset, bodyBuffer.byteOffset + bodyBuffer.byteLength) as ArrayBuffer,
  };
}

export async function relayAwarePing(target: string, timeoutMs = 800): Promise<PingResult> {
  if (!(await isNetworkRelayEnabled())) return pingHost(target, timeoutMs);

  const result = await enqueueAndAwaitPing(target, timeoutMs);
  if (!result.ok) return { alive: false, responseTimeMs: null };
  return { alive: result.alive ?? false, responseTimeMs: result.responseTimeMs ?? null };
}
