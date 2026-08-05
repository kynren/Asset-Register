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

// Merge fields available to {{token}} interpolation per event — shown as a picker in the
// builder so admins don't have to guess or memorize the exact variable names.
export const EVENT_VARIABLES: Record<EmailEventType, string[]> = {
  ACCOUNT_CREATED: ["firstName", "lastName", "email", "tempPassword", "loginUrl"],
  ASSET_ASSIGNED: ["firstName", "assetName", "assetTag", "assetUrl"],
  PASSWORD_RESET: ["firstName", "resetUrl"],
  TASK_OVERDUE: ["firstName", "taskType", "taskName", "dueDate", "taskUrl"],
  LOW_STOCK: ["itemName", "quantityOnHand", "reorderLevel", "stockUrl"],
  MAGIC_LOGIN_LINK: ["firstName", "magicUrl"],
  TICKET_ASSIGNED: ["firstName", "ticketNumber", "ticketTitle", "priority", "ticketUrl"],
  PROJECT_UPDATED: ["editorName", "projectTitle", "projectUrl"],
  STOCK_ISSUED: ["firstName", "itemName", "sku", "quantity", "stockUrl"],
};

// Mirrors the server's SAMPLE_VARIABLES (server/src/modules/emailTemplates/emailTemplates.controller.ts)
// — used only to render a realistic in-editor preview, never sent anywhere from the client.
export const SAMPLE_VARIABLES: Record<EmailEventType, Record<string, string>> = {
  ACCOUNT_CREATED: { firstName: "Jordan", lastName: "Ellis", email: "jordan.ellis@example.com", tempPassword: "Sample!2025", loginUrl: "https://app-assets.kynren.com/login" },
  ASSET_ASSIGNED: { firstName: "Jordan", assetName: "Dell Latitude 5440", assetTag: "KYN-0142", assetUrl: "https://app-assets.kynren.com/assets/142" },
  PASSWORD_RESET: { firstName: "Jordan", resetUrl: "https://app-assets.kynren.com/reset-password/sample-token" },
  TASK_OVERDUE: { firstName: "Jordan", taskType: "Asset Checkout", taskName: "Dell Latitude 5440 (KYN-0142)", dueDate: "12 Jul 2026", taskUrl: "https://app-assets.kynren.com/assets/142" },
  LOW_STOCK: { itemName: "HDMI Cable 2m", quantityOnHand: "3", reorderLevel: "10", stockUrl: "https://app-assets.kynren.com/stock" },
  MAGIC_LOGIN_LINK: { firstName: "Jordan", magicUrl: "https://app-assets.kynren.com/magic-login/sample-token" },
  TICKET_ASSIGNED: { firstName: "Jordan", ticketNumber: "TCK-00142", ticketTitle: "Printer on 3rd floor not responding", priority: "HIGH", ticketUrl: "https://app-assets.kynren.com/helpdesk/142" },
  PROJECT_UPDATED: { editorName: "Jordan Ellis", projectTitle: "Lake Projector Calibration", projectUrl: "https://app-assets.kynren.com/operations" },
  STOCK_ISSUED: { firstName: "Jordan", itemName: "Dell Latitude 5440 Charger", sku: "KYN-LAPTOP-435717", quantity: "2", stockUrl: "https://app-assets.kynren.com/stock" },
};

export type EmailBlock =
  | { id: string; type: "heading"; text: string; align?: "left" | "center" | "right" }
  | { id: string; type: "text"; text: string; align?: "left" | "center" | "right" }
  | { id: string; type: "image"; url: string; alt?: string; width?: number; align?: "left" | "center" | "right" }
  | { id: string; type: "button"; text: string; url: string; color?: string }
  | { id: string; type: "divider" }
  | { id: string; type: "spacer"; height?: number };

export function interpolatePreview(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in variables ? variables[key] : match));
}
