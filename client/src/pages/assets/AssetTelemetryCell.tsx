import { useEffect, useState } from "react";
import { axiosClient } from "../../api/axiosClient";

const POLL_MS = 10000;
const MAX_SAMPLES = 10;

function latencyColor(ms: number | null): string {
  if (ms === null) return "var(--color-text-muted)";
  if (ms < 60) return "var(--color-success)";
  if (ms < 150) return "var(--color-warning)";
  return "var(--color-danger)";
}

// Actively looks the asset up on the network by its own asset tag and pings it (see the
// pingAsset backend handler) rather than relying on a passive agent-reported last-seen time —
// this is the only telemetry source for assets that have no linked Device record.
export function AssetTelemetryCell({ assetId }: { assetId: number }) {
  const [alive, setAlive] = useState<boolean | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [samples, setSamples] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    setAlive(null);
    setLatency(null);
    setSamples([]);

    async function poll() {
      try {
        const res = await axiosClient.get(`/assets/${assetId}/ping`);
        if (cancelled) return;
        const ms: number | null = res.data.alive ? res.data.responseTimeMs : null;
        setAlive(Boolean(res.data.alive));
        setLatency(ms);
        if (ms !== null) setSamples((prev) => [...prev.slice(-(MAX_SAMPLES - 1)), ms]);
      } catch {
        if (!cancelled) setAlive(false);
      }
    }

    poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [assetId]);

  if (alive === null) {
    return (
      <span title="Pinging..." style={{ display: "inline-flex", alignItems: "center", width: 10, height: 10, position: "relative" }}>
        <span className="animate-ping" style={{ position: "absolute", inset: 0, borderRadius: "9999px", background: "var(--color-primary)", opacity: 0.6 }} />
        <span style={{ position: "relative", width: 10, height: 10, borderRadius: "9999px", background: "var(--color-primary)" }} />
      </span>
    );
  }

  const sparkPoints = samples
    .map((v, i) => `${(i / Math.max(1, samples.length - 1)) * 40},${14 - Math.min(14, (v / 200) * 14)}`)
    .join(" ");

  return (
    <span className="row gap-1" style={{ fontSize: 12, alignItems: "center" }}>
      <span className={`tag-dot ${alive ? "online" : "offline"}`} />
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
