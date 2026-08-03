import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { axiosClient } from "../api/axiosClient";
import { Icon } from "../components/Icon";
import { useToast } from "../components/toast/ToastProvider";
import { findNotificationTypeInfo } from "../lib/notificationTypes";

interface NotificationItem {
  id: number;
  type: string;
  message: string;
  isRead: boolean;
  linkUrl: string | null;
  createdAt: string;
}

interface ToastSettingItem {
  type: string;
  isEnabled: boolean | null;
  variant: "success" | "error" | "warning" | "info" | null;
  title: string | null;
  message: string | null;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { showToast } = useToast();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await axiosClient.get("/notifications")).data as { notifications: NotificationItem[]; unreadCount: number },
    refetchInterval: 30_000,
  });

  // Settings change rarely, so a long staleTime avoids re-fetching them on every 30s
  // notification poll — they're only actually read from at the moment a new notification lands.
  const { data: toastSettings } = useQuery({
    queryKey: ["toast-settings"],
    queryFn: async () => (await axiosClient.get("/toast-settings")).data as ToastSettingItem[],
    staleTime: 5 * 60_000,
  });

  // Pops a toast for each notification that appeared since the last poll — but not on first
  // load, which would otherwise toast-storm every unread notification on every page refresh.
  const seenIdsRef = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (!data) return;
    const currentIds = new Set(data.notifications.map((n) => n.id));
    if (seenIdsRef.current === null) {
      seenIdsRef.current = currentIds;
      return;
    }
    const newOnes = data.notifications.filter((n) => !seenIdsRef.current!.has(n.id));
    for (const n of newOnes) {
      const setting = toastSettings?.find((s) => s.type === n.type);
      if (setting?.isEnabled === false) continue;
      const meta = findNotificationTypeInfo(n.type);
      showToast({
        variant: setting?.variant ?? meta?.defaultVariant ?? "info",
        title: setting?.title ?? meta?.label,
        message: setting?.message || n.message,
      });
    }
    seenIdsRef.current = currentIds;
  }, [data, toastSettings, showToast]);

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
          <button
            className="btn btn-secondary btn-sm"
            style={{ width: "100%", borderRadius: 0, borderTop: "1px solid var(--color-border)" }}
            onClick={() => { setOpen(false); navigate("/notifications"); }}
          >
            View All
          </button>
        </div>
      )}
    </div>
  );
}
