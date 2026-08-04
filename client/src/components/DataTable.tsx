import { ReactNode, useEffect, useMemo, useState } from "react";
import { ColumnDef, ColumnSizingState, Row, SortingState, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { Icon } from "./Icon";
import { CsvImportButton } from "./CsvButtons";
import { SkeletonCard, SkeletonTableRows } from "./Skeleton";
import { useUserPreference } from "../hooks/useUserPreference";
import { useAuth } from "../auth/AuthContext";
import { ModuleName } from "../lib/permissions";

interface SelectionProps<T> {
  selectedIds: Set<number>;
  onSelectedIdsChange: (ids: Set<number>) => void;
  getRowId: (row: T) => number;
}

type ViewMode = "list" | "grid";

interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  /** When page/totalPages/onPageChange are not supplied, paginate `data` client-side at this page size. */
  clientPageSize?: number;
  /** Adds a checkbox column and select-all header checkbox for bulk actions (see BulkActionsBar). */
  selection?: SelectionProps<T>;
  /**
   * Explicitly show/hide the search box. Defaults to shown unless the table is server-paginated
   * (page/totalPages/onPageChange supplied) with no controlled search props — in that case DataTable
   * only has the current page's rows, so a self-managed filter would silently miss matches on other
   * pages. Set true there once the page wires `search`/`onSearchChange` into its own server query.
   */
  searchable?: boolean;
  /** Controlled search text — pass this + onSearchChange when the parent owns filtering (typically
   * server-side, alongside page/totalPages). Omit both to let DataTable filter `data` itself client-side. */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /**
   * Unique id for this table instance — becomes the persisted preference key
   * `dataTable.viewMode.${tableId}` so each user's grid/list choice survives reload and applies
   * per-table (not globally). Required so the toggle can always persist somewhere sensible.
   */
  tableId: string;
  /** Which view mode a user sees before they've ever chosen one for this table. Defaults to "grid". */
  defaultViewMode?: ViewMode;
  /** Bespoke card renderer for grid mode. Omit to fall back to an auto-generated card built from `columns`. */
  renderCard?: (row: T, index: number) => ReactNode;
  /**
   * RBAC module to check for the "export" action — pass this to show an "Export CSV" button,
   * gated the same way Create/Edit/Delete buttons on the same page already are. Omit to leave
   * export off entirely (e.g. tables of live/transient data with nothing meaningful to export).
   */
  exportModule?: ModuleName;
  /** Filename for the CSV download (".csv" appended if missing). Defaults to `${tableId}.csv`. */
  exportFilename?: string;
  /**
   * Endpoint to POST an uploaded CSV to for bulk-creating rows — pass this to show an "Import CSV"
   * button next to Export, gated by the same `exportModule`'s "create" permission. Omit to leave
   * import off (e.g. resources with relations or validation too complex for a flat CSV row).
   */
  importUrl?: string;
  /** Called after a successful import with the server's {created, errors} summary, so the caller
   *  can refetch its list query and surface the result. */
  onImported?: (result: { created: number; errors: string[] }) => void;
}

function getColumnRawValue<T>(row: T, col: ColumnDef<T, any>): unknown {
  const anyCol = col as any;
  if (typeof anyCol.accessorFn === "function") return anyCol.accessorFn(row, 0);
  if (typeof anyCol.accessorKey === "string") {
    return anyCol.accessorKey.split(".").reduce((acc: any, key: string) => acc?.[key], row);
  }
  return undefined;
}

function csvCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// Exports every row currently matching search/column filters (not just the visible page) as a
// CSV, using each column's own header label and the same accessor DataTable already uses for
// search/filtering — so "what you filtered to" is exactly "what you get", regardless of pagination.
function exportRowsToCsv<T>(rows: T[], columns: ColumnDef<T, any>[], filename: string) {
  const exportable = columns.filter((c) => getColumnId(c) !== undefined || typeof (c as any).accessorFn === "function");
  const headers = exportable.map((c) => (typeof c.header === "string" ? c.header : getColumnId(c) ?? ""));
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) =>
      exportable
        .map((col) => {
          const val = getColumnRawValue(row, col);
          if (val === null || val === undefined || typeof val === "object") return "";
          return csvCell(val);
        })
        .join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Same id tanstack itself derives when a ColumnDef has no explicit `id` — needed so the filter
// row's state keys line up with `header.column.id` when rendering inputs against live headers.
function getColumnId<T>(col: ColumnDef<T, any>): string | undefined {
  const anyCol = col as any;
  return anyCol.id ?? anyCol.accessorKey;
}

