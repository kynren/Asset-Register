export type ScheduledChangeType = "SYSTEM_SETTINGS" | "BACKUP_SETTINGS" | "ROLE_PERMISSIONS";
export type ScheduledChangeStatus = "PENDING" | "PUBLISHED" | "CANCELLED" | "FAILED";

export interface ScheduledChangeRow {
  id: number;
  changeType: ScheduledChangeType;
  status: ScheduledChangeStatus;
  summary: string;
  payload: any;
  beforeSnapshot: any;
  targetId: number | null;
  scheduledFor: string;
  createdById: number;
  publishedAt: string | null;
  cancelledAt: string | null;
  cancelledById: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

// Which App Settings tab a given changeType's payload was authored on — used both to route
// "Edit" from the Change Management timeline back to the right form, and to label the changeType
// in the timeline/detail view.
export const CHANGE_TYPE_INFO: Record<ScheduledChangeType, { label: string; tab: "settings" | "backups" | "roles" }> = {
  SYSTEM_SETTINGS: { label: "System Settings", tab: "settings" },
  BACKUP_SETTINGS: { label: "Backup Schedule", tab: "backups" },
  ROLE_PERMISSIONS: { label: "Role Permissions", tab: "roles" },
};
