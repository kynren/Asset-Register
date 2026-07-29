import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { SkeletonTableRows } from "../../../components/Skeleton";

interface Column {
  key: string;
  label: string;
}

export interface FieldConfig {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "number" | "date";
  placeholder?: string;
}

interface SubResourceTabProps {
  assetId: number;
  resource: string;
  title: string;
  subtitle: string;
  addLabel: string;
  columns: Column[];
  fields: FieldConfig[];
  extraInfo?: string;
}

export function SubResourceTab({ assetId, resource, title, subtitle, addLabel, columns, fields, extraInfo }: SubResourceTabProps) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<Record<string, any> | null>(null);
  const queryKey = ["asset-resource", assetId, resource];

  const { data: items, isLoading } = useQuery({
    queryKey,
    queryFn: async () => (await axiosClient.get(`/asset-resources/${assetId}/${resource}`)).data as Record<string, any>[],
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => axiosClient.post(`/asset-resources/${assetId}/${resource}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setValues({});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: number) => axiosClient.delete(`/asset-resources/${assetId}/${resource}/${itemId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); setDeleting(null); },
  });

  function handleSubmit() {
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = values[f.key];
      if (raw === undefined || raw === "") continue;
      payload[f.key] = f.type === "number" ? Number(raw) : raw;
    }
    createMutation.mutate(payload);
  }

  const canSubmit = fields.filter((f) => f.required).every((f) => values[f.key]);

  return (
    <div>
      <div className="ad-content-header">
        <h2 className="ad-content-title"><Icon name="grid" size={16} /> {title}</h2>
        <p className="ad-content-subtitle">{subtitle}</p>
      </div>

      {extraInfo && <div className="ad-row-card" style={{ marginBottom: 16 }}><span style={{ fontSize: 12 }}>{extraInfo}</span></div>}

      <div className="ad-panel">
        <div className="ad-add-form">
          {fields.map((f) => (
            <div className="ad-field" key={f.key}>
              <label>{f.label}{f.required ? " *" : ""}</label>
              <input
                className="ad-input"
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          <button className="ad-btn ad-btn-primary" disabled={!canSubmit || createMutation.isPending} onClick={handleSubmit}>
            <Icon name="plus" size={12} /> {addLabel}
          </button>
        </div>

        {isLoading ? (
          <table className="ad-table">
            <thead>
              <tr>
                {columns.map((c) => <th key={c.key}>{c.label}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              <SkeletonTableRows columns={columns.length + 1} rows={3} />
            </tbody>
          </table>
        ) : items && items.length > 0 ? (
          <table className="ad-table">
            <thead>
              <tr>
                {columns.map((c) => <th key={c.key}>{c.label}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  {columns.map((c) => <td key={c.key}>{item[c.key] ?? "—"}</td>)}
                  <td>
                    <button className="ad-btn ad-btn-danger" onClick={() => setDeleting(item)} disabled={deleteMutation.isPending}>
                      <Icon name="trash" size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="ad-empty">No {title.toLowerCase()} recorded for this asset yet.</div>
        )}
      </div>

      {deleting && (
        <ConfirmDialog
          title={`Delete ${title.toLowerCase().replace(/s$/, "")}`}
          message={`Are you sure you want to delete "${deleting[columns[0]?.key] ?? "this item"}"? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}
