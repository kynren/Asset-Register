import { useEffect, useState } from "react";
import { getAccessToken } from "../api/tokenStore";

interface HeartbeatEntry {
  alive: boolean;
  responseTimeMs: number | null;
}

type Listener = (map: Map<number, HeartbeatEntry>) => void;

// Module-level (not per-hook-instance) so every mounted AssetTelemetryCell shares one SSE
// connection to /assets/status-stream instead of each table row polling /ping on its own timer —
// the backend already sweeps every asset on a shared cycle (see server's lib/assetHeartbeat.ts),
// this just fans that one feed out to however many rows are on screen right now.
let sharedMap = new Map<number, HeartbeatEntry>();
const listeners = new Set<Listener>();
let abortController: AbortController | null = null;
let refCount = 0;

function notify() {
  for (const listener of listeners) listener(sharedMap);
}

async function connect() {
  const controller = new AbortController();
  abortController = controller;
  const token = getAccessToken();

  try {
    const res = await fetch("/api/assets/status-stream", {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: controller.signal,
    });
    if (!res.ok || !res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        try {
          const evt = JSON.parse(dataLine.slice(6));
          if (evt.type === "snapshot" || evt.type === "update") {
            const next = new Map(sharedMap);
            for (const a of evt.assets as { id: number; alive: boolean; responseTimeMs: number | null }[]) {
              next.set(a.id, { alive: a.alive, responseTimeMs: a.responseTimeMs });
            }
            sharedMap = next;
            notify();
          }
        } catch {
          // ignore malformed chunk boundary
        }
      }
    }
  } catch (err: unknown) {
    if ((err as { name?: string })?.name !== "AbortError" && refCount > 0) {
      // Connection dropped (server restart, network blip) — reconnect if anyone's still watching.
      setTimeout(() => {
        if (refCount > 0) connect();
      }, 3000);
    }
  }
}

function acquire() {
  refCount += 1;
  if (refCount === 1) connect();
}

function release() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0) {
    abortController?.abort();
    abortController = null;
    sharedMap = new Map();
  }
}

export function useAssetHeartbeatStream(assetId: number): HeartbeatEntry | undefined {
  const [entry, setEntry] = useState<HeartbeatEntry | undefined>(() => sharedMap.get(assetId));

  useEffect(() => {
    acquire();
    const listener: Listener = (map) => setEntry(map.get(assetId));
    listeners.add(listener);
    setEntry(sharedMap.get(assetId));
    return () => {
      listeners.delete(listener);
      release();
    };
  }, [assetId]);

  return entry;
}
