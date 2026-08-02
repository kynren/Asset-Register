import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";

type NotificationEventKind = "TICKET_ASSIGNED" | "TICKET_WATCHING" | "ASSET_ASSIGNED" | "LOW_STOCK" | "MAINTENANCE_DUE" | "DEVICE_OFFLINE";

interface PreferenceRow {
  kind: NotificationEventKind;
  inAppEnabled: boolean;
  emailEnabled: boolean;
}

const EVENT_LABELS: Record<NotificationEventKind, { label: string; description: string }> = {
  TICKET_ASSIGNED: { label: "Ticket Assigned to You", description: "A helpdesk ticket is assigned to you (individually or via a team)." },
  TICKET_WATCHING: { label: "Watched Ticket Updates", description: "Activity on a ticket you're watching." },
  ASSET_ASSIGNED: { label: "Asset Assigned to You", description: "An asset is checked out or assigned to you." },
  LOW_STOCK: { label: "Low Stock Alerts", description: "A stock item drops below its reorder threshold." },
  MAINTENANCE_DUE: { label: "Maintenance Due", description: "A scheduled maintenance task is coming due or overdue." },
  DEVICE_OFFLINE: { label: "Device Offline Alerts", description: "A monitored network device goes offline." },
};

export function NotificationsTab() {
  const [rows, setRows] = useState<PreferenceRow[] | null>(null);
  const [saved, setSaved] = useState(false);

  const { data } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: async () => (await axiosClient.get("/notification-preferences")).data as PreferenceRow[],
  });

  useEffect(() => {
    if (data) setRows(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.put("/notification-preferences", { preferences: rows }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  function toggle(kind: NotificationEventKind, field: "inAppEnabled" | "emailEnabled", value: boolean) {
    setRows((prev) => prev?.map((r) => (r.kind === kind ? { ...r, [field]: value } : r)) ?? prev);
  }

  if (!rows) return <p className="muted">Loading...</p>;

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h3 className="mt-0">Notifications</h3>
      <p className="muted" style={{ marginTop: -6 }}>
        Choose which events notify you in-app and by email. Both channels are on by default.
      </p>
      {saved && <div className="alert alert-success">Notification preferences saved.</div>}

      <table className="data-table">
        <thead>
          <tr>
            <th>Event</th>
            <th style={{ width: 90, textAlign: "center" }}>In-App</th>
            <th style={{ width: 90, textAlign: "center" }}>Email</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.kind}>
              <td>
                <div style={{ fontWeight: 500 }}>{EVENT_LABELS[row.kind].label}</div>
                <div className="muted" style={{ fontSize: 12 }}>{EVENT_LABELS[row.kind].description}</div>
              </td>
              <td style={{ textAlign: "center" }}>
                <input type="checkbox" checked={row.inAppEnabled} onChange={(e) => toggle(row.kind, "inAppEnabled", e.target.checked)} />
              </td>
              <td style={{ textAlign: "center" }}>
                <input type="checkbox" checked={row.emailEnabled} onChange={(e) => toggle(row.kind, "emailEnabled", e.target.checked)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
        {saveMutation.isPending ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
