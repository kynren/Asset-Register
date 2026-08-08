import type { ToastVariant } from "../components/toast/ToastProvider";

export interface NotificationTypeInfo {
  type: string;
  label: string;
  description: string;
  defaultVariant: ToastVariant;
}

// Mirrors client/src/lib/notificationTypes.ts — keep both lists in sync when a new
// notifyUsers() call site is added server-side (see server/src/lib/notify.ts).
export const NOTIFICATION_TYPES: NotificationTypeInfo[] = [
  { type: "asset_assigned", label: "Asset Assigned", description: "An asset was checked out or assigned to you.", defaultVariant: "info" },
  { type: "asset_checkin", label: "Asset Checked In", description: "An asset you had was checked back in.", defaultVariant: "success" },
  { type: "stock_low", label: "Low Stock", description: "A stock item dropped to or below its reorder level.", defaultVariant: "warning" },
  { type: "ticket_assigned", label: "Ticket Assigned", description: "You were assigned a helpdesk ticket.", defaultVariant: "info" },
  { type: "ticket_status_change", label: "Ticket Status Changed", description: "A ticket you're involved in changed status.", defaultVariant: "info" },
  { type: "ticket_comment", label: "Ticket Comment", description: "A new comment was posted on a ticket you're involved in.", defaultVariant: "info" },
  { type: "license_assigned", label: "License Assigned", description: "A software license was assigned to you.", defaultVariant: "info" },
  { type: "task_overdue", label: "Task Overdue", description: "A checkout, ticket, project task, or asset maintenance date is overdue.", defaultVariant: "warning" },
  { type: "device_offline", label: "Device Offline", description: "A monitored network device went offline.", defaultVariant: "error" },
  { type: "device_online", label: "Device Back Online", description: "A monitored network device came back online.", defaultVariant: "success" },
  { type: "lighting_automation_start", label: "Lighting Automation Started", description: "A scheduled lighting automation began running.", defaultVariant: "info" },
  { type: "scheduled_change_published", label: "Scheduled Change Published", description: "A scheduled App Settings change (system settings, backups, or role permissions) was applied.", defaultVariant: "success" },
  { type: "scheduled_change_failed", label: "Scheduled Change Failed", description: "A scheduled App Settings change failed to apply.", defaultVariant: "error" },
];

export function findNotificationTypeInfo(type: string): NotificationTypeInfo | undefined {
  return NOTIFICATION_TYPES.find((t) => t.type === type);
}
