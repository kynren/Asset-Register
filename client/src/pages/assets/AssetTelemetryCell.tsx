import { useEffect, useRef, useState } from "react";
import { useAssetHeartbeatStream } from "../../hooks/useAssetHeartbeatStream";

const MAX_SAMPLES = 10;

function latencyColor(ms: number | null): string {
  if (ms === null) return "var(--color-text-muted)";
  if (ms < 60) return "var(--color-success)";
  if (ms < 150) return "var(--color-warning)";
  return "var(--color-danger)";
}

// Reads from the shared live status feed (see hooks/useAssetHeartbeatStream.ts) rather than
// polling /ping itself — the server-side sweep already pings every asset by its own asset tag (or
// static IP when set) on a shared cycle and pushes changes to every subscribed client instantly.
export function AssetTelemetryCell({ assetId }: { assetId: number }) {
  const entry = useAssetHeartbeatStream(assetId);
  const [samples, setSamples] = useState<number[]>([]);
  const prevAssetId = useRef(assetId);

  if (prevAssetId.current !== assetId) {
    prevAssetId.current = assetId;
    setSamples([]);
  }

  useEffect(() => {
    if (entry?.alive && entry.responseTimeMs !== null) {
      setSamples((prev) => [...prev.slice(-(MAX_SAMPLES - 1)), entry.responseTimeMs as number]);
    }
  }, [entry]);

  if (entry === undefined) {
    return (
      <span title="Pinging..." style={{ display: "inline-flex", alignItems: "center", width: 10, height: 10, position: "relative" }}>
        <span className="animate-ping" style={{ position: "absolute", inset: 0, borderRadius: "9999px", background: "var(--color-primary)", opacity: 0.6 }} />
        <span style={{ position: "relative", width: 10, height: 10, borderRadius: "9999px", background: "var(--color-primary)" }} />
      </span>
    );
  }

  const alive = entry.alive;
  const latency = alive ? entry.responseTimeMs : null;

  const sparkPoints = samples
    .map((v, i) => `${(i / Math.max(1, samples.length - 1)) * 40},${14 - Math.min(14, (v / 200) * 14)}`)
    .join(" ");

  return (
    <span className="row gap-1" style={{ fontSize: 12, alignItems: "center" }}>
      <span className={`tag-dot status-flash ${alive ? "online" : "offline"}`} />
      {alive ? "Online" : "Offline"}
      {alive && latency !== null && <span style={{ color: latencyColor(latency) }}>{latency} ms</span>}
      {samples.length > 1 && (
        <svg width="40" height="14" viewBox="0 0 40 14">
          <polyline points={sparkPoints} fill="none" stroke={latencyColor(latency)} strokeWidth="1.5" />
        </svg>
      )}
    </span>
  );
}
