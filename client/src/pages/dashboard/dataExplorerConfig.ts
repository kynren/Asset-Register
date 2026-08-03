export type FieldType = "string" | "number" | "date" | "boolean" | "enum";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  operators: string[];
  options?: FieldOption[];
  dynamicOptions?: "assetCategories" | "locations" | "ticketCategories" | "users" | "roles";
}

export interface SourceDef {
  id: string;
  label: string;
  module: string;
  fields: FieldDef[];
  groupableFields: string[];
  defaultColumns: string[];
}

const ASSET_STATUS_OPTIONS: FieldOption[] = ["IN_USE", "IN_STORAGE", "IN_REPAIR", "RETIRED", "LOST"].map((v) => ({ value: v, label: v.replace("_", " ") }));
const TICKET_STATUS_OPTIONS: FieldOption[] = ["OPEN", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED"].map((v) => ({ value: v, label: v.replace("_", " ") }));
const TICKET_PRIORITY_OPTIONS: FieldOption[] = ["LOW", "MEDIUM", "HIGH", "URGENT"].map((v) => ({ value: v, label: v }));
const TICKET_ITIL_TYPE_OPTIONS: FieldOption[] = ["INCIDENT", "REQUEST", "PROBLEM", "CHANGE"].map((v) => ({ value: v, label: v }));
const DOC_TYPE_OPTIONS: FieldOption[] = ["SOP", "WORK_INSTRUCTION", "TECHNICAL_RUNBOOK", "MAINTENANCE_CHECKLIST", "POLICY", "SHOW_PRODUCTION", "TRAINING", "GENERAL"].map((v) => ({
  value: v,
  label: v.replace(/_/g, " "),
}));
const NETWORK_STATUS_OPTIONS: FieldOption[] = ["ONLINE", "OFFLINE"].map((v) => ({ value: v, label: v }));

export const OPERATOR_LABELS: Record<string, string> = {
  equals: "is",
  not_equals: "is not",
  contains: "contains",
  gt: "after",
  gte: "on or after",
  lt: "before",
  lte: "on or before",
  in: "is any of",
};

// Mirrors server/src/modules/dashboard/dataExplorer.ts's SOURCES registry — kept in sync by hand
// since the server owns the source of truth for what's actually queryable/safe, and the client
// only needs the same shape to drive the query-builder UI (labels, operators, dynamic option
// endpoints). The server independently re-validates every field/operator combination it receives.
export const DATA_EXPLORER_SOURCES: SourceDef[] = [
  {
    id: "assets",
    label: "Assets",
    module: "assets",
    fields: [
      { key: "status", label: "Status", type: "enum", operators: ["equals", "not_equals", "in"], options: ASSET_STATUS_OPTIONS },
      { key: "categoryId", label: "Category", type: "enum", operators: ["equals", "not_equals", "in"], dynamicOptions: "assetCategories" },
      { key: "locationId", label: "Location", type: "enum", operators: ["equals", "not_equals", "in"], dynamicOptions: "locations" },
      { key: "assignedToId", label: "Assigned To", type: "enum", operators: ["equals", "not_equals"], dynamicOptions: "users" },
      { key: "manufacturer", label: "Manufacturer", type: "string", operators: ["equals", "contains"] },
      { key: "model", label: "Model", type: "string", operators: ["equals", "contains"] },
      { key: "gridPowered", label: "Grid Powered", type: "boolean", operators: ["equals"] },
      { key: "createdAt", label: "Created", type: "date", operators: ["gt", "gte", "lt", "lte"] },
    ],
    groupableFields: ["status", "categoryId", "locationId"],
    defaultColumns: ["assetTag", "name", "status", "category", "location"],
  },
  {
    id: "tickets",
    label: "Tickets",
    module: "helpdesk",
    fields: [
      { key: "status", label: "Status", type: "enum", operators: ["equals", "not_equals", "in"], options: TICKET_STATUS_OPTIONS },
      { key: "priority", label: "Priority", type: "enum", operators: ["equals", "not_equals", "in"], options: TICKET_PRIORITY_OPTIONS },
      { key: "itilType", label: "ITIL Type", type: "enum", operators: ["equals", "not_equals", "in"], options: TICKET_ITIL_TYPE_OPTIONS },
      { key: "categoryId", label: "Category", type: "enum", operators: ["equals", "not_equals", "in"], dynamicOptions: "ticketCategories" },
      { key: "requesterId", label: "Requester", type: "enum", operators: ["equals", "not_equals"], dynamicOptions: "users" },
      { key: "createdAt", label: "Created", type: "date", operators: ["gt", "gte", "lt", "lte"] },
      { key: "dueAt", label: "Due", type: "date", operators: ["gt", "gte", "lt", "lte"] },
    ],
    groupableFields: ["status", "priority", "itilType", "categoryId"],
    defaultColumns: ["ticketNumber", "title", "status", "priority", "requester"],
  },
  {
    id: "stock",
    label: "Stock Items",
    module: "stock",
    fields: [
      { key: "category", label: "Category", type: "string", operators: ["equals", "contains"] },
      { key: "unit", label: "Unit", type: "string", operators: ["equals", "contains"] },
      { key: "quantityOnHand", label: "Quantity On Hand", type: "number", operators: ["equals", "gt", "gte", "lt", "lte"] },
      { key: "reorderLevel", label: "Reorder Level", type: "number", operators: ["equals", "gt", "gte", "lt", "lte"] },
      { key: "createdAt", label: "Created", type: "date", operators: ["gt", "gte", "lt", "lte"] },
    ],
    groupableFields: ["category"],
    defaultColumns: ["sku", "name", "category", "quantityOnHand", "reorderLevel"],
  },
  {
    id: "docs",
    label: "Docs & SOPs",
    module: "docs",
    fields: [
      { key: "docType", label: "Type", type: "enum", operators: ["equals", "not_equals", "in"], options: DOC_TYPE_OPTIONS },
      { key: "category", label: "Category", type: "string", operators: ["equals", "contains"] },
      { key: "isPublished", label: "Published", type: "boolean", operators: ["equals"] },
      { key: "reviewDueDate", label: "Review Due", type: "date", operators: ["gt", "gte", "lt", "lte"] },
      { key: "updatedAt", label: "Updated", type: "date", operators: ["gt", "gte", "lt", "lte"] },
    ],
    groupableFields: ["docType", "category"],
    defaultColumns: ["title", "docType", "category", "updatedAt"],
  },
  {
    id: "network",
    label: "Network Devices",
    module: "network",
    fields: [
      { key: "status", label: "Status", type: "enum", operators: ["equals", "not_equals"], options: NETWORK_STATUS_OPTIONS },
      { key: "deviceType", label: "Device Type", type: "string", operators: ["equals", "contains"] },
      { key: "vendor", label: "Vendor", type: "string", operators: ["equals", "contains"] },
      { key: "snmpEnabled", label: "SNMP Enabled", type: "boolean", operators: ["equals"] },
      { key: "lastSeenAt", label: "Last Seen", type: "date", operators: ["gt", "gte", "lt", "lte"] },
    ],
    groupableFields: ["status", "deviceType", "vendor"],
    defaultColumns: ["hostname", "ipAddress", "vendor", "deviceType", "status"],
  },
  {
    id: "users",
    label: "Users",
    module: "admin",
    fields: [
      { key: "roleId", label: "Role", type: "enum", operators: ["equals", "not_equals"], dynamicOptions: "roles" },
      { key: "isActive", label: "Active", type: "boolean", operators: ["equals"] },
      { key: "createdAt", label: "Created", type: "date", operators: ["gt", "gte", "lt", "lte"] },
      { key: "lastLoginAt", label: "Last Login", type: "date", operators: ["gt", "gte", "lt", "lte"] },
    ],
    groupableFields: ["roleId"],
    defaultColumns: ["name", "email", "role", "isActive"],
  },
];

export function getSource(id: string): SourceDef | undefined {
  return DATA_EXPLORER_SOURCES.find((s) => s.id === id);
}
