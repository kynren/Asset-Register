import { z } from "zod";

// Mirrors client/src/lib/notificationTypes.ts — the fixed set of Notification.type values
// actually created by notifyUsers() call sites across the server (see lib/notify.ts callers).
// Keep both lists in sync when a new call site introduces a new type.
export const NOTIFICATION_TYPE_SLUGS = [
  "asset_assigned",
  "asset_checkin",
  "stock_low",
  "ticket_assigned",
  "ticket_status_change",
  "ticket_comment",
  "license_assigned",
  "task_overdue",
  "device_offline",
  "device_online",
  "lighting_automation_start",
  "scheduled_change_published",
  "scheduled_change_failed",
] as const;

export const updateToastSettingSchema = z.object({
  isEnabled: z.boolean().optional(),
  variant: z.enum(["success", "error", "warning", "info"]).optional(),
  title: z.string().max(60).optional().nullable(),
});
