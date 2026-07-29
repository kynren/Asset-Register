import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";
import { FormModal } from "../../components/FormModal";

interface FormTemplateRef {
  id: number;
  name: string;
}

interface AssetCategory {
  id: number;
  name: string;
  isComputerAsset: boolean;
  formTemplateId: number | null;
  formTemplate: FormTemplateRef | null;
}

export function AssetCategoriesTable() {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AssetCategory | null>(null);
  const queryClient = useQueryClient();

  const { data: categories, isLoading } = useQuery({
    queryKey: ["asset-categories"],
    queryFn: async () => (await axiosClient.get("/asset-categories")).data as AssetCategory[],
  });
  const { data: templates } = useQuery({
    queryKey: ["asset-form-templates"],
    queryFn: async () => (await axiosClient.get("/asset-form-templates")).data,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/asset-categories/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-categories"] }),
  });

  const columns: ColumnDef<AssetCategory, any>[] = [
    { header: "Name", accessorKey: "name" },
    {
      header: "Type",
      accessorFn: (r) => (r.isComputerAsset ? "Computer / Network" : "Generic"),
      cell: ({ row }) => (
        <span className={`badge ${row.original.isComputerAsset ? "badge-primary" : "badge-neutral"}`}>
          {row.original.isComputerAsset ? "Computer / Network" : "Generic"}
        </span>
      ),
    },
    {
      header: "Linked Form Template",
      accessorFn: (r) => r.formTemplate?.name ?? "",
      cell: ({ row }) =>
        row.original.formTemplate ? (
          <span className="badge badge-primary">{row.original.formTemplate.name}</span>
        ) : (
          <span className="muted">Not linked</span>
        ),
    },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <div className="row gap-1">
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(row.original)}>
            <Icon name="edit" size={12} /> Edit
          </button>
          <button className="btn btn-danger btn-sm btn-icon" onClick={() => deleteMutation.mutate(row.original.id)}>
            <Icon name="trash" size={13} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <h3 className="mt-0 mb-0">Asset Categories</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
          <Icon name="plus" size={13} /> Add Category
        </button>
      </div>
      <DataTable columns={columns} data={categories ?? []} isLoading={isLoading} clientPageSize={8} emptyMessage="No asset categories yet." />

      {showForm && (
        <CategoryFormModal
          templates={templates ?? []}
          onClose={() => setShowForm(false)}
        />
      )}
      {editing && (
        <CategoryFormModal
          templates={templates ?? []}
          initial={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CategoryFormModal({
  templates,
  initial,
  onClose,
}: {
  templates: FormTemplateRef[];
  initial?: AssetCategory;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [formTemplateId, setFormTemplateId] = useState<string>(initial?.formTemplateId ? String(initial.formTemplateId) : "");
  const [isComputerAsset, setIsComputerAsset] = useState(initial?.isComputerAsset ?? false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { name, formTemplateId: formTemplateId ? Number(formTemplateId) : null, isComputerAsset };
      return initial ? axiosClient.patch(`/asset-categories/${initial.id}`, payload) : axiosClient.post("/asset-categories", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      queryClient.invalidateQueries({ queryKey: ["asset-form-templates"] });
      onClose();
    },
  });

  return (
    <FormModal
      title={initial ? "Edit Asset Category" : "Add Asset Category"}
      onClose={onClose}
      onSubmit={() => mutation.mutate()}
      submitting={mutation.isPending}
      submitDisabled={!name.trim()}
      submitLabel={initial ? "Save" : "Add Category"}
    >
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Something went wrong."}</div>}
      <div className="field">
        <label>Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="toggle-card">
        <div className="toggle-card-icon"><Icon name="cpu" size={16} /></div>
        <div className="toggle-card-body">
          <div className="toggle-card-title">Computer / Network Related Asset</div>
          <div className="toggle-card-desc">
            Assets in this category show the full IT menu (Operating Systems, Components, Volumes, Software, Connections,
            Network Ports, Sockets, Remote Management, Virtualization, Antiviruses). Leave off for a generic asset with
            just Profile, Impact Analysis, Location, Management, Contracts, Documents, Reports, and Logs.
          </div>
        </div>
        <label className="form-toggle-switch">
          <input type="checkbox" checked={isComputerAsset} onChange={(e) => setIsComputerAsset(e.target.checked)} />
          <span className="form-toggle-switch-track" />
        </label>
      </div>
      <div className="field">
        <label>Linked Form Template</label>
        <select className="select" value={formTemplateId} onChange={(e) => setFormTemplateId(e.target.value)}>
          <option value="">None — use standard asset fields only</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        When this category is selected on an asset, the linked form template's custom fields appear on the Add/Edit Asset form.
        Manage templates and their fields in the Form Templates section below.
      </p>
    </FormModal>
  );
}
