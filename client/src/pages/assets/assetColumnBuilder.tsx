import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { NavigateFunction } from "react-router-dom";
import { UseMutationResult } from "@tanstack/react-query";
import { Icon } from "../../components/Icon";
import { StatusBadge } from "../../components/StatusBadge";
import { ExpiryCell } from "../../components/ExpiryCell";
import { PermissionGate } from "../../auth/PermissionGate";
import { Asset } from "./assetTypes";
import { DEFAULT_GENERIC_COLUMNS, GENERIC_COLUMN_LABELS, GenericColumnKey, fieldKeyFromColumnKey, isGenericColumnKey } from "./assetTableColumns";
import { AssetTelemetryCell } from "./AssetTelemetryCell";

export const STATUS_OPTIONS = ["IN_USE", "IN_STORAGE", "IN_REPAIR", "RETIRED", "LOST"];

export interface CategoryFormField {
  id: number;
  label: string;
  fieldKey: string;
  fieldType: "TEXT" | "TEXTAREA" | "NUMBER" | "DATE" | "SELECT" | "CHECKBOX";
}

export interface AssetColumnBuilderContext {
  canEdit: boolean;
  users: any[] | undefined;
  quickPatchMutation: UseMutationResult<any, any, { id: number; data: Record<string, unknown> }>;
  duplicateMutation: UseMutationResult<any, any, number>;
  navigate: NavigateFunction;
  onEdit: (a: Asset) => void;
  onDelete: (a: Asset) => void;
  onQr: (a: Asset) => void;
  copyShareLink: (a: Asset) => void;
}

// null columnKeys (a category that hasn't been customized) always renders exactly today's generic
// set, in today's order — behavior-preserving default. Unknown/stale `field:` keys (e.g. a field
// deleted from the template after being referenced) are silently filtered, not a crash.
export function buildAssetColumnDefs(columnKeys: string[] | null, fields: CategoryFormField[] | undefined, ctx: AssetColumnBuilderContext): ColumnDef<Asset, any>[] {
  const keys = columnKeys ?? DEFAULT_GENERIC_COLUMNS;
  const columns: ColumnDef<Asset, any>[] = [];

  for (const key of keys) {
    if (isGenericColumnKey(key)) {
      columns.push(buildGenericColumn(key, ctx));
      continue;
    }
    const fieldKey = fieldKeyFromColumnKey(key);
    const field = fieldKey ? fields?.find((f) => f.fieldKey === fieldKey) : undefined;
    if (!field) continue;
    columns.push(buildFieldColumn(field));
  }

  columns.push(buildActionsColumn(ctx));
  return columns;
}

