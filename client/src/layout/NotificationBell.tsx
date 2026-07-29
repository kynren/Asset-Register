import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { axiosClient } from "../api/axiosClient";
import { Icon } from "../components/Icon";

interface NotificationItem {
  id: number;
  type: string;
  message: string;
  isRead: boolean;
  linkUrl: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await axiosClient.get("/notifications")).data as { notifications: NotificationItem[]; unreadCount: number },
    refetchInterval: 30_000,
  });

  const markAllMutation = useMutation({
    mutationFn: () => axiosClient.post("/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markOneMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  function openNotification(n: NotificationItem) {
    markOneMutation.mutate(n.id);
    setOpen(false);
    if (n.linkUrl) navigate(n.linkUrl);
  }

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div style={{ position: "relative" }}>
      <button className="topbar-icon-btn" onClick={() => setOpen((o) => !o)} title="Notifications">
        <Icon name="bell" size={16} />
        {unreadCount > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, background: "var(--color-danger)", color: "#fff", borderRadius: 999, fontSize: 10, fontWeight: 700, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="user-menu" style={{ width: 320, right: 0 }} onMouseLeave={() => setOpen(false)}>
          <div className="user-menu-header row" style={{ justifyContent: "space-between" }}>
            <strong style={{ fontSize: 13 }}>Notifications</strong>
            {unreadCount > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={() => markAllMutation.mutate()}>Mark all read</button>
            )}
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {!data?.notifications.length && <div className="empty-state" style={{ padding: 20 }}>No notifications yet.</div>}
            {data?.notifications.map((n) => (
              <div
                key={n.id}
                className="user-menu-item"
                style={{ alignItems: "flex-start", flexDirection: "column", gap: 2, background: n.isRead ? undefined : "var(--color-primary-soft)" }}
                onClick={() => openNotification(n)}
              >
                <span style={{ fontSize: 12.5 }}>{n.message}</span>
                <span className="muted" style={{ fontSize: 11 }}>{dayjs(n.createdAt).format("DD MMM, HH:mm")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
