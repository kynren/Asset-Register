import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { DEFAULT_GENERIC_COLUMNS, GENERIC_COLUMN_LABELS, GenericColumnKey, columnKeyForField } from "../assets/assetTableColumns";

interface CategoryField {
  id: number;
  label: string;
  fieldKey: string;
}

interface CategoryDetail {
  id: number;
  name: string;
  tableColumns: string[] | null;
  formTemplate: { id: number; name: string; fields: CategoryField[] } | null;
}

// Lets an admin pick which columns a category's asset table shows — the generic set (checked
// against DEFAULT_GENERIC_COLUMNS when tableColumns is null) plus one checkbox per live custom
// field from the category's linked form template. Categories without a form template simply see
// no custom-field options.
export function CategoryColumnsModal({ categoryId, onClose }: { categoryId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: category, isLoading } = useQuery({
    queryKey: ["asset-category-detail", categoryId],
    queryFn: async () => (await axiosClient.get(`/asset-categories/${categoryId}`)).data as CategoryDetail,
  });

  const [selected, setSelected] = useState<string[] | null>(null);
  const columns = selected ?? category?.tableColumns ?? DEFAULT_GENERIC_COLUMNS;

  const mutation = useMutation({
    mutationFn: (tableColumns: string[] | null) => axiosClient.patch(`/asset-categories/${categoryId}`, { tableColumns }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-category-detail", categoryId] });
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      onClose();
    },
  });

  function toggle(key: string) {
    const next = columns.includes(key) ? columns.filter((k) => k !== key) : [...columns, key];
    setSelected(next);
  }

  return (
    <FormModal
      title={`Configure Columns${category ? ` — ${category.name}` : ""}`}
      onClose={onClose}
      onSubmit={() => mutation.mutate(columns)}
      submitting={mutation.isPending}
      maxWidth={480}
    >
      {isLoading && <div className="muted">Loading...</div>}
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Could not save columns."}</div>}

      {!isLoading && (
        <>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            Choose which columns this category's asset table shows. The Actions column is always shown and can't be removed.
          </p>

          <div className="field">
            <label>General fields</label>
            <div className="stack gap-1">
              {(Object.keys(GENERIC_COLUMN_LABELS) as GenericColumnKey[]).map((key) => (
                <label key={key} className="row gap-2" style={{ alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={columns.includes(key)} onChange={() => toggle(key)} />
                  {GENERIC_COLUMN_LABELS[key]}
                </label>
              ))}
            </div>
          </div>

          {category?.formTemplate?.fields && category.formTemplate.fields.length > 0 && (
            <div className="field">
              <label>Custom fields ({category.formTemplate.name})</label>
              <div className="stack gap-1">
                {category.formTemplate.fields.map((f) => {
                  const key = columnKeyForField(f.fieldKey);
                  return (
                    <label key={f.id} className="row gap-2" style={{ alignItems: "center", fontSize: 13 }}>
                      <input type="checkbox" checked={columns.includes(key)} onChange={() => toggle(key)} />
                      {f.label}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setSelected(null);
              mutation.mutate(null);
            }}
          >
            Reset to default
          </button>
        </>
      )}
    </FormModal>
  );
}
