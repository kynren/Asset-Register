export type EmailEventType = "ACCOUNT_CREATED" | "ASSET_ASSIGNED" | "PASSWORD_RESET" | "TASK_OVERDUE" | "LOW_STOCK" | "MAGIC_LOGIN_LINK" | "TICKET_ASSIGNED" | "PROJECT_UPDATED" | "STOCK_ISSUED";

export const EVENT_TYPES: EmailEventType[] = ["ACCOUNT_CREATED", "ASSET_ASSIGNED", "PASSWORD_RESET", "TASK_OVERDUE", "LOW_STOCK", "MAGIC_LOGIN_LINK", "TICKET_ASSIGNED", "PROJECT_UPDATED", "STOCK_ISSUED"];

export const EVENT_LABELS: Record<EmailEventType, string> = {
  ACCOUNT_CREATED: "Account Created",
  ASSET_ASSIGNED: "Asset Assigned",
  PASSWORD_RESET: "Password Reset",
  TASK_OVERDUE: "Overdue Task",
  LOW_STOCK: "Low Stock",
  MAGIC_LOGIN_LINK: "Magic Login Link",
  TICKET_ASSIGNED: "Ticket Assigned",
  PROJECT_UPDATED: "IT Project Updated",
  STOCK_ISSUED: "Stock Issued",
};

export const EVENT_DESCRIPTIONS: Record<EmailEventType, string> = {
  ACCOUNT_CREATED: "Sent when an admin creates a user, or one is auto-created from a CSV import — includes their temporary password.",
  ASSET_ASSIGNED: "Sent when an asset is assigned or checked out to someone.",
  PASSWORD_RESET: "Sent when a user requests a password reset link.",
  TASK_OVERDUE: "Sent when an asset checkout, helpdesk ticket, IT project task, or asset maintenance date is overdue.",
  LOW_STOCK: "Sent to stock managers when an item drops to or below its reorder level.",
  MAGIC_LOGIN_LINK: "Sent when an admin sends a one-time login link to a user from their User Detail page.",
  TICKET_ASSIGNED: "Sent to a user (or every member of a team) when a helpdesk ticket is assigned to them.",
  PROJECT_UPDATED: "Sent to the creator of an IT Project when someone else (an editor) updates it or moves its status.",
  STOCK_ISSUED: "Sent to the recipient when a stock item is issued to them via scan-to-issue.",
};