function buildGenericColumn(key: GenericColumnKey, ctx: AssetColumnBuilderContext): ColumnDef<Asset, any> {
  const { canEdit, users, quickPatchMutation } = ctx;
  const header = GENERIC_COLUMN_LABELS[key];

  switch (key) {
    case "asset":
      return {
        id: "asset",
        header,
        meta: { cardTitle: true },
        cell: ({ row }) => (
          <div>
            <div style={{ fontWeight: 600 }}>{row.original.name}</div>
            <div className="muted" style={{ fontSize: 11 }}>
              {row.original.assetTag}
              {row.original.serialNumber ? ` · SN ${row.original.serialNumber}` : ""}
            </div>
          </div>
        ),
      };
    case "nameAndTag":
      return {
        id: "nameAndTag",
        header,
        meta: { cardTitle: true },
        cell: ({ row }) => (
          <div>
            <div style={{ fontWeight: 600 }}>{row.original.name}</div>
            <div className="muted" style={{ fontSize: 11 }}>{row.original.assetTag}</div>
          </div>
        ),
      };
    case "serialNumber":
      return { id: "serialNumber", header, accessorFn: (a) => a.serialNumber ?? "—" };
    case "notes":
      return { id: "notes", header, accessorFn: (a) => a.notes ?? "—" };
    case "status":
      return {
        id: "status",
        header,
        cell: ({ row }) =>
          canEdit ? (
            <select
              className="select"
              style={{ fontSize: 12, padding: "4px 6px" }}
              value={row.original.status}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => quickPatchMutation.mutate({ id: row.original.id, data: { status: e.target.value } })}
            >
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          ) : (
            <StatusBadge status={row.original.status} />
          ),
      };
    case "location":
      return { id: "location", header, accessorFn: (a) => a.location?.name ?? "—" };
    case "power":
      return {
        id: "power",
        header,
        cell: ({ row }) => {
          const a = row.original;
          if (a.gridPowered) {
            return (
              <span className="badge badge-neutral" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon name="plug" size={11} /> Grid
              </span>
            );
          }
          const battery = a.device;
          if (!battery || battery.batteryPresent !== true || battery.batteryPercent == null) {
            return <span className="muted" style={{ fontSize: 12 }}>—</span>;
          }
          const level = battery.batteryPercent;
          const color = level <= 20 ? "var(--color-danger)" : level <= 50 ? "var(--color-warning)" : "var(--color-success)";
          return (
            <span className="row gap-1" style={{ fontSize: 12, alignItems: "center", color }} title={battery.batteryCharging ? "Charging" : "On battery"}>
              <Icon name="battery" size={13} />
              {level}%{battery.batteryCharging ? " ⚡" : ""}
            </span>
          );
        },
      };
    case "telemetry":
      return { id: "telemetry", header, cell: ({ row }) => <AssetTelemetryCell assetId={row.original.id} /> };
    case "custodian":
      return {
        id: "custodian",
        header,
        cell: ({ row }) =>
          canEdit ? (
            <select
              className="select"
              style={{ fontSize: 12, padding: "4px 6px" }}
              value={row.original.assignedToId ?? ""}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => quickPatchMutation.mutate({ id: row.original.id, data: { assignedToId: e.target.value ? Number(e.target.value) : null } })}
            >
              <option value="">Unassigned</option>
              {users?.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          ) : (
            <span>{row.original.assignedTo ? `${row.original.assignedTo.firstName} ${row.original.assignedTo.lastName}` : "Unassigned"}</span>
          ),
      };
    case "signOff":
      return {
        id: "signOff",
        header,
        cell: ({ row }) => (
          <button
            className={`badge ${row.original.signOffStatus === "CONFIRMED" ? "badge-success" : "badge-warning"}`}
            style={{ border: "none", cursor: canEdit ? "pointer" : "default" }}
            disabled={!canEdit}
            onClick={(e) => {
              e.stopPropagation();
              quickPatchMutation.mutate({ id: row.original.id, data: { signOffStatus: row.original.signOffStatus === "CONFIRMED" ? "PENDING" : "CONFIRMED" } });
            }}
          >
            {row.original.signOffStatus}
          </button>
        ),
      };
  }
}

// Any DATE-typed custom field whose label/fieldKey reads as an expiry renders through the shared
// urgency-badge cell — generalizes what was previously Harness-only styling to any category.
function buildFieldColumn(field: CategoryFormField): ColumnDef<Asset, any> {
  const isExpiry = field.fieldType === "DATE" && /expir/i.test(`${field.label} ${field.fieldKey}`);
  return {
    id: `field:${field.fieldKey}`,
    header: field.label,
    accessorFn: (a) => a.customFieldValues?.find((v) => v.fieldId === field.id)?.value ?? null,
    cell: ({ getValue }) => {
      const value = getValue() as string | null;
      if (isExpiry) return <ExpiryCell value={value} />;
      if (!value) return <span className="muted">—</span>;
      if (field.fieldType === "DATE") return <span>{dayjs(value).format("DD MMM YYYY")}</span>;
      if (field.fieldType === "CHECKBOX") return <span>{value === "true" ? "Yes" : "No"}</span>;
      return <span>{value}</span>;
    },
  };
}

function buildActionsColumn(ctx: AssetColumnBuilderContext): ColumnDef<Asset, any> {
  const { navigate, onEdit, onQr, duplicateMutation, copyShareLink, onDelete } = ctx;
  return {
    header: "",
    id: "actions",
    cell: ({ row }) => (
      <div className="row gap-1" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-secondary btn-sm btn-icon" title="View" onClick={() => navigate(`/assets/${row.original.id}`)}><Icon name="search" size={12} /></button>
        <PermissionGate module="assets" action="edit">
          <button className="btn btn-secondary btn-sm btn-icon" title="Edit" onClick={() => onEdit(row.original)}><Icon name="edit" size={12} /></button>
        </PermissionGate>
        <button className="btn btn-secondary btn-sm btn-icon" title="Print QR label" onClick={() => onQr(row.original)}><Icon name="grid" size={12} /></button>
        <PermissionGate module="assets" action="create">
          <button className="btn btn-secondary btn-sm btn-icon" title="Duplicate" onClick={() => duplicateMutation.mutate(row.original.id)}><Icon name="paperclip" size={12} /></button>
        </PermissionGate>
        <button className="btn btn-secondary btn-sm btn-icon" title="Copy share link" onClick={() => copyShareLink(row.original)}><Icon name="chevronRight" size={12} /></button>
        <PermissionGate module="assets" action="delete">
          <button className="btn btn-danger btn-sm btn-icon" title="Delete" onClick={() => onDelete(row.original)}><Icon name="trash" size={12} /></button>
        </PermissionGate>
      </div>
    ),
  };
}
