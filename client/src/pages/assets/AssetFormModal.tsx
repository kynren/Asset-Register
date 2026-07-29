import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { FormModal } from "../../components/FormModal";
import { QuickAddSelect } from "../../components/QuickAddSelect";
import { Icon } from "../../components/Icon";
import { ConfirmDialog } from "../../components/ConfirmDialog";

export interface AssetFormValues {
  assetTag: string;
  name: string;
  status: string;
  categoryId: number | null;
  locationId: number | null;
  assignedToId: number | null;
  manufacturer: string;
  model: string;
  serialNumber: string;
  notes: string;
  nextServiceDate: string;
  gridPowered: boolean;
  remoteManagementEnabled: boolean;
  customFieldValues?: { fieldId: number; value: string | null }[];
}

interface AssetPhoto {
  id: number;
  url: string;
}

interface TemplateField {
  id: number;
  label: string;
  fieldType: "TEXT" | "TEXTAREA" | "NUMBER" | "DATE" | "SELECT" | "CHECKBOX";
  required: boolean;
  options: string[] | null;
}

interface ExistingCustomValue {
  fieldId: number;
  value: string | null;
}

const STATUS_OPTIONS = ["IN_USE", "IN_STORAGE", "IN_REPAIR", "RETIRED", "LOST"];

const emptyValues: AssetFormValues = {
  assetTag: "",
  name: "",
  status: "IN_USE",
  categoryId: null,
  locationId: null,
  assignedToId: null,
  manufacturer: "",
  model: "",
  serialNumber: "",
  notes: "",
  nextServiceDate: "",
  gridPowered: true,
  remoteManagementEnabled: false,
};

