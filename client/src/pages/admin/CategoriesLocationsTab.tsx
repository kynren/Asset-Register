import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";
import { AssetCategoriesTable } from "./AssetCategoriesTable";
import { FormTemplatesSection } from "./FormTemplatesSection";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { BulkActionsBar, BulkDeleteButton } from "../../components/BulkActionsBar";
import { PermissionGate } from "../../auth/PermissionGate";

interface ListItem {
  id: number;
  name: string;
  address?: string;
}

function SimpleListManager({ title, url, queryKey, extraField }: { title: string; url: string; queryKey: string; extraField?: string }) {
  const [name, setName] = useState("");
  const [extra, setExtra] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<ListItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: [queryKey], queryFn: async () => (await axiosClient.get(url)).data as ListItem[] });

  function resetForm() {
    setName("");
    setExtra("");
    setEditingId(null);
  }

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post(url, extraField ? { name, [extraField]: extra } : { name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [queryKey] }); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: () => axiosClient.patch(`${url}/${editingId}`, extraField ? { name, [extraField]: extra } : { name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [queryKey] }); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`${url}/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [queryKey] }); setDeleting(null); },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`${url}/${id}/duplicate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
  });

  function startEdit(item: ListItem) {
    setEditingId(item.id);
    setName(item.name);
    setExtra(item.address ?? "");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (editingId != null) updateMutation.mutate();
    else createMutation.mutate();
  }

  const columns: ColumnDef<ListItem, any>[] = [
    { header: "Name", accessorFn: (r) => r.name + (r.address ? ` — ${r.address}` : "") },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <div className="row gap-1">
          <PermissionGate module="admin" action="edit">
            <button className="btn btn-secondary btn-sm btn-icon" onClick={() => startEdit(row.original)}>
              <Icon name="edit" size={13} />
            </button>
          </PermissionGate>
          <PermissionGate module="admin" action="create">
            <button className="btn btn-secondary btn-sm btn-icon" title="Duplicate" onClick={() => duplicateMutation.mutate(row.original.id)}>
              <Icon name="paperclip" size={13} />
            </button>
          </PermissionGate>
          <PermissionGate module="admin" action="delete">
            <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleting(row.original)}>
              <Icon name="trash" size={13} />
            </button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="card">
      <h3 className="mt-0">{title}</h3>
      <PermissionGate module="admin" action={editingId != null ? "edit" : "create"}>
        <form className="row gap-2" onSubmit={handleSubmit} style={{ marginBottom: 14 }}>
          <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          {extraField && <input className="input" placeholder={extraField} value={extra} onChange={(e) => setExtra(e.target.value)} />}
          <button className="btn btn-primary btn-sm" type="submit" disabled={saving}>
            {editingId != null ? <><Icon name="check" size={13} /> Save</> : <><Icon name="plus" size={13} /> Add</>}
          </button>
          {editingId != null && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetForm}>Cancel</button>
          )}
        </form>
      </PermissionGate>
      <BulkActionsBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <BulkDeleteButton
          selectedIds={[...selectedIds]}
          baseUrl={url}
          entityLabel={title.replace(/ies$/i, "y").replace(/s$/i, "").toLowerCase()}
          invalidateKeys={[[queryKey]]}
          onDone={() => setSelectedIds(new Set())}
        />
      </BulkActionsBar>
      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        clientPageSize={5}
        emptyMessage="None added yet."
        selection={{ selectedIds, onSelectedIdsChange: setSelectedIds, getRowId: (r) => r.id }}
      />

      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"`}
          message={`Are you sure you want to delete "${deleting.name}"? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}

export function CategoriesLocationsTab() {
  return (
    <div className="stack gap-3">
      <AssetCategoriesTable />
      <FormTemplatesSection />
      <div className="grid grid-cols-2">
        <SimpleListManager title="Locations" url="/locations" queryKey="locations" extraField="address" />
        <SimpleListManager title="Ticket Categories" url="/ticket-categories" queryKey="ticket-categories" />
      </div>
    </div>
  );
}
