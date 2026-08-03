import { prisma } from "../../config/prisma";
import { ModuleName } from "../../constants/modules";
import { ApiError } from "../../middleware/errorHandler";

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
  // Hints the client which existing endpoint to fetch dynamic options from (categories, locations,
  // users, roles, etc.) — the server doesn't need this itself, it's just carried through for the UI.
  dynamicOptions?: "assetCategories" | "locations" | "ticketCategories" | "users" | "roles";
}

export interface SourceDef {
  id: string;
  label: string;
  module: ModuleName;
  fields: FieldDef[];
  groupableFields: string[];
  defaultColumns: string[];
}

export interface FilterCondition {
  field: string;
  operator: string;
  value: unknown;
}

export interface FilterSpec {
  combinator: "AND" | "OR";
  conditions: FilterCondition[];
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

export const SOURCES: Record<string, SourceDef> = {
  assets: {
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
  tickets: {
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
  stock: {
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
  docs: {
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
  network: {
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
  users: {
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
};

function coerce(field: FieldDef, value: unknown): unknown {
  if (field.type === "number") return Number(value);
  if (field.type === "date") return new Date(value as string);
  if (field.type === "boolean") return value === true || value === "true";
  return value;
}

function buildClause(field: FieldDef, operator: string, value: unknown): Record<string, unknown> | undefined {
  const key = field.key;
  switch (operator) {
    case "equals":
      return { [key]: coerce(field, value) };
    case "not_equals":
      return { [key]: { not: coerce(field, value) } };
    case "contains":
      return { [key]: { contains: String(value), mode: "insensitive" } };
    case "gt":
      return { [key]: { gt: coerce(field, value) } };
    case "gte":
      return { [key]: { gte: coerce(field, value) } };
    case "lt":
      return { [key]: { lt: coerce(field, value) } };
    case "lte":
      return { [key]: { lte: coerce(field, value) } };
    case "in": {
      const values = Array.isArray(value) ? value : String(value).split(",");
      return { [key]: { in: values.map((v) => coerce(field, v)) } };
    }
    default:
      return undefined;
  }
}

function buildWhere(fields: FieldDef[], spec: FilterSpec | undefined | null): Record<string, unknown> {
  if (!spec || !spec.conditions?.length) return {};
  const fieldMap = new Map(fields.map((f) => [f.key, f]));
  const clauses = spec.conditions
    .filter((c) => fieldMap.has(c.field) && fieldMap.get(c.field)!.operators.includes(c.operator))
    .map((c) => buildClause(fieldMap.get(c.field)!, c.operator, c.value))
    .filter((c): c is Record<string, unknown> => Boolean(c));
  if (clauses.length === 0) return {};
  return spec.combinator === "OR" ? { OR: clauses } : { AND: clauses };
}

export interface QuerySpec {
  source: string;
  filters?: FilterSpec;
  groupBy?: string;
  visualization: "kpi" | "table" | "bar" | "pie" | "line";
  columns?: string[];
}

export type QueryResult =
  | { kind: "kpi"; value: number }
  | { kind: "table"; columns: string[]; rows: Record<string, unknown>[] }
  | { kind: "chart"; data: { label: string; count: number }[] };

async function queryAssets(where: Record<string, unknown>, groupBy: string | undefined, visualization: string, columns: string[] | undefined): Promise<QueryResult> {
  if (visualization === "kpi") return { kind: "kpi", value: await prisma.asset.count({ where }) };
  if (visualization === "table") {
    const rows = await prisma.asset.findMany({ where, take: 100, orderBy: { createdAt: "desc" }, include: { category: true, location: true, assignedTo: true } });
    return {
      kind: "table",
      columns: columns?.length ? columns : SOURCES.assets.defaultColumns,
      rows: rows.map((a) => ({
        assetTag: a.assetTag,
        name: a.name,
        status: a.status,
        category: a.category?.name ?? "—",
        location: a.location?.name ?? "—",
        assignedTo: a.assignedTo ? `${a.assignedTo.firstName} ${a.assignedTo.lastName}` : "—",
        manufacturer: a.manufacturer ?? "—",
        model: a.model ?? "—",
        createdAt: a.createdAt,
      })),
    };
  }
  const field = groupBy && SOURCES.assets.groupableFields.includes(groupBy) ? groupBy : "status";
  if (field === "categoryId") {
    const g = await prisma.asset.groupBy({ by: ["categoryId"], where, _count: { _all: true } });
    const cats = await prisma.assetCategory.findMany({ select: { id: true, name: true } });
    const map = new Map(cats.map((c) => [c.id, c.name]));
    return { kind: "chart", data: g.map((x) => ({ label: x.categoryId ? map.get(x.categoryId) ?? "Unknown" : "Uncategorized", count: x._count._all })) };
  }
  if (field === "locationId") {
    const g = await prisma.asset.groupBy({ by: ["locationId"], where, _count: { _all: true } });
    const locs = await prisma.location.findMany({ select: { id: true, name: true } });
    const map = new Map(locs.map((l) => [l.id, l.name]));
    return { kind: "chart", data: g.map((x) => ({ label: x.locationId ? map.get(x.locationId) ?? "Unknown" : "Unassigned", count: x._count._all })) };
  }
  const g = await prisma.asset.groupBy({ by: ["status"], where, _count: { _all: true } });
  return { kind: "chart", data: g.map((x) => ({ label: x.status, count: x._count._all })) };
}

async function queryTickets(where: Record<string, unknown>, groupBy: string | undefined, visualization: string, columns: string[] | undefined): Promise<QueryResult> {
  if (visualization === "kpi") return { kind: "kpi", value: await prisma.ticket.count({ where }) };
  if (visualization === "table") {
    const rows = await prisma.ticket.findMany({ where, take: 100, orderBy: { createdAt: "desc" }, include: { category: true, requester: { select: { firstName: true, lastName: true } } } });
    return {
      kind: "table",
      columns: columns?.length ? columns : SOURCES.tickets.defaultColumns,
      rows: rows.map((t) => ({
        ticketNumber: t.ticketNumber,
        title: t.title,
        status: t.status,
        priority: t.priority,
        itilType: t.itilType,
        category: t.category?.name ?? "—",
        requester: `${t.requester.firstName} ${t.requester.lastName}`,
        dueAt: t.dueAt,
        createdAt: t.createdAt,
      })),
    };
  }
  const field = groupBy && SOURCES.tickets.groupableFields.includes(groupBy) ? groupBy : "status";
  if (field === "categoryId") {
    const g = await prisma.ticket.groupBy({ by: ["categoryId"], where, _count: { _all: true } });
    const cats = await prisma.ticketCategory.findMany({ select: { id: true, name: true } });
    const map = new Map(cats.map((c) => [c.id, c.name]));
    return { kind: "chart", data: g.map((x) => ({ label: x.categoryId ? map.get(x.categoryId) ?? "Unknown" : "Uncategorized", count: x._count._all })) };
  }
  if (field === "priority") {
    const g = await prisma.ticket.groupBy({ by: ["priority"], where, _count: { _all: true } });
    return { kind: "chart", data: g.map((x) => ({ label: x.priority, count: x._count._all })) };
  }
  if (field === "itilType") {
    const g = await prisma.ticket.groupBy({ by: ["itilType"], where, _count: { _all: true } });
    return { kind: "chart", data: g.map((x) => ({ label: x.itilType, count: x._count._all })) };
  }
  const g = await prisma.ticket.groupBy({ by: ["status"], where, _count: { _all: true } });
  return { kind: "chart", data: g.map((x) => ({ label: x.status, count: x._count._all })) };
}

async function queryStock(where: Record<string, unknown>, _groupBy: string | undefined, visualization: string, columns: string[] | undefined): Promise<QueryResult> {
  if (visualization === "kpi") return { kind: "kpi", value: await prisma.stockItem.count({ where }) };
  if (visualization === "table") {
    const rows = await prisma.stockItem.findMany({ where, take: 100, orderBy: { createdAt: "desc" } });
    return {
      kind: "table",
      columns: columns?.length ? columns : SOURCES.stock.defaultColumns,
      rows: rows.map((i) => ({ sku: i.sku, name: i.name, category: i.category ?? "—", quantityOnHand: i.quantityOnHand, reorderLevel: i.reorderLevel, unit: i.unit, createdAt: i.createdAt })),
    };
  }
  const g = await prisma.stockItem.groupBy({ by: ["category"], where, _count: { _all: true } });
  return { kind: "chart", data: g.map((x) => ({ label: x.category ?? "Uncategorized", count: x._count._all })) };
}

async function queryDocs(where: Record<string, unknown>, groupBy: string | undefined, visualization: string, columns: string[] | undefined): Promise<QueryResult> {
  if (visualization === "kpi") return { kind: "kpi", value: await prisma.document.count({ where }) };
  if (visualization === "table") {
    const rows = await prisma.document.findMany({ where, take: 100, orderBy: { updatedAt: "desc" }, include: { createdBy: { select: { firstName: true, lastName: true } } } });
    return {
      kind: "table",
      columns: columns?.length ? columns : SOURCES.docs.defaultColumns,
      rows: rows.map((d) => ({
        title: d.title,
        docType: d.docType,
        category: d.category,
        isPublished: d.isPublished,
        reviewDueDate: d.reviewDueDate,
        updatedAt: d.updatedAt,
        createdBy: d.createdBy ? `${d.createdBy.firstName} ${d.createdBy.lastName}` : "—",
      })),
    };
  }
  const field = groupBy === "docType" ? "docType" : "category";
  if (field === "docType") {
    const g = await prisma.document.groupBy({ by: ["docType"], where, _count: { _all: true } });
    return { kind: "chart", data: g.map((x) => ({ label: x.docType, count: x._count._all })) };
  }
  const g = await prisma.document.groupBy({ by: ["category"], where, _count: { _all: true } });
  return { kind: "chart", data: g.map((x) => ({ label: x.category, count: x._count._all })) };
}

async function queryNetwork(where: Record<string, unknown>, groupBy: string | undefined, visualization: string, columns: string[] | undefined): Promise<QueryResult> {
  if (visualization === "kpi") return { kind: "kpi", value: await prisma.monitoredNetworkDevice.count({ where }) };
  if (visualization === "table") {
    const rows = await prisma.monitoredNetworkDevice.findMany({ where, take: 100, orderBy: { lastSeenAt: "desc" } });
    return {
      kind: "table",
      columns: columns?.length ? columns : SOURCES.network.defaultColumns,
      rows: rows.map((d) => ({ hostname: d.hostname ?? "—", ipAddress: d.ipAddress, macAddress: d.macAddress ?? "—", vendor: d.vendor ?? "—", deviceType: d.deviceType ?? "—", status: d.status, lastSeenAt: d.lastSeenAt })),
    };
  }
  const field = groupBy && SOURCES.network.groupableFields.includes(groupBy) ? groupBy : "status";
  if (field === "deviceType") {
    const g = await prisma.monitoredNetworkDevice.groupBy({ by: ["deviceType"], where, _count: { _all: true } });
    return { kind: "chart", data: g.map((x) => ({ label: x.deviceType ?? "Unknown", count: x._count._all })) };
  }
  if (field === "vendor") {
    const g = await prisma.monitoredNetworkDevice.groupBy({ by: ["vendor"], where, _count: { _all: true } });
    return { kind: "chart", data: g.map((x) => ({ label: x.vendor ?? "Unknown", count: x._count._all })) };
  }
  const g = await prisma.monitoredNetworkDevice.groupBy({ by: ["status"], where, _count: { _all: true } });
  return { kind: "chart", data: g.map((x) => ({ label: x.status, count: x._count._all })) };
}

async function queryUsers(where: Record<string, unknown>, _groupBy: string | undefined, visualization: string, columns: string[] | undefined): Promise<QueryResult> {
  if (visualization === "kpi") return { kind: "kpi", value: await prisma.user.count({ where }) };
  if (visualization === "table") {
    const rows = await prisma.user.findMany({
      where,
      take: 100,
      orderBy: { createdAt: "desc" },
      select: { firstName: true, lastName: true, email: true, isActive: true, createdAt: true, lastLoginAt: true, role: { select: { name: true } } },
    });
    return {
      kind: "table",
      columns: columns?.length ? columns : SOURCES.users.defaultColumns,
      rows: rows.map((u) => ({ name: `${u.firstName} ${u.lastName}`, email: u.email, role: u.role.name, isActive: u.isActive, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt })),
    };
  }
  const g = await prisma.user.groupBy({ by: ["roleId"], where, _count: { _all: true } });
  const roles = await prisma.role.findMany({ select: { id: true, name: true } });
  const map = new Map(roles.map((r) => [r.id, r.name]));
  return { kind: "chart", data: g.map((x) => ({ label: map.get(x.roleId) ?? "Unknown", count: x._count._all })) };
}

export async function runQuery(spec: QuerySpec): Promise<QueryResult> {
  const source = SOURCES[spec.source];
  if (!source) throw new ApiError(400, `Unknown data source: ${spec.source}`);
  const where = buildWhere(source.fields, spec.filters);

  switch (spec.source) {
    case "assets":
      return queryAssets(where, spec.groupBy, spec.visualization, spec.columns);
    case "tickets":
      return queryTickets(where, spec.groupBy, spec.visualization, spec.columns);
    case "stock":
      return queryStock(where, spec.groupBy, spec.visualization, spec.columns);
    case "docs":
      return queryDocs(where, spec.groupBy, spec.visualization, spec.columns);
    case "network":
      return queryNetwork(where, spec.groupBy, spec.visualization, spec.columns);
    case "users":
      return queryUsers(where, spec.groupBy, spec.visualization, spec.columns);
    default:
      throw new ApiError(400, `Unknown data source: ${spec.source}`);
  }
}