// Full-row text match across every column with an accessor — skips pure-UI columns (e.g. an
// "actions" column with only a `cell` renderer) and nested objects, which have no single sensible
// string form here. Matches the same "search everything visible" expectation FilterBar's search
// gives on pages that wire it server-side.
function rowMatchesSearch<T>(row: T, columns: ColumnDef<T, any>[], query: string): boolean {
  return columns.some((col) => {
    const val = getColumnRawValue(row, col);
    if (val === null || val === undefined || typeof val === "object") return false;
    return String(val).toLowerCase().includes(query);
  });
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyMessage = "No records found.",
  page,
  totalPages,
  onPageChange,
  onRowClick,
  clientPageSize,
  selection,
  searchable,
  search: controlledSearch,
  onSearchChange,
  searchPlaceholder = "Search...",
  tableId,
  defaultViewMode = "grid",
  renderCard,
  exportModule,
  exportFilename,
  importUrl,
  onImported,
}: DataTableProps<T>) {
  const { hasPermission } = useAuth();
  const [clientPage, setClientPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [internalSearch, setInternalSearch] = useState("");
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const { value: viewMode, setValue: setViewMode } = useUserPreference<ViewMode>(`dataTable.viewMode.${tableId}`, defaultViewMode);

  const isServerPaginated = page !== undefined && totalPages !== undefined;
  // Every table paginates client-side at 10 rows by default unless the caller opts into
  // server-side pagination (page/totalPages/onPageChange) or picks its own clientPageSize.
  const effectiveClientPageSize = clientPageSize ?? 10;
  const isClientPaginated = !isServerPaginated;
  const isControlledSearch = onSearchChange !== undefined;
  // Self-managed filtering only makes sense when DataTable actually holds the full dataset —
  // for server-paginated tables `data` is just the current page, so silently filtering it would
  // hide matches that exist on other pages instead of finding them.
  const showSearch = searchable ?? (isControlledSearch || !isServerPaginated);
  const searchValue = isControlledSearch ? controlledSearch ?? "" : internalSearch;
  // Per-column filters run against the same in-memory dataset the global search does, so they're
  // subject to the identical "only the current page" trap on server-paginated tables — hide the
  // toggle there rather than silently filtering just the visible slice.
  const showColumnFilterToggle = !isServerPaginated;

  function handleSearchChange(value: string) {
    if (isControlledSearch) {
      onSearchChange!(value);
    } else {
      setInternalSearch(value);
      setClientPage(1);
    }
  }

  function handleColumnFilterChange(columnId: string, value: string) {
    setColumnFilters((prev) => ({ ...prev, [columnId]: value }));
    setClientPage(1);
  }

  const searchedData = useMemo(() => {
    if (isControlledSearch || isServerPaginated || !internalSearch.trim()) return data;
    const q = internalSearch.trim().toLowerCase();
    return data.filter((row) => rowMatchesSearch(row, columns, q));
  }, [data, columns, internalSearch, isControlledSearch, isServerPaginated]);

  const filteredData = useMemo(() => {
    if (isServerPaginated) return searchedData;
    const active = Object.entries(columnFilters).filter(([, v]) => v.trim() !== "");
    if (active.length === 0) return searchedData;
    return searchedData.filter((row) =>
      active.every(([columnId, value]) => {
        const col = columns.find((c) => getColumnId(c) === columnId);
        if (!col) return true;
        const raw = getColumnRawValue(row, col);
        if (raw === null || raw === undefined) return false;
        return String(raw).toLowerCase().includes(value.trim().toLowerCase());
      })
    );
  }, [searchedData, columnFilters, columns, isServerPaginated]);

  const clientTotalPages = isClientPaginated ? Math.max(1, Math.ceil(filteredData.length / effectiveClientPageSize)) : 1;
  const effectiveClientPage = Math.min(clientPage, clientTotalPages);

  const pagedData = useMemo(() => {
    if (!isClientPaginated) return filteredData;
    const start = (effectiveClientPage - 1) * effectiveClientPageSize;
    return filteredData.slice(start, start + effectiveClientPageSize);
  }, [filteredData, isClientPaginated, effectiveClientPage, effectiveClientPageSize]);

  const table = useReactTable({
    data: pagedData,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const displayPage = isServerPaginated ? page! : effectiveClientPage;
  const displayTotalPages = isServerPaginated ? totalPages! : clientTotalPages;
  const handlePageChange = isServerPaginated ? onPageChange : setClientPage;

  // Server-paginated tables only ever hold the current page in `data` — `filteredData` already
  // reduces to exactly that page for them (see above), so export still works, it just covers the
  // current page rather than every row matching the filters. The button label makes that explicit
  // rather than silently producing a partial file under a name that implies "everything".
  const canExport = !!exportModule && hasPermission(exportModule, "export");
  const canImport = !!importUrl && !!exportModule && hasPermission(exportModule, "import");

  return (
    <div>
      <div className="row gap-2" style={{ marginBottom: 10, alignItems: "center" }}>
        {showSearch && (
          <div style={{ position: "relative", maxWidth: 280, flex: "0 1 280px" }}>
            <span style={{ position: "absolute", left: 10, top: 9, color: "var(--color-text-muted)" }}>
              <Icon name="search" size={14} />
            </span>
            <input
              className="input"
              style={{ paddingLeft: 30 }}
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
        )}
        {showColumnFilterToggle && (
          <button
            type="button"
            className={`btn btn-sm ${showColumnFilters ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setShowColumnFilters((v) => !v)}
            title="Filter by column"
          >
            <Icon name="filter" size={13} /> Filters
          </button>
        )}
        <div className="flex-1" />
        {canExport && (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            title={isServerPaginated ? "Export the current page to CSV" : "Export the currently filtered rows to CSV"}
            onClick={() => exportRowsToCsv(filteredData, columns, exportFilename ?? tableId)}
          >
            <Icon name="download" size={13} /> {isServerPaginated ? "Export Page" : "Export CSV"}
          </button>
        )}
        {canImport && <CsvImportButton url={importUrl!} onImported={onImported ?? (() => undefined)} />}
        <div className="row gap-1">
          <button
            type="button"
            className={`btn btn-sm btn-icon ${viewMode === "list" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setViewMode("list")}
            title="List view"
          >
            <Icon name="menu" size={13} />
          </button>
          <button
            type="button"
            className={`btn btn-sm btn-icon ${viewMode === "grid" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setViewMode("grid")}
            title="Grid view"
          >
            <Icon name="grid" size={13} />
          </button>
        </div>
      </div>
      {viewMode === "grid" ? (
        <GridView table={table} isLoading={isLoading} pagedData={pagedData} data={data} columns={columns} emptyMessage={emptyMessage} onRowClick={onRowClick} renderCard={renderCard} />
      ) : (
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {selection && (
                  <th style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      checked={pagedData.length > 0 && pagedData.every((row) => selection.selectedIds.has(selection.getRowId(row)))}
                      onChange={() => {
                        const allSelected = pagedData.length > 0 && pagedData.every((row) => selection.selectedIds.has(selection.getRowId(row)));
                        const next = new Set(selection.selectedIds);
                        if (allSelected) pagedData.forEach((row) => next.delete(selection.getRowId(row)));
                        else pagedData.forEach((row) => next.add(selection.getRowId(row)));
                        selection.onSelectedIdsChange(next);
                      }}
                    />
                  </th>
                )}
                {headerGroup.headers.map((header) => {
                  const sortable = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  const resizedWidth = columnSizing[header.column.id];
                  return (
                    <th
                      key={header.id}
                      onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                      style={{
                        ...(sortable ? { cursor: "pointer", userSelect: "none" } : undefined),
                        ...(resizedWidth ? { width: resizedWidth, maxWidth: resizedWidth } : undefined),
                      }}
                    >
                      <span className="row gap-1" style={{ display: "inline-flex", alignItems: "center" }}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        {sortable && (
                          <Icon name={sortDir === "asc" ? "arrowUp" : sortDir === "desc" ? "arrowDown" : "sort"} size={11} />
                        )}
                      </span>
                      {header.column.getCanResize() && (
                        <div
                          className={`col-resize-handle ${header.column.getIsResizing() ? "resizing" : ""}`}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            header.getResizeHandler()(e);
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            header.getResizeHandler()(e);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
            {showColumnFilters && (
              <tr className="col-filter-row">
                {selection && <th />}
                {table.getHeaderGroups()[0]?.headers.map((header) => {
                  const columnId = getColumnId(header.column.columnDef);
                  const canFilter = columnId !== undefined;
                  return (
                    <th key={`filter-${header.id}`}>
                      {canFilter && (
                        <input
                          className="col-filter-input"
                          placeholder="Filter..."
                          value={columnFilters[columnId!] ?? ""}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleColumnFilterChange(columnId!, e.target.value)}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            )}
          </thead>
          <tbody>
            {isLoading && <SkeletonTableRows columns={columns.length + (selection ? 1 : 0)} />}
            {!isLoading && pagedData.length === 0 && (
              <tr>
                <td colSpan={columns.length + (selection ? 1 : 0)}>
                  <div className="empty-state">
                    {data.length > 0 ? "No records match your search." : emptyMessage}
                  </div>
                </td>
              </tr>
            )}
            {!isLoading &&
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} onClick={() => onRowClick?.(row.original)} style={{ cursor: onRowClick ? "pointer" : undefined }}>
                  {selection && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selection.selectedIds.has(selection.getRowId(row.original))}
                        onChange={() => {
                          const id = selection.getRowId(row.original);
                          const next = new Set(selection.selectedIds);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          selection.onSelectedIdsChange(next);
                        }}
                      />
                    </td>
                  )}
                  {row.getVisibleCells().map((cell) => {
                    const resizedWidth = columnSizing[cell.column.id];
                    return (
                      <td key={cell.id} style={resizedWidth ? { width: resizedWidth, maxWidth: resizedWidth, overflow: "hidden", textOverflow: "ellipsis" } : undefined}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      )}

      {(isServerPaginated || isClientPaginated) && displayTotalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-secondary btn-sm" disabled={displayPage <= 1} onClick={() => handlePageChange?.(displayPage - 1)}>
            <Icon name="chevronLeft" size={14} />
          </button>
          <PageJump page={displayPage} totalPages={displayTotalPages} onChange={(p) => handlePageChange?.(p)} />
          <button className="btn btn-secondary btn-sm" disabled={displayPage >= displayTotalPages} onClick={() => handlePageChange?.(displayPage + 1)}>
            <Icon name="chevronRight" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// Lets a user type a page number directly instead of only stepping with Prev/Next — commits on
// blur or Enter, clamped to [1, totalPages]. Keeps its own draft text so digits typed mid-edit
// (e.g. "1" before "12") don't get clobbered by the controlled `page` prop on every keystroke.
function PageJump({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  const [draft, setDraft] = useState(String(page));

  useEffect(() => setDraft(String(page)), [page]);

  function commit() {
    const parsed = Math.max(1, Math.min(totalPages, Number(draft) || page));
    setDraft(String(parsed));
    if (parsed !== page) onChange(parsed);
  }

  return (
    <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      Page
      <input
        className="input"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        style={{ width: 40, padding: "3px 4px", textAlign: "center" }}
        aria-label="Go to page"
      />
      of {totalPages}
    </span>
  );
}

// Grid-mode body for DataTable — reuses the same react-table row model list mode builds (no
// second column-resolution path), rendering each row via the caller's `renderCard` or, when
// omitted, an auto-generated card derived from the same `columns` already passed to the table.
function GridView<T>({
  table,
  isLoading,
  pagedData,
  data,
  columns,
  emptyMessage,
  onRowClick,
  renderCard,
}: {
  table: ReturnType<typeof useReactTable<T>>;
  isLoading?: boolean;
  pagedData: T[];
  data: T[];
  columns: ColumnDef<T, any>[];
  emptyMessage: string;
  onRowClick?: (row: T) => void;
  renderCard?: (row: T, index: number) => ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-4" style={{ gap: 12 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }
  if (pagedData.length === 0) {
    return <div className="empty-state">{data.length > 0 ? "No records match your search." : emptyMessage}</div>;
  }
  return (
    <div className="grid grid-cols-4" style={{ gap: 12 }}>
      {table.getRowModel().rows.map((row, i) =>
        renderCard ? (
          <div key={row.id}>{renderCard(row.original, i)}</div>
        ) : (
          <AutoCard key={row.id} row={row} columns={columns} onClick={onRowClick ? () => onRowClick(row.original) : undefined} />
        )
      )}
    </div>
  );
}

// Fallback grid card for tables that don't pass a bespoke `renderCard` — derives its layout from
// the same columns already given to the table, so grid view works for every table with zero
// per-page card component required. The column flagged `meta: { cardTitle: true }` (else the
// first column) becomes the card title; an `id === "actions"` column (a convention already
// consistent at every call site) becomes a compact action row instead of inline table buttons;
// everything else renders as a stacked label:value list.
function AutoCard<T>({ row, columns, onClick }: { row: Row<T>; columns: ColumnDef<T, any>[]; onClick?: () => void }) {
  const cells = row.getVisibleCells();
  const titleIndex = columns.findIndex((c) => (c as any).meta?.cardTitle);
  const titleCell = cells[titleIndex >= 0 ? titleIndex : 0];
  const actionsCell = cells.find((c) => c.column.id === "actions");
  const bodyCells = cells.filter((c) => c.id !== titleCell?.id && c.column.id !== "actions");

  return (
    <div className="card" style={{ cursor: onClick ? "pointer" : undefined }} onClick={onClick}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
        <div style={{ fontWeight: 600 }}>{titleCell ? flexRender(titleCell.column.columnDef.cell, titleCell.getContext()) : null}</div>
        {actionsCell && <div onClick={(e) => e.stopPropagation()}>{flexRender(actionsCell.column.columnDef.cell, actionsCell.getContext())}</div>}
      </div>
      <div className="stack gap-1">
        {bodyCells.map((cell) => {
          const header = cell.column.columnDef.header;
          const label = typeof header === "string" && header ? header : undefined;
          return (
            <div key={cell.id} className="row gap-2" style={{ fontSize: 12, justifyContent: "space-between" }}>
              {label && <span className="muted">{label}</span>}
              <span>{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
