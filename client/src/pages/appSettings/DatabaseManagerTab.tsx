import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { Icon } from "../../components/Icon";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { usePermission } from "../../auth/PermissionGate";
import { DatabaseRowFormModal } from "./DatabaseRowFormModal";
import { DatabaseRelationshipsView } from "./DatabaseRelationshipsView";
import { DbFieldInfo, DbListResult, SENSITIVE_FIELD_PATTERN, SchemaRegistry } from "./databaseTypes";

function formatCellValue(field: DbFieldInfo, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (SENSITIVE_FIELD_PATTERN.test(field.name)) return "••••••••";
  if (field.type === "Boolean") return value ? "Yes" : "No";
  if (field.type === "DateTime") {
    const d = dayjs(value as string);
    return d.isValid() ? d.format("YYYY-MM-DD HH:mm") : String(value);
  }
  if (field.type === "Json") return typeof value === "string" ? value : JSON.stringify(value);
  return String(value);
}

export function DatabaseManagerTab() {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<"tables" | "relationships">("tables");
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rowSearch, setRowSearch] = useState("");
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null | undefined>(undefined); // undefined = closed, null = create, object = edit
  const [deletingRow, setDeletingRow] = useState<Record<string, unknown> | null>(null);

  const canCreate = usePermission("app-settings", "create");
  const canEdit = usePermission("app-settings", "edit");
  const canDelete = usePermission("app-settings", "delete");

  const { data: registry } = useQuery({
    queryKey: ["db-schema"],
    queryFn: async () => (await axiosClient.get("/database/schema")).data as SchemaRegistry,
  });
  const { data: stats } = useQuery({
    queryKey: ["db-stats"],
    queryFn: async () => (await axiosClient.get("/database/stats")).data as { model: string; count: number | null }[],
  });

  const statsByModel = useMemo(() => new Map((stats ?? []).map((s) => [s.model, s.count])), [stats]);
  const model = useMemo(() => registry?.models.find((m) => m.name === selectedModel) ?? null, [registry, selectedModel]);

  const filteredModels = useMemo(() => {
    const list = registry?.models ?? [];
    if (!modelSearch.trim()) return list;
    const q = modelSearch.trim().toLowerCase();
    return list.filter((m) => m.name.toLowerCase().includes(q));
  }, [registry, modelSearch]);

  const { data: rowsResult, isLoading: rowsLoading } = useQuery({
    queryKey: ["db-rows", selectedModel, page, rowSearch],
    queryFn: async () => (await axiosClient.get(`/database/tables/${selectedModel}`, { params: { page, pageSize: 25, search: rowSearch || undefined } })).data as DbListResult,
    enabled: !!selectedModel,
  });

  function invalidateRows() {
    queryClient.invalidateQueries({ queryKey: ["db-rows", selectedModel] });
    queryClient.invalidateQueries({ queryKey: ["db-stats"] });
  }

  const createMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => axiosClient.post(`/database/tables/${selectedModel}`, values),
    onSuccess: () => { invalidateRows(); setEditingRow(undefined); },
  });
  const updateMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => axiosClient.patch(`/database/tables/${selectedModel}/${(editingRow as Record<string, unknown>)[model!.idField]}`, values),
    onSuccess: () => { invalidateRows(); setEditingRow(undefined); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: unknown) => axiosClient.delete(`/database/tables/${selectedModel}/${id}`),
    onSuccess: () => { invalidateRows(); setDeletingRow(null); },
  });

  function selectModel(name: string) {
    setSelectedModel(name);
    setSubTab("tables");
    setPage(1);
    setRowSearch("");
  }

  const columns: ColumnDef<Record<string, unknown>, any>[] = useMemo(() => {
    if (!model) return [];
    const fieldCols: ColumnDef<Record<string, unknown>, any>[] = model.fields.map((f) => ({
      id: f.name,
      accessorKey: f.name,
      header: f.name,
      cell: ({ getValue }) => formatCellValue(f, getValue()),
      enableSorting: false,
    }));
    fieldCols.push({
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="row gap-1">
          {canEdit && (
            <button className="btn btn-secondary btn-sm btn-icon" title="Edit" onClick={(e) => { e.stopPropagation(); setEditingRow(row.original); }}>
              <Icon name="edit" size={12} />
            </button>
          )}
          {canDelete && (
            <button className="btn btn-danger btn-sm btn-icon" title="Delete" onClick={(e) => { e.stopPropagation(); setDeletingRow(row.original); }}>
              <Icon name="trash" size={12} />
            </button>
          )}
        </div>
      ),
    });
    return fieldCols;
  }, [model, canEdit, canDelete]);

  return (
    <div className="stack gap-3">
      <div className="row gap-2">
        <button className={`btn btn-sm ${subTab === "tables" ? "btn-primary" : "btn-secondary"}`} onClick={() => setSubTab("tables")}>
          <Icon name="hardDrive" size={13} /> Tables
        </button>
        <button className={`btn btn-sm ${subTab === "relationships" ? "btn-primary" : "btn-secondary"}`} onClick={() => setSubTab("relationships")}>
          <Icon name="layersStack" size={13} /> Relationships
        </button>
      </div>

      {subTab === "relationships" && registry && <DatabaseRelationshipsView registry={registry} onSelectModel={selectModel} />}

      {subTab === "tables" && (
        <div className="row gap-3" style={{ alignItems: "flex-start" }}>
          <div className="card" style={{ width: 260, flexShrink: 0, maxHeight: 720, overflowY: "auto" }}>
            <input className="input" placeholder="Search tables..." value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} style={{ marginBottom: 8 }} />
            <div className="stack gap-1">
              {filteredModels.map((m) => (
                <button
                  key={m.name}
                  type="button"
                  className={`btn btn-sm ${selectedModel === m.name ? "btn-primary" : "btn-secondary"}`}
                  style={{ justifyContent: "space-between", display: "flex" }}
                  onClick={() => selectModel(m.name)}
                >
                  <span>{m.name}</span>
                  <span className="muted" style={{ fontSize: 11 }}>{statsByModel.get(m.name) ?? "—"}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {!model && <div className="empty-state card">Select a table from the left to browse its data.</div>}
            {model && (
              <div className="card">
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <h3 className="mt-0 mb-0">{model.name}</h3>
                    {model.sensitive && (
                      <p className="muted" style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-danger)" }}>
                        <Icon name="alertTriangle" size={11} /> Sensitive table — contains security-relevant data. Edit/delete with care.
                      </p>
                    )}
                  </div>
                  {canCreate && (
                    <button className="btn btn-primary btn-sm" onClick={() => setEditingRow(null)}>
                      <Icon name="plus" size={13} /> Add {model.name}
                    </button>
                  )}
                </div>
                <DataTable
                  tableId={`db-${model.name}`}
                  columns={columns}
                  data={rowsResult?.rows ?? []}
                  isLoading={rowsLoading}
                  page={rowsResult?.page ?? 1}
                  totalPages={rowsResult?.totalPages ?? 1}
                  onPageChange={setPage}
                  search={rowSearch}
                  onSearchChange={(v) => { setRowSearch(v); setPage(1); }}
                  searchable
                  onRowClick={canEdit ? (row) => setEditingRow(row) : undefined}
                  emptyMessage={`No ${model.name} records.`}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {editingRow !== undefined && model && registry && (
        <DatabaseRowFormModal
          model={model}
          enums={registry.enums}
          initial={editingRow}
          submitting={createMutation.isPending || updateMutation.isPending}
          onClose={() => setEditingRow(undefined)}
          onSubmit={(values) => (editingRow ? updateMutation.mutate(values) : createMutation.mutate(values))}
        />
      )}

      {deletingRow && model && (
        <ConfirmDialog
          title={`Delete ${model.name}`}
          message={`Are you sure you want to delete this ${model.name} record (#${String(deletingRow[model.idField])})? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeletingRow(null)}
          onConfirm={() => deleteMutation.mutate(deletingRow[model.idField])}
        />
      )}
    </div>
  );
}
