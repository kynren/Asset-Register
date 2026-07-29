import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { AssetDetail, AuditLogEntry } from "./types";
import { SkeletonTableRows } from "../../../components/Skeleton";

const ACTION_LABELS: Record<string, string> = {
  "asset.create": "Asset created",
  "asset.update": "Asset details updated",
  "asset.delete": "Asset deleted",
  "asset.checkout": "Checked out",
  "asset.checkin": "Checked in",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function actionBadge(action: string): string {
  if (action.includes("delete") || action.includes("checkout")) return "ad-badge-warning";
  if (action.includes("create") || action.includes("checkin")) return "ad-badge-success";
  return "ad-badge-neutral";
}

function formatMetadata(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const entries = Object.entries(metadata).filter(([k]) => !["resourceKey", "id"].includes(k));
  if (entries.length === 0) return null;
  return entries.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join("  ·  ");
}

export function ActivityLogTab({ asset }: { asset: AssetDetail }) {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["asset-history", asset.id],
    queryFn: async () => (await axiosClient.get(`/assets/${asset.id}/history`)).data as AuditLogEntry[],
  });

  return (
    <div>
      <div className="ad-content-header">
        <h2 className="ad-content-title"><Icon name="terminal" size={16} /> Logs</h2>
        <p className="ad-content-subtitle">Every recorded change and action against this asset, most recent first.</p>
      </div>

      <div className="ad-panel">
        {isLoading ? (
          <table className="ad-table">
            <thead>
              <tr><th>Time</th><th>User</th><th>Action</th><th>Details</th></tr>
            </thead>
            <tbody>
              <SkeletonTableRows columns={4} />
            </tbody>
          </table>
        ) : logs && logs.length > 0 ? (
          <table className="ad-table">
            <thead>
              <tr><th>Time</th><th>User</th><th>Action</th><th>Details</th></tr>
            </thead>
            <tbody>
              {logs.map((entry) => {
                const detail = formatMetadata(entry.metadata);
                return (
                  <tr key={entry.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{dayjs(entry.createdAt).format("DD MMM YYYY, HH:mm:ss")}</td>
                    <td>{entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : "System"}</td>
                    <td><span className={`ad-badge ${actionBadge(entry.action)}`}>{actionLabel(entry.action)}</span></td>
                    <td style={{ color: "var(--ad-text-muted)", fontSize: 11 }}>{detail ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="ad-empty">No activity recorded for this asset yet.</div>
        )}
      </div>
    </div>
  );
}
