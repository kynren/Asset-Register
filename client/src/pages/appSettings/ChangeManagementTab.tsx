import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Skeleton } from "../../components/Skeleton";
import { StatusBadge } from "../../components/StatusBadge";
import { CHANGE_TYPE_INFO, ScheduledChangeRow } from "./scheduledChangeTypes";
import { ScheduledChangeDetailModal } from "./ScheduledChangeDetailModal";

export function ChangeManagementTab({ onEdit }: { onEdit: (change: ScheduledChangeRow) => void }) {
  const [selected, setSelected] = useState<ScheduledChangeRow | null>(null);

  const { data: changes, isLoading } = useQuery({
    queryKey: ["scheduled-changes"],
    queryFn: async () => (await axiosClient.get("/scheduled-changes")).data as ScheduledChangeRow[],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="stack gap-2">
        <Skeleton height={70} />
        <Skeleton height={70} />
        <Skeleton height={70} />
      </div>
    );
  }

  if (!changes || changes.length === 0) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0, textAlign: "center", padding: "24px 0" }}>
          No scheduled or past changes yet for this organization. Changes you publish or schedule from System
          Settings, Backups, or Roles &amp; Permissions will show up here as a timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="mt-0">Change Management</h3>
      <p className="muted" style={{ marginTop: -6 }}>
        Every scheduled and past change for this organization, most recent first. Click any entry for full details.
      </p>

      <div className="timeline-rail stack gap-3" style={{ marginTop: 16 }}>
        {changes.map((change, idx) => (
          <div
            key={change.id}
            className="timeline-item"
            style={{ animationDelay: `${Math.min(idx, 12) * 40}ms` }}
          >
            <span
              className="timeline-dot"
              style={{ background: DOT_COLOR[change.status], animationDelay: `${Math.min(idx, 12) * 40 + 120}ms` }}
            />
            <button
              className="card"
              style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "1px solid var(--color-border)", padding: "10px 14px" }}
              onClick={() => setSelected(change)}
            >
              <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div className="row gap-2" style={{ alignItems: "center" }}>
                    <span className="badge badge-neutral">{CHANGE_TYPE_INFO[change.changeType].label}</span>
                    <StatusBadge status={change.status} />
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 13 }}>{change.summary}</p>
                </div>
                <div style={{ textAlign: "right", fontSize: 11 }} className="muted">
                  {change.status === "PENDING" ? (
                    <div>Scheduled for<br /><strong>{dayjs(change.scheduledFor).format("DD MMM YYYY, HH:mm")}</strong></div>
                  ) : change.status === "PUBLISHED" && change.publishedAt ? (
                    <div>Published<br /><strong>{dayjs(change.publishedAt).format("DD MMM YYYY, HH:mm")}</strong></div>
                  ) : change.status === "CANCELLED" && change.cancelledAt ? (
                    <div>Cancelled<br /><strong>{dayjs(change.cancelledAt).format("DD MMM YYYY, HH:mm")}</strong></div>
                  ) : (
                    <div>Updated<br /><strong>{dayjs(change.updatedAt).format("DD MMM YYYY, HH:mm")}</strong></div>
                  )}
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>

      {selected && (
        <ScheduledChangeDetailModal
          change={selected}
          onClose={() => setSelected(null)}
          onEdit={(c) => { setSelected(null); onEdit(c); }}
        />
      )}
    </div>
  );
}

const DOT_COLOR: Record<ScheduledChangeRow["status"], string> = {
  PENDING: "var(--color-warning)",
  PUBLISHED: "var(--color-success)",
  CANCELLED: "var(--color-text-muted)",
  FAILED: "var(--color-danger)",
};