export function AssetFormModal({
  assetId,
  initial,
  title,
  featuredImageUrl,
  onClose,
  onSubmit,
  submitting,
  excludeCategoryNames,
  onlyCategoryNames,
}: {
  assetId?: number;
  initial?: Partial<AssetFormValues>;
  title?: string;
  featuredImageUrl?: string | null;
  onClose: () => void;
  onSubmit: (values: AssetFormValues) => void;
  submitting?: boolean;
  /** Hide these categories from the picker (e.g. categories with their own dedicated view/workflow). */
  excludeCategoryNames?: string[];
  /** Restrict the picker to only these categories. */
  onlyCategoryNames?: string[];
}) {
  const [values, setValues] = useState<AssetFormValues>({ ...emptyValues, ...initial });
  const queryClient = useQueryClient();
  const featuredInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValues({ ...emptyValues, ...initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const { data: categories } = useQuery({ queryKey: ["asset-categories"], queryFn: async () => (await axiosClient.get("/asset-categories")).data });
  const visibleCategories = categories?.filter((c: any) => {
    if (onlyCategoryNames) return onlyCategoryNames.includes(c.name);
    if (excludeCategoryNames) return !excludeCategoryNames.includes(c.name);
    return true;
  });
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: async () => (await axiosClient.get("/locations")).data });
  const { data: users } = useQuery({ queryKey: ["users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data });
  const { data: photos } = useQuery({
    queryKey: ["asset-photos", assetId],
    queryFn: async () => (await axiosClient.get(`/asset-resources/${assetId}/photos`)).data as AssetPhoto[],
    enabled: Boolean(assetId),
  });

  const { data: categoryDetail } = useQuery({
    queryKey: ["asset-category-detail", values.categoryId],
    queryFn: async () => (await axiosClient.get(`/asset-categories/${values.categoryId}`)).data,
    enabled: Boolean(values.categoryId),
  });
  const templateFields: TemplateField[] = categoryDetail?.formTemplate?.fields ?? [];

  const { data: existingAsset } = useQuery({
    queryKey: ["asset-custom-values", assetId],
    queryFn: async () => (await axiosClient.get(`/assets/${assetId}`)).data,
    enabled: Boolean(assetId),
  });

  const [customFieldInputs, setCustomFieldInputs] = useState<Record<number, string>>({});
  const [deletingPhoto, setDeletingPhoto] = useState<AssetPhoto | null>(null);
  useEffect(() => {
    if (existingAsset?.customFieldValues) {
      const seeded: Record<number, string> = {};
      for (const v of existingAsset.customFieldValues as (ExistingCustomValue & { field: { id: number } })[]) {
        seeded[v.fieldId] = v.value ?? "";
      }
      setCustomFieldInputs(seeded);
    }
  }, [existingAsset]);

  function updateCustomField(fieldId: number, value: string) {
    setCustomFieldInputs((prev) => ({ ...prev, [fieldId]: value }));
  }

  const featuredMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return axiosClient.post(`/asset-resources/${assetId}/featured-image`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset", String(assetId)] }),
  });
  const galleryUploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return axiosClient.post(`/asset-resources/${assetId}/photos`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-photos", assetId] }),
  });
  const galleryDeleteMutation = useMutation({
    mutationFn: (photoId: number) => axiosClient.delete(`/asset-resources/${assetId}/photos/${photoId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["asset-photos", assetId] }); setDeletingPhoto(null); },
  });

  function update<K extends keyof AssetFormValues>(key: K, value: AssetFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit() {
    const customFieldValues = templateFields.map((f) => ({ fieldId: f.id, value: customFieldInputs[f.id] ?? null }));
    onSubmit({ ...values, customFieldValues });
  }

  return (
    <FormModal
      title={title ?? (initial ? "Edit Asset" : "Add Asset")}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitting={submitting}
      maxWidth={760}
    >
      <div className="grid grid-cols-3">
        <div className="field">
          <label>Asset Label / Name *</label>
          <input className="input" value={values.name} onChange={(e) => update("name", e.target.value)} required placeholder="e.g. Dell Latitude 5440" />
        </div>
        <div className="field">
          <label>Serial Number</label>
          <input className="input" value={values.serialNumber} onChange={(e) => update("serialNumber", e.target.value)} placeholder="e.g. SN-7722" />
        </div>
        <div className="field">
          <label>Asset Tag *</label>
          <input className="input" value={values.assetTag} onChange={(e) => update("assetTag", e.target.value)} required placeholder="e.g. KYN-0001" />
        </div>

        <QuickAddSelect label="Category" value={values.categoryId} onChange={(id) => update("categoryId", id)} options={visibleCategories} createUrl="/asset-categories" queryKey="asset-categories" />
        <div className="field">
          <label>Status</label>
          <select className="select" value={values.status} onChange={(e) => update("status", e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </div>
        <QuickAddSelect label="Location" value={values.locationId} onChange={(id) => update("locationId", id)} options={locations} createUrl="/locations" queryKey="locations" />

        <div className="field">
          <label>Manufacturer</label>
          <input className="input" value={values.manufacturer} onChange={(e) => update("manufacturer", e.target.value)} />
        </div>
        <div className="field">
          <label>Model</label>
          <input className="input" value={values.model} onChange={(e) => update("model", e.target.value)} />
        </div>
        <div className="field">
          <label>Assigned To</label>
          <select className="select" value={values.assignedToId ?? ""} onChange={(e) => update("assignedToId", e.target.value ? Number(e.target.value) : null)}>
            <option value="">Unassigned</option>
            {users?.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Next Service Date</label>
          <input className="input" type="date" value={values.nextServiceDate} onChange={(e) => update("nextServiceDate", e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label>Comments &amp; Notes</label>
        <textarea className="input" rows={3} value={values.notes} onChange={(e) => update("notes", e.target.value)} placeholder="e.g. Backup power staging configured, ready to deploy." />
      </div>

      {templateFields.length > 0 && (
        <div className="field">
          <label>{categoryDetail?.formTemplate?.name} — Custom Fields</label>
          <div className="grid grid-cols-2">
            {templateFields.map((f) => (
              <div className="field" key={f.id}>
                <label>{f.label}{f.required && " *"}</label>
                {f.fieldType === "TEXTAREA" ? (
                  <textarea
                    className="input"
                    rows={2}
                    value={customFieldInputs[f.id] ?? ""}
                    onChange={(e) => updateCustomField(f.id, e.target.value)}
                    required={f.required}
                  />
                ) : f.fieldType === "SELECT" ? (
                  <select className="select" value={customFieldInputs[f.id] ?? ""} onChange={(e) => updateCustomField(f.id, e.target.value)} required={f.required}>
                    <option value="">Select...</option>
                    {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.fieldType === "CHECKBOX" ? (
                  <label className="row gap-2" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={customFieldInputs[f.id] === "true"}
                      onChange={(e) => updateCustomField(f.id, e.target.checked ? "true" : "false")}
                    />
                    Yes
                  </label>
                ) : (
                  <input
                    className="input"
                    type={f.fieldType === "NUMBER" ? "number" : f.fieldType === "DATE" ? "date" : "text"}
                    value={customFieldInputs[f.id] ?? ""}
                    onChange={(e) => updateCustomField(f.id, e.target.value)}
                    required={f.required}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="toggle-card">
        <div className="toggle-card-icon"><Icon name="power" size={16} /></div>
        <div className="toggle-card-body">
          <div className="toggle-card-title">Grid Powered</div>
          <div className="toggle-card-desc">This asset draws power from mains electricity (Main AC), rather than battery or backup power.</div>
        </div>
        <label className="form-toggle-switch">
          <input type="checkbox" checked={values.gridPowered} onChange={(e) => update("gridPowered", e.target.checked)} />
          <span className="form-toggle-switch-track" />
        </label>
      </div>
      <div className="toggle-card">
        <div className="toggle-card-icon"><Icon name="terminal" size={16} /></div>
        <div className="toggle-card-body">
          <div className="toggle-card-title">Remote Management</div>
          <div className="toggle-card-desc">Enable remote access tooling for this asset. Connection details can be configured after saving.</div>
        </div>
        <label className="form-toggle-switch">
          <input type="checkbox" checked={values.remoteManagementEnabled} onChange={(e) => update("remoteManagementEnabled", e.target.checked)} />
          <span className="form-toggle-switch-track" />
        </label>
      </div>

      {assetId ? (
        <div className="upload-panel-row">
          <div className="upload-panel">
            <div className="upload-panel-label">Asset Featured Image</div>
            {featuredImageUrl ? <img src={featuredImageUrl} alt="" /> : <Icon name="camera" size={22} />}
            <input
              ref={featuredInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) featuredMutation.mutate(f); if (featuredInputRef.current) featuredInputRef.current.value = ""; }}
            />
            <div className="upload-panel-hint">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => featuredInputRef.current?.click()} disabled={featuredMutation.isPending}>
                {featuredMutation.isPending ? "Uploading..." : "Upload Featured Image"}
              </button>
            </div>
          </div>
          <div className="upload-panel">
            <div className="upload-panel-label">Asset Image Gallery</div>
            <Icon name="plus" size={22} />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) galleryUploadMutation.mutate(f); if (galleryInputRef.current) galleryInputRef.current.value = ""; }}
            />
            <div className="upload-panel-hint">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => galleryInputRef.current?.click()} disabled={galleryUploadMutation.isPending}>
                Add Gallery Images
              </button>
            </div>
            {photos && photos.length > 0 && (
              <div className="row gap-1 flex-wrap" style={{ marginTop: 10, justifyContent: "center" }}>
                {photos.map((p) => (
                  <div key={p.id} style={{ position: "relative" }}>
                    <img src={p.url} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                    <button
                      type="button"
                      onClick={() => setDeletingPhoto(p)}
                      style={{ position: "absolute", top: -4, right: -4, background: "var(--color-danger)", color: "#fff", border: "none", borderRadius: "50%", width: 16, height: 16, fontSize: 10, lineHeight: "16px", cursor: "pointer", padding: 0 }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 12 }}>Save this asset first to upload a featured image and photo gallery.</p>
      )}

      {deletingPhoto && (
        <ConfirmDialog
          title="Delete photo"
          message="Are you sure you want to remove this photo from the gallery? This cannot be undone."
          danger
          loading={galleryDeleteMutation.isPending}
          onCancel={() => setDeletingPhoto(null)}
          onConfirm={() => galleryDeleteMutation.mutate(deletingPhoto.id)}
        />
      )}
    </FormModal>
  );
}
