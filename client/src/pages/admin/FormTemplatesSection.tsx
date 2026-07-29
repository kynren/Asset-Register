import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";
import { FormModal } from "../../components/FormModal";
import { FormTemplateBuilderModal } from "./FormTemplateBuilderModal";
import { ConfirmDialog } from "../../components/ConfirmDialog";

interface FormTemplate {
  id: number;
  name: string;
  description: string | null;
  categories: { id: number; name: string }[];
  fieldCount: number;
  categoryCount: number;
  updatedAt: string;
}

export function FormTemplatesSection() {
  const [showCreate, setShowCreate] = useState(false);
  const [renaming, setRenaming] = useState<FormTemplate | null>(null);
  const [managingFields, setManagingFields] = useState<FormTemplate | null>(null);
  const [deleting, setDeleting] = useState<FormTemplate | null>(null);
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery({
    queryKey: ["asset-form-templates"],
    queryFn: async () => (await axiosClient.get("/asset-form-templates")).data as FormTemplate[],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/asset-form-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-form-templates"] });
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      setDeleting(null);
    },
  });

  const columns: ColumnDef<FormTemplate, any>[] = [
    { header: "Form Name", accessorKey: "name" },
    {
      header: "Linked Categories",
      accessorFn: (r) => r.categories.map((c) => c.name).join(", "),
      cell: ({ row }) =>
        row.original.categories.length > 0 ? (
          <div className="row gap-1 flex-wrap">
            {row.original.categories.map((c) => <span key={c.id} className="badge badge-neutral">{c.name}</span>)}
          </div>
        ) : (
          <span className="muted">No categories linked</span>
        ),
    },
    { header: "Fields", accessorKey: "fieldCount" },
    { header: "Categories", accessorKey: "categoryCount" },
    { header: "Last Modified", accessorFn: (r) => dayjs(r.updatedAt).format("DD MMM YYYY, HH:mm") },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <div className="row gap-1">
          <button className="btn btn-secondary btn-sm" onClick={() => setManagingFields(row.original)}>
            <Icon name="grid" size={12} /> Manage Fields
          </button>
          <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setRenaming(row.original)} title="Rename">
            <Icon name="edit" size={12} />
          </button>
          <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleting(row.original)}>
            <Icon name="trash" size={13} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h3 className="mt-0 mb-0">Form Templates</h3>
          <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
            Custom field sets that appear on the Add/Edit Asset form when a linked category is selected.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          <Icon name="plus" size={13} /> New Template
        </button>
      </div>
      <DataTable columns={columns} data={templates ?? []} isLoading={isLoading} clientPageSize={8} emptyMessage="No form templates yet." />

      {showCreate && (
        <TemplateFormModal
          onClose={() => setShowCreate(false)}
          onCreated={(created) => { setShowCreate(false); setManagingFields(created); }}
        />
      )}
      {renaming && (
        <TemplateFormModal
          initial={renaming}
          onClose={() => setRenaming(null)}
        />
      )}
      {managingFields && (
        <FormTemplateBuilderModal
          templateId={managingFields.id}
          templateName={managingFields.name}
          onClose={() => setManagingFields(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete form template"
          message={`Are you sure you want to delete "${deleting.name}"? Categories linked to it will lose their custom fields. This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}

function TemplateFormModal({
  initial,
  onClose,
  onCreated,
}: {
  initial?: FormTemplate;
  onClose: () => void;
  onCreated?: (template: FormTemplate) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = { name, description: description || undefined };
      const res = initial
        ? await axiosClient.patch(`/asset-form-templates/${initial.id}`, payload)
        : await axiosClient.post("/asset-form-templates", payload);
      return res.data;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["asset-form-templates"] });
      if (!initial && onCreated) onCreated(created);
      else onClose();
    },
  });

  return (
    <FormModal
      title={initial ? "Rename Form Template" : "New Form Template"}
      onClose={onClose}
      onSubmit={() => mutation.mutate()}
      submitting={mutation.isPending}
      submitDisabled={!name.trim()}
      submitLabel={initial ? "Save" : "Create & Add Fields"}
    >
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Something went wrong."}</div>}
      <div className="field">
        <label>Template Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Server Hardware Details" autoFocus />
      </div>
      <div className="field">
        <label>Description (optional)</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown to admins when choosing a template" />
      </div>
    </FormModal>
  );
}
