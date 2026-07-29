import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";

function BrandingUploader({ type, label, currentUrl }: { type: "appIcon" | "favicon"; label: string; currentUrl: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("type", type);
      formData.append("file", file);
      return axiosClient.post("/settings/branding", formData, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      queryClient.invalidateQueries({ queryKey: ["branding-public"] });
    },
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="row gap-3" style={{ alignItems: "center" }}>
      <div style={{ width: 48, height: 48, borderRadius: 8, background: "var(--color-bg)", border: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {currentUrl ? <img src={currentUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <Icon name="admin" size={20} />}
      </div>
      <div className="flex-1">
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div className="muted" style={{ fontSize: 11 }}>PNG, JPEG, or SVG, up to 2MB</div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleChange} />
      <button className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()} disabled={uploadMutation.isPending}>
        {uploadMutation.isPending ? "Uploading..." : "Upload"}
      </button>
    </div>
  );
}

export function SystemSettingsTab() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["system-settings"], queryFn: async () => (await axiosClient.get("/settings")).data });
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (settings) setValues(settings); }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.put("/settings", { values }),
    onSuccess: () => { setSaved(true); queryClient.invalidateQueries({ queryKey: ["system-settings"] }); setTimeout(() => setSaved(false), 2000); },
  });

  const { data: agentKeys } = useQuery({ queryKey: ["agent-keys"], queryFn: async () => (await axiosClient.get("/settings/agent-keys")).data });
  const createKeyMutation = useMutation({
    mutationFn: (label: string) => axiosClient.post("/settings/agent-keys", { label }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent-keys"] }),
  });
  const toggleKeyMutation = useMutation({
    mutationFn: (params: { id: number; isActive: boolean }) => axiosClient.patch(`/settings/agent-keys/${params.id}`, { isActive: params.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent-keys"] }),
  });

  const agentKeyColumns: ColumnDef<any, any>[] = [
    { header: "Label", accessorFn: (k) => k.label ?? "—" },
    { header: "Key", cell: ({ row }) => <span style={{ fontFamily: "monospace", fontSize: 11 }}>{row.original.key.slice(0, 16)}...</span> },
    { header: "Created", accessorFn: (k) => dayjs(k.createdAt).format("DD MMM YYYY") },
    { header: "Status", cell: ({ row }) => (row.original.isActive ? <span className="badge badge-success">Active</span> : <span className="badge badge-neutral">Revoked</span>) },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <button className="btn btn-secondary btn-sm" onClick={() => toggleKeyMutation.mutate({ id: row.original.id, isActive: !row.original.isActive })}>
          {row.original.isActive ? "Revoke" : "Reactivate"}
        </button>
      ),
    },
  ];

  return (
    <div className="stack gap-3">
      <div className="card" style={{ maxWidth: 480 }}>
        <h3 className="mt-0">General Settings</h3>
        {saved && <div className="alert alert-success">Settings saved.</div>}
        <div className="field"><label>Company Name</label><input className="input" value={values.companyName ?? ""} onChange={(e) => setValues((v) => ({ ...v, companyName: e.target.value }))} /></div>
        <div className="field"><label>Minimum Password Length</label><input className="input" type="number" value={values.passwordMinLength ?? ""} onChange={(e) => setValues((v) => ({ ...v, passwordMinLength: e.target.value }))} /></div>
        <div className="field"><label>Device Offline Threshold (minutes)</label><input className="input" type="number" value={values.deviceOfflineThresholdMinutes ?? ""} onChange={(e) => setValues((v) => ({ ...v, deviceOfflineThresholdMinutes: e.target.value }))} /></div>
        <button className="btn btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>Save</button>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <h3 className="mt-0">Branding</h3>
        <div className="stack gap-3">
          <BrandingUploader type="appIcon" label="App Icon (sidebar logo)" currentUrl={values.appIconUrl ?? null} />
          <BrandingUploader type="favicon" label="Browser Favicon" currentUrl={values.faviconUrl ?? null} />
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 className="mt-0">Agent API Keys</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => createKeyMutation.mutate("New Key")}><Icon name="plus" size={13} /> Generate Key</button>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>Use these keys in the device agent's <code>.env</code> file as <code>AGENT_API_KEY</code>.</p>
        <DataTable columns={agentKeyColumns} data={agentKeys ?? []} clientPageSize={5} />
      </div>
    </div>
  );
}
