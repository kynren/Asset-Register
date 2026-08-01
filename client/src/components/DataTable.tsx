import { useMemo, useState } from "react";
import { ColumnDef, SortingState, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { Icon } from "./Icon";
import { SkeletonTableRows } from "./Skeleton";

interface SelectionProps<T> {
  selectedIds: Set<number>;
  onSelectedIdsChange: (ids: Set<number>) => void;
  getRowId: (row: T) => number;
}

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
}: DataTableProps<T>) {
  const [clientPage, setClientPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);

  const isServerPaginated = page !== undefined && totalPages !== undefined;
  const isClientPaginated = !isServerPaginated && Boolean(clientPageSize);

  const clientTotalPages = isClientPaginated ? Math.max(1, Math.ceil(data.length / clientPageSize!)) : 1;
  const effectiveClientPage = Math.min(clientPage, clientTotalPages);

  const pagedData = useMemo(() => {
    if (!isClientPaginated) return data;
    const start = (effectiveClientPage - 1) * clientPageSize!;
    return data.slice(start, start + clientPageSize!);
  }, [data, isClientPaginated, effectiveClientPage, clientPageSize]);

  const table = useReactTable({
    data: pagedData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const displayPage = isServerPaginated ? page! : effectiveClientPage;
  const displayTotalPages = isServerPaginated ? totalPages! : clientTotalPages;
  const handlePageChange = isServerPaginated ? onPageChange : setClientPage;

  return (
    <div>
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
                  return (
                    <th
                      key={header.id}
                      onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                      style={sortable ? { cursor: "pointer", userSelect: "none" } : undefined}
                    >
                      <span className="row gap-1" style={{ display: "inline-flex", alignItems: "center" }}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        {sortable && (
                          <Icon name={sortDir === "asc" ? "arrowUp" : sortDir === "desc" ? "arrowDown" : "sort"} size={11} />
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading && <SkeletonTableRows columns={columns.length + (selection ? 1 : 0)} />}
            {!isLoading && data.length === 0 && (
              <tr>
                <td colSpan={columns.length + (selection ? 1 : 0)}>
                  <div className="empty-state">{emptyMessage}</div>
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
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {(isServerPaginated || isClientPaginated) && displayTotalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-secondary btn-sm" disabled={displayPage <= 1} onClick={() => handlePageChange?.(displayPage - 1)}>
            <Icon name="chevronLeft" size={14} />
          </button>
          <span className="muted">Page {displayPage} of {displayTotalPages}</span>
          <button className="btn btn-secondary btn-sm" disabled={displayPage >= displayTotalPages} onClick={() => handlePageChange?.(displayPage + 1)}>
            <Icon name="chevronRight" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
