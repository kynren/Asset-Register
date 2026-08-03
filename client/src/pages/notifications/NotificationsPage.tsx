import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { findNotificationTypeInfo } from "../../lib/notificationTypes";

interface NotificationItem {
  id: number;
  type: string;
  message: string;
  isRead: boolean;
  linkUrl: string | null;
  createdAt: string;
}

interface EmailLogItem {
  id: number;
  to: string;
  subject: string;
  text: string;
  html: string | null;
  eventType: string | null;
  delivered: boolean;
  createdAt: string;
}

const TABS = [
  { key: "notifications", label: "Notifications" },
  { key: "emails", label: "Emails" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function NotificationPreviewModal({ notification, onClose, onNavigate }: { notification: NotificationItem; onClose: () => void; onNavigate: (url: string) => void }) {
  const meta = findNotificationTypeInfo(notification.type);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{meta?.label ?? notification.type}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="stack gap-2">
          <p style={{ margin: 0 }}>{notification.message}</p>
          <span className="muted" style={{ fontSize: 12 }}>{dayjs(notification.createdAt).format("DD MMM YYYY, HH:mm")}</span>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          {notification.linkUrl && (
            <button className="btn btn-primary" onClick={() => onNavigate(notification.linkUrl!)}>Go to related item</button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmailPreviewModal({ email, onClose }: { email: EmailLogItem; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{email.subject}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="stack gap-2">
          <div className="row gap-3" style={{ fontSize: 12 }}>
            <span className="muted">To: {email.to}</span>
            <span className="muted">{dayjs(email.createdAt).format("DD MMM YYYY, HH:mm")}</span>
            {email.eventType && <span className="badge badge-neutral">{email.eventType}</span>}
            <span className={`badge ${email.delivered ? "badge-success" : "badge-neutral"}`}>
              {email.delivered ? "Delivered" : "Not sent (SMTP not configured)"}
            </span>
          </div>
          {/* sandbox="" (no allow-scripts/allow-same-origin) keeps stored HTML fully inert — safe
              to preview a stored email verbatim without risking script execution. */}
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={email.html ?? `<pre style="white-space:pre-wrap;font-family:inherit;">${email.text}</pre>`}
            style={{ width: "100%", height: 400, border: "1px solid var(--color-border)", borderRadius: 6, background: "#fff" }}
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function NotificationsPage() {
  const [tab, setTab] = useState<TabKey>("notifications");
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<EmailLogItem | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: notificationsData, isLoading: notificationsLoading } = useQuery({
    queryKey: ["notifications-all"],
    queryFn: async () => (await axiosClient.get("/notifications/all")).data as { notifications: NotificationItem[] },
    enabled: tab === "notifications",
  });

  const { data: emailsData, isLoading: emailsLoading } = useQuery({
    queryKey: ["notifications-emails"],
    queryFn: async () => (await axiosClient.get("/notifications/emails")).data as { emails: EmailLogItem[] },
    enabled: tab === "emails",
  });

  const markOneMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications-all"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  function openNotification(n: NotificationItem) {
    if (!n.isRead) markOneMutation.mutate(n.id);
    setSelectedNotification(n);
  }

  function goToNotificationLink(url: string) {
    setSelectedNotification(null);
    navigate(url);
  }

  const notificationColumns: ColumnDef<NotificationItem, any>[] = [
    { header: "Message", accessorKey: "message" },
    { header: "Type", cell: ({ row }) => { const meta = findNotificationTypeInfo(row.original.type); return meta?.label ?? row.original.type; } },
    { header: "Received", cell: ({ row }) => dayjs(row.original.createdAt).format("DD MMM YYYY, HH:mm") },
    { header: "Status", cell: ({ row }) => (row.original.isRead ? <span className="badge badge-neutral">Read</span> : <span className="badge badge-primary">Unread</span>) },
  ];

  const emailColumns: ColumnDef<EmailLogItem, any>[] = [
    { header: "Subject", accessorKey: "subject" },
    { header: "Event Type", cell: ({ row }) => row.original.eventType ?? "—" },
    { header: "Sent", cell: ({ row }) => dayjs(row.original.createdAt).format("DD MMM YYYY, HH:mm") },
    { header: "Status", cell: ({ row }) => (row.original.delivered ? <span className="badge badge-success">Delivered</span> : <span className="badge badge-neutral">Not sent</span>) },
  ];

  return (
    <div className="stack gap-3">
      <div className="page-header-sticky">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Notifications</h1>
            <p className="page-subtitle">Everything you've been notified about — in-app and by email.</p>
          </div>
        </div>
        <div className="row gap-2 flex-wrap">
          {TABS.map((t) => (
            <button key={t.key} className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "notifications" && (
        <DataTable
          tableId="notifications.list"
          columns={notificationColumns}
          data={notificationsData?.notifications ?? []}
          isLoading={notificationsLoading}
          clientPageSize={20}
          onRowClick={openNotification}
          emptyMessage="No notifications yet."
        />
      )}

      {tab === "emails" && (
        <DataTable
          tableId="notifications.emails"
          columns={emailColumns}
          data={emailsData?.emails ?? []}
          isLoading={emailsLoading}
          clientPageSize={20}
          onRowClick={setSelectedEmail}
          emptyMessage="No emails sent to you yet."
        />
      )}

      {selectedNotification && (
        <NotificationPreviewModal
          notification={selectedNotification}
          onClose={() => setSelectedNotification(null)}
          onNavigate={goToNotificationLink}
        />
      )}
      {selectedEmail && <EmailPreviewModal email={selectedEmail} onClose={() => setSelectedEmail(null)} />}
    </div>
  );
}
