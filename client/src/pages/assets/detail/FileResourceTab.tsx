import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { FieldConfig } from "./SubResourceTab";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { SkeletonText } from "../../../components/Skeleton";
import { PermissionGate } from "../../../auth/PermissionGate";

interface FileResourceTabProps {
  assetId: number;
  resource: "contracts" | "documents";
  title: string;
  subtitle: string;
  addLabel: string;
  fields: FieldConfig[];
  primaryField: string;
  fileOptional?: boolean;
}

export function FileResourceTab({ assetId, resource, title, subtitle, addLabel, fields, primaryField, fileOptional }: FileResourceTabProps) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState<Record<string, any> | null>(null);
  const queryKey = ["asset-resource", assetId, resource];

  const { data: items, isLoading } = useQuery({
    queryKey,
    queryFn: async () => (await axiosClient.get(`/asset-resources/${assetId}/${resource}`)).data as Record<string, any>[],
  });

  const createMutation = useMutation({
    mutationFn: (fd: FormData) => axiosClient.post(`/asset-resources/${assetId}/${resource}`, fd, { headers: { "Content-Type": "multipart/form-data" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setValues({});
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: number) => axiosClient.delete(`/asset-resources/${assetId}/${resource}/${itemId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); setDeleting(null); },
  });

  function handleSubmit() {
    const fd = new FormData();
    for (const f of fields) {
      const raw = values[f.key];
      if (raw) fd.append(f.key, raw);
    }
    if (file) fd.append("file", file);
    createMutation.mutate(fd);
  }

  const requiredFieldsFilled = fields.filter((f) => f.required).every((f) => values[f.key]);
  const canSubmit = requiredFieldsFilled && (fileOptional || Boolean(file));

  return (
    <div>
      <div className="ad-content-header">
        <h2 className="ad-content-title"><Icon name="fileText" size={16} /> {title}</h2>
        <p className="ad-content-subtitle">{subtitle}</p>
      </div>

      <div className="ad-panel">
        <div className="ad-add-form">
          {fields.map((f) => (
            <div className="ad-field" key={f.key}>
              <label>{f.label}{f.required ? " *" : ""}</label>
              <input
                className="ad-input"
                type={f.type === "date" ? "date" : "text"}
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="ad-field">
            <label>File{fileOptional ? "" : " *"}</label>
            <input ref={fileInputRef} className="ad-input" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <PermissionGate module="assets" action="edit">
            <button className="ad-btn ad-btn-primary" disabled={!canSubmit || createMutation.isPending} onClick={handleSubmit}>
              <Icon name="plus" size={12} /> {createMutation.isPending ? "Uploading..." : addLabel}
            </button>
          </PermissionGate>
        </div>

        {isLoading ? (
          <div className="stack gap-2"><SkeletonText lines={3} /></div>
        ) : items && items.length > 0 ? (
          <div className="stack gap-2">
            {items.map((item) => (
              <div key={item.id} className="ad-row-card">
                <div className="row gap-2">
                  <div className="ad-icon-circle"><Icon name="fileText" size={16} /></div>
                  <div>
                    <div className="ad-row-value">{item[primaryField]}</div>
                    <div className="ad-row-label" style={{ textTransform: "none" }}>
                      {fields.filter((f) => f.key !== primaryField && item[f.key]).map((f) => `${f.label}: ${item[f.key]}`).join(" · ")}
                      {fields.filter((f) => f.key !== primaryField && item[f.key]).length > 0 && " · "}
                      Added {dayjs(item.createdAt).format("DD MMM YYYY")}
                    </div>
                  </div>
                </div>
                <div className="row gap-1">
                  {item.fileUrl && (
                    <a className="ad-btn" href={item.fileUrl} target="_blank" rel="noreferrer">
                      <Icon name="download" size={12} /> Open
                    </a>
                  )}
                  <PermissionGate module="assets" action="edit">
                    <button className="ad-btn ad-btn-danger" onClick={() => setDeleting(item)} disabled={deleteMutation.isPending}>
                      <Icon name="trash" size={12} />
                    </button>
                  </PermissionGate>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="ad-empty">No {title.toLowerCase()} attached to this asset yet.</div>
        )}
      </div>

      {deleting && (
        <ConfirmDialog
          title={`Delete ${title.toLowerCase().replace(/s$/, "")}`}
          message={`Are you sure you want to delete "${deleting[primaryField]}"? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}
