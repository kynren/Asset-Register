import { Response } from "express";
import { prisma, currentSchemaName } from "../config/prisma";
import { runForEachOrganization } from "../config/controlPlane";
import { mapLimit } from "./concurrency";
import { relayAwarePing } from "./relayTransport";

export interface AssetHeartbeatResult {
  id: number;
  assetTag: string;
  alive: boolean;
  responseTimeMs: number | null;
}

// Every OS ping spawns a real process (~800ms-1.8s each, see ping.ts) — bounding concurrency
// keeps a sweep of a few hundred assets from forking hundreds of processes at once, same cap
// style as scan.service.ts's SCAN_CONCURRENCY for IP range scans.
const PING_CONCURRENCY = 20;

// The interval the user actually needs is "instant status changes in the UI", not literal
// per-asset per-second pings (infeasible — see ping.ts's process-per-ping cost). A short shared
// sweep + SSE push gets there: every asset is re-checked on this cadence and any client watching
// gets the new snapshot the moment this tick finishes, not on its own poll timer.
const TICK_MS = 5000;

const snapshots = new Map<string, AssetHeartbeatResult[]>();
const subscribers = new Map<string, Set<Response>>();

export function getAssetHeartbeatSnapshot(schemaName: string): AssetHeartbeatResult[] {
  return snapshots.get(schemaName) ?? [];
}

export function subscribeToAssetHeartbeat(schemaName: string, res: Response): () => void {
  let set = subscribers.get(schemaName);
  if (!set) {
    set = new Set();
    subscribers.set(schemaName, set);
  }
  set.add(res);
  return () => {
    subscribers.get(schemaName)?.delete(res);
  };
}

function broadcast(schemaName: string, results: AssetHeartbeatResult[]) {
  snapshots.set(schemaName, results);
  const set = subscribers.get(schemaName);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify({ type: "update", assets: results })}\n\n`;
  for (const res of set) res.write(payload);
}

async function tick(): Promise<void> {
  const schemaName = currentSchemaName();
  // Harness has its own dedicated register/view (not part of general Asset Inventory browsing —
  // see assets.controller.ts's list()/stats()), so it's excluded here too.
  const assets = await prisma.asset.findMany({
    where: { NOT: { category: { name: "Harness" } } },
    select: { id: true, assetTag: true, staticIpAddress: true },
  });

  if (assets.length === 0) {
    broadcast(schemaName, []);
    return;
  }

  const results = await mapLimit(assets, PING_CONCURRENCY, async (asset) => {
    const result = await relayAwarePing(asset.staticIpAddress || asset.assetTag);
    return { id: asset.id, assetTag: asset.assetTag, alive: result.alive, responseTimeMs: result.responseTimeMs };
  });

  broadcast(schemaName, results);
}

let intervalHandle: NodeJS.Timeout | null = null;

export function startAssetHeartbeatScheduler() {
  if (intervalHandle) return;
  const run = () => {
    runForEachOrganization(tick).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Asset heartbeat sweep failed:", err);
    });
  };
  run();
  intervalHandle = setInterval(run, TICK_MS);
  intervalHandle.unref();
}
