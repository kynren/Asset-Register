import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";

interface ApiConnection {
  id: number;
  name: string;
  apiKeyId: string;
  resources: string[];
  canGet: boolean;
  canPost: boolean;
  canPut: boolean;
  canPatch: boolean;
  canDelete: boolean;
  isActive: boolean;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  createdAt: string;
  createdBy: { id: number; firstName: string; lastName: string } | null;
}

const VERBS: { key: "canGet" | "canPost" | "canPut" | "canPatch" | "canDelete"; label: string }[] = [
  { key: "canGet", label: "GET" },
  { key: "canPost", label: "POST" },
  { key: "canPut", label: "PUT" },
  { key: "canPatch", label: "PATCH" },
  { key: "canDelete", label: "DELETE" },
];

const DEFAULT_FORM = { name: "", canGet: true, canPost: false, canPut: false, canPatch: false, canDelete: false };

// Admin-facing management for external REST API credentials — the "API Connections" card shown
// on both App Settings' Integrations tab and Admin & Setup's System Settings tab (same component
// instance rendered in both places, see AppSettingsPage.tsx). Backed by /api-connections
// (admin CRUD) and unlocks calls against /api/integrations/v1/* (the actual gateway other
// applications call — see server/src/modules/apiIntegrations/apiIntegrations.routes.ts).
export function ApiConnectionsCard() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [justCreated, setJustCreated] = useState<{ apiKeyId: string; bearerToken: string } | null>(null);

  const { data: connections } = useQuery({
    queryKey: ["api-connections"],
    queryFn: async () => (await axiosClient.get("/api-connections")).data as ApiConnection[],
  });

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/api-connections", { name: form.name, resources: ["assets"], ...form }),
    onSuccess: (res) => {
      setJustCreated({ apiKeyId: res.data.apiKeyId, bearerToken: res.data.bearerToken });
      setForm(DEFAULT_FORM);
      queryClient.invalidateQueries({ queryKey: ["api-connections"] });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (params: { id: number; isActive: boolean }) => axiosClient.patch(`/api-connections/${params.id}`, { isActive: params.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-connections"] }),
  });

  const toggleVerbMutation = useMutation({
    mutationFn: (params: { id: number; key: string; value: boolean }) => axiosClient.patch(`/api-connections/${params.id}`, { [params.key]: params.value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-connections"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/api-connections/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-connections"] }),
  });

  function copy(value: string) {
    navigator.clipboard?.writeText(value).catch(() => undefined);
  }

  const gatewayUrl = `${window.location.origin}/api/integrations/v1`;

  return (
    <div className="card">
      <h3 className="mt-0">API Connections</h3>
      <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
        Let another application call this organization's data over REST — GET, POST, PUT, PATCH, and DELETE — using an admin-issued
        credential. The secret is never stored in a recoverable form (only its SHA-256 hash is kept), is shown to you exactly once at
        creation, and every call requires HTTPS. See the "REST API Integration & Security" SOP in Docs &amp; SOPs for the full
        authentication spec and example requests.
      </p>

      {justCreated && (
        <div className="alert alert-success" style={{ wordBreak: "break-all" }}>
          <strong>New credential (shown once — copy it now):</strong>
          <div style={{ fontFamily: "monospace", marginTop: 6, fontSize: 12 }}>
            Authorization: Bearer {justCreated.bearerToken}
          </div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => copy(justCreated.bearerToken)}>
            <Icon name="paperclip" size={12} /> Copy bearer token
          </button>
        </div>
      )}

      <div className="stack gap-1" style={{ marginBottom: 16 }}>
        {(connections ?? []).map((c) => (
          <div key={c.id} className="stack gap-1" style={{ padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}>
            <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ fontSize: 13 }}>{c.name}</strong>{" "}
                <span className="muted" style={{ fontFamily: "monospace", fontSize: 11 }}>{c.apiKeyId}</span>
              </div>
              <div className="row gap-2" style={{ alignItems: "center" }}>
                <span className={`badge ${c.isActive ? "badge-success" : "badge-neutral"}`}>{c.isActive ? "Active" : "Revoked"}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => toggleActiveMutation.mutate({ id: c.id, isActive: !c.isActive })}>
                  {c.isActive ? "Revoke" : "Reactivate"}
                </button>
                <button className="btn btn-secondary btn-sm btn-icon" title="Delete" onClick={() => deleteMutation.mutate(c.id)}>
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
            <div className="row gap-2 flex-wrap">
              {VERBS.map((v) => (
                <label key={v.key} className="row gap-1" style={{ alignItems: "center", fontSize: 11.5 }}>
                  <input
                    type="checkbox"
                    checked={c[v.key]}
                    onChange={(e) => toggleVerbMutation.mutate({ id: c.id, key: v.key, value: e.target.checked })}
                  />
                  {v.label}
                </label>
              ))}
            </div>
            <span className="muted" style={{ fontSize: 11 }}>
              Resources: {c.resources.join(", ")} · {c.lastUsedAt ? `Last used ${dayjs(c.lastUsedAt).format("DD MMM, HH:mm")} from ${c.lastUsedIp ?? "unknown"}` : "Never used"}
              {c.createdBy && ` · Created by ${c.createdBy.firstName} ${c.createdBy.lastName}`}
            </span>
          </div>
        ))}
        {!connections?.length && <div className="muted" style={{ fontSize: 12 }}>No API connections yet.</div>}
      </div>

      <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 8 }}>New connection</div>
        <input
          className="input"
          style={{ marginBottom: 8 }}
          placeholder="Name (e.g. Warehouse ERP sync)"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <div className="row gap-2 flex-wrap" style={{ marginBottom: 10 }}>
          {VERBS.map((v) => (
            <label key={v.key} className="row gap-1" style={{ alignItems: "center", fontSize: 12 }}>
              <input type="checkbox" checked={form[v.key]} onChange={(e) => setForm((f) => ({ ...f, [v.key]: e.target.checked }))} />
              {v.label}
            </label>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" disabled={!form.name.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
          <Icon name="plus" size={13} /> Create Connection
        </button>
      </div>

      <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 12 }}>
        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 6 }}>Example request</div>
        <pre style={{ fontSize: 11, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
{`curl ${gatewayUrl}/assets \\
  -H "Authorization: Bearer <apiKeyId>.<secret>"`}
        </pre>
      </div>
    </div>
  );
}
