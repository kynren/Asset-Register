import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { copyToClipboard } from "../../lib/clipboard";

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

// The only resource family the gateway actually serves today (see apiIntegrations.routes.ts) —
// add an entry here (and a matching route) to make a new one selectable and show its endpoint.
const RESOURCES: { key: string; label: string }[] = [{ key: "assets", label: "Assets" }];

const DEFAULT_FORM = { name: "", resources: ["assets"] as string[], canGet: true, canPost: false, canPut: false, canPatch: false, canDelete: false };

// A little "endpoint + copy" row, reused for the live preview while picking data in the create
// form and for each existing connection's granted resources in the list below.
function EndpointRow({ url, onCopy }: { url: string; onCopy: () => void }) {
  return (
    <div className="row gap-2" style={{ alignItems: "center" }}>
      <code style={{ fontSize: 11, wordBreak: "break-all" }}>{url}</code>
      <button className="btn btn-secondary btn-sm btn-icon" title="Copy endpoint" onClick={onCopy}>
        <Icon name="paperclip" size={11} />
      </button>
    </div>
  );
}

// Admin-facing management for external REST API credentials — the "API Connections" card shown
// on both App Settings' Integrations tab and Admin & Setup's System Settings tab (same component
// instance rendered in both places, see AppSettingsPage.tsx). Backed by /api-connections
// (admin CRUD) and unlocks calls against /api/integrations/v1/* (the actual gateway other
// applications call — see server/src/modules/apiIntegrations/apiIntegrations.routes.ts).
export function ApiConnectionsCard() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [justCreated, setJustCreated] = useState<{ apiKeyId: string; bearerToken: string; resources: string[] } | null>(null);

  const { data: connections } = useQuery({
    queryKey: ["api-connections"],
    queryFn: async () => (await axiosClient.get("/api-connections")).data as ApiConnection[],
  });

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/api-connections", form),
    onSuccess: (res) => {
      setJustCreated({ apiKeyId: res.data.apiKeyId, bearerToken: res.data.bearerToken, resources: res.data.resources });
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

  function copy(value: string, label?: string) {
    copyToClipboard(value, label);
  }

  function toggleResource(key: string, checked: boolean) {
    setForm((f) => ({ ...f, resources: checked ? [...f.resources, key] : f.resources.filter((r) => r !== key) }));
  }

  const gatewayUrl = `${window.location.origin}/api/integrations/v1`;
  const resourceEndpoint = (resource: string) => `${gatewayUrl}/${resource}`;

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
          <strong>Bearer Token (shown once — copy it now):</strong>
          <div style={{ fontFamily: "monospace", marginTop: 6, fontSize: 12 }}>
            Authorization: Bearer {justCreated.bearerToken}
          </div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => copy(justCreated.bearerToken, "Bearer token copied to clipboard")}>
            <Icon name="paperclip" size={12} /> Copy bearer token
          </button>

          <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginTop: 14, marginBottom: 6 }}>Endpoint(s)</div>
          <div className="stack gap-1">
            {justCreated.resources.map((r) => (
              <EndpointRow key={r} url={resourceEndpoint(r)} onCopy={() => copy(resourceEndpoint(r), "Endpoint copied to clipboard")} />
            ))}
          </div>
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
            <div className="stack gap-1">
              {c.resources.map((r) => (
                <EndpointRow key={r} url={resourceEndpoint(r)} onCopy={() => copy(resourceEndpoint(r), "Endpoint copied to clipboard")} />
              ))}
            </div>
            <span className="muted" style={{ fontSize: 11 }}>
              {c.lastUsedAt ? `Last used ${dayjs(c.lastUsedAt).format("DD MMM, HH:mm")} from ${c.lastUsedIp ?? "unknown"}` : "Never used"}
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

        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 6 }}>Data</div>
        <div className="row gap-2 flex-wrap" style={{ marginBottom: 8 }}>
          {RESOURCES.map((r) => (
            <label key={r.key} className="row gap-1" style={{ alignItems: "center", fontSize: 12 }}>
              <input type="checkbox" checked={form.resources.includes(r.key)} onChange={(e) => toggleResource(r.key, e.target.checked)} />
              {r.label}
            </label>
          ))}
        </div>
        {form.resources.length > 0 && (
          <div className="stack gap-1" style={{ marginBottom: 10 }}>
            {form.resources.map((r) => (
              <EndpointRow key={r} url={resourceEndpoint(r)} onCopy={() => copy(resourceEndpoint(r), "Endpoint copied to clipboard")} />
            ))}
          </div>
        )}

        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 6 }}>Permissions</div>
        <div className="row gap-2 flex-wrap" style={{ marginBottom: 10 }}>
          {VERBS.map((v) => (
            <label key={v.key} className="row gap-1" style={{ alignItems: "center", fontSize: 12 }}>
              <input type="checkbox" checked={form[v.key]} onChange={(e) => setForm((f) => ({ ...f, [v.key]: e.target.checked }))} />
              {v.label}
            </label>
          ))}
        </div>
        <button
          className="btn btn-primary btn-sm"
          disabled={!form.name.trim() || !form.resources.length || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
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
