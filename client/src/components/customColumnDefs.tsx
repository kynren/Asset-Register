import { useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { CustomColumn } from "../hooks/useCustomColumns";

interface WithCustomColumnValues {
  id: number;
  customColumnValues?: Record<number, string | null>;
}

function CustomColumnCell({
  row,
  column,
  canEdit,
  onChange,
}: {
  row: WithCustomColumnValues;
  column: CustomColumn;
  canEdit: boolean;
  onChange: (entityId: number, value: string | null) => void;
}) {
  const initial = row.customColumnValues?.[column.id] ?? "";
  return <CustomColumnCellInput key={initial} initial={initial} column={column} canEdit={canEdit} onChange={(value) => onChange(row.id, value)} />;
}

function CustomColumnCellInput({
  initial,
  column,
  canEdit,
  onChange,
}: {
  initial: string;
  column: CustomColumn;
  canEdit: boolean;
  onChange: (value: string | null) => void;
}) {
  const [value, setValue] = useState(initial);

  if (!canEdit) {
    if (column.fieldType === "BOOLEAN") return <span>{initial === "true" ? "Yes" : "No"}</span>;
    return <span>{initial || ""}</span>;
  }

  if (column.fieldType === "BOOLEAN") {
    return (
      <input
        type="checkbox"
        checked={value === "true"}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const next = e.target.checked ? "true" : "false";
          setValue(next);
          onChange(next);
        }}
      />
    );
  }

  return (
    <input
      className="input"
      style={{ minWidth: 90, padding: "3px 6px", fontSize: 12.5 }}
      type={column.fieldType === "NUMBER" ? "number" : column.fieldType === "DATE" ? "date" : "text"}
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { if (value !== initial) onChange(row.id, value || null); }}
    />
  );
}

// Appended onto a module's own ColumnDef list (before any trailing "actions" column) — see
// AssetListPage.tsx/StockPage.tsx call sites. `canEdit` is the module's own edit permission,
// same gate as every other inline-editable cell in these tables.
export function buildCustomColumnDefs<T extends WithCustomColumnValues>(
  columns: CustomColumn[],
  canEdit: boolean,
  onChange: (columnId: number, entityId: number, value: string | null) => void
): ColumnDef<T, any>[] {
  return columns.map((column) => ({
    id: `custom-${column.id}`,
    header: column.name,
    cell: ({ row }) => (
      <CustomColumnCell row={row.original} column={column} canEdit={canEdit} onChange={(entityId, value) => onChange(column.id, entityId, value)} />
    ),
  }));
}
