import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useAuth } from "../../auth/AuthContext";
import { ChipSelect } from "../../components/ChipSelect";

interface StatusSettings {
  checkIntervalMinutes: number;
}

const INTERVAL_PRESETS = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 180, label: "3 hours" },
  { value: 360, label: "6 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "24 hours" },
];

interface ComponentDay {
  date: string;
  status: "OPERATIONAL" | "DEGRADED" | "OUTAGE" | null;
}

interface ComponentStatus {
  key: string;
  name: string;
  currentStatus: "OPERATIONAL" | "DEGRADED" | "OUTAGE" | null;
  currentMessage: string | null;
  uptimePercent: number | null;
  days: ComponentDay[];
}

interface StatusResponse {
  overall: "OPERATIONAL" | "DEGRADED" | "OUTAGE" | "UNKNOWN";
  components: ComponentStatus[];
}

const BAR_COLOR: Record<string, string> = {
  OPERATIONAL: "var(--color-success)",
  DEGRADED: "var(--color-warning)",
  OUTAGE: "var(--color-danger)",
};

const BANNER: Record<StatusResponse["overall"], { label: string; bg: string; fg: string }> = {
  OPERATIONAL: { label: "All Systems Operational", bg: "var(--color-success)", fg: "#fff" },
  DEGRADED: { label: "Some Systems Degraded", bg: "var(--color-warning)", fg: "#fff" },
  OUTAGE: { label: "System Outage", bg: "var(--color-danger)", fg: "#fff" },
  UNKNOWN: { label: "Awaiting First Health Check", bg: "var(--color-text-muted)", fg: "#fff" },
};

function StatusPill({ status }: { status: ComponentStatus["currentStatus"] }) {
  if (!status) return <span className="badge badge-neutral">No data yet</span>;
  const cls = status === "OPERATIONAL" ? "badge-success" : status === "DEGRADED" ? "badge-warning" : "badge-danger";
  const label = status === "OPERATIONAL" ? "Operational" : status === "DEGRADED" ? "Degraded" : "Outage";
  return <span className={`badge ${cls}`}>{label}</span>;
}

function UptimeStrip({ days }: { days: ComponentDay[] }) {
  return (
    <div className="row gap-[2px]" style={{ alignItems: "flex-end", overflowX: "auto" }}>
      {days.map((d) => (
        <div
          key={d.date}
          title={`${dayjs(d.date).format("DD MMM YYYY")} — ${d.status ? d.status.charAt(0) + d.status.slice(1).toLowerCase() : "No data"}`}
          style={{
            width: 4,
            height: 28,
            borderRadius: 2,
            flexShrink: 0,
            background: d.status ? BAR_COLOR[d.status] : "var(--color-border)",
          }}
        />
      ))}
    </div>
  );
}

export function SystemStatusTab() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("app-settings", "edit");
  const [checking, setChecking] = useState(false);
  const [intervalDraft, setIntervalDraft] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["system-status"],
    queryFn: async () => (await axiosClient.get<StatusResponse>("/system/status")).data,
    refetchInterval: 60_000,
  });

  const { data: settings } = useQuery({
    queryKey: ["system-status-settings"],
    queryFn: async () => (await axiosClient.get<StatusSettings>("/system/status/settings")).data,
  });

  useEffect(() => {
    if (settings) setIntervalDraft(settings.checkIntervalMinutes);
  }, [settings]);

  const checkNowMutation = useMutation({
    mutationFn: () => axiosClient.post("/system/status/check-now"),
    onMutate: () => setChecking(true),
    onSettled: () => {
      setChecking(false);
      queryClient.invalidateQueries({ queryKey: ["system-status"] });
    },
  });

  const saveIntervalMutation = useMutation({
    mutationFn: (checkIntervalMinutes: number) => axiosClient.put("/system/status/settings", { checkIntervalMinutes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["system-status-settings"] }),
  });

  if (isLoading || !data) {
    return (
      <div className="stack gap-3">
        <Skeleton height={64} />
        <Skeleton height={200} />
      </div>
    );
  }

  const banner = BANNER[data.overall];
  const intervalDirty = intervalDraft !== null && settings !== undefined && intervalDraft !== settings.checkIntervalMinutes;

  return (
    <div className="stack gap-3">
      <div
        className="row gap-2"
        style={{ alignItems: "center", justifyContent: "space-between", background: banner.bg, color: banner.fg, padding: "16px 20px", borderRadius: 10 }}
      >
        <span style={{ fontWeight: 600, fontSize: 15 }}>{banner.label}</span>
        <button className="btn btn-sm" style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "none" }} onClick={() => checkNowMutation.mutate()} disabled={checking}>
          <Icon name="refresh" size={13} /> {checking ? "Checking..." : "Check Now"}
        </button>
      </div>

      <div className="card row gap-3" style={{ alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
        <div className="stack gap-0.5">
          <span style={{ fontWeight: 600, fontSize: 13 }}>Check interval</span>
          <span className="muted" style={{ fontSize: 11.5 }}>How often each component is automatically re-checked. Default: 1 hour.</span>
        </div>
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <ChipSelect
            style={{ minWidth: 140 }}
            value={intervalDraft != null ? String(intervalDraft) : ""}
            disabled={!canEdit || !settings}
            onChange={(v) => setIntervalDraft(Number(v))}
            options={INTERVAL_PRESETS.map((p) => ({ value: String(p.value), label: p.label }))}
          />
          {canEdit && (
            <button
              className="btn btn-sm btn-primary"
              disabled={!intervalDirty || saveIntervalMutation.isPending}
              onClick={() => intervalDraft !== null && saveIntervalMutation.mutate(intervalDraft)}
            >
              {saveIntervalMutation.isPending ? "Saving..." : "Save"}
            </button>
          )}
        </div>
      </div>

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <span className="muted" style={{ fontSize: 12 }}>
          Uptime over the past 90 days. Bars with no color mean no health check has run for that day yet.
        </span>
      </div>

      <div className="card stack gap-4">
        {data.components.map((c) => (
          <div key={c.key} className="stack gap-1.5" style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 16 }}>
            <div className="row gap-2" style={{ alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</span>
              <StatusPill status={c.currentStatus} />
            </div>
            <UptimeStrip days={c.days} />
            <div className="row gap-2" style={{ justifyContent: "space-between", fontSize: 11.5 }}>
              <span className="muted">90 days ago</span>
              <span className="muted">{c.uptimePercent !== null ? `${c.uptimePercent}% uptime` : "No data yet"}</span>
              <span className="muted">Today</span>
            </div>
            {c.currentMessage && (
              <span className="muted" style={{ fontSize: 11.5 }}>
                {c.currentMessage}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
