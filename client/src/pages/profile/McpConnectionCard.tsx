import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";

interface McpKey {
  id: number;
  key: string;
  label: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export function McpConnectionCard() {
  const queryClient = useQueryClient();
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null);

  const { data: keys } = useQuery({
    queryKey: ["mcp-keys"],
    queryFn: async () => (await axiosClient.get("/mcp-keys")).data as McpKey[],
  });

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/mcp-keys", { label: "My MCP Key" }),
    onSuccess: (res) => {
      setJustCreatedKey(res.data.key);
      queryClient.invalidateQueries({ queryKey: ["mcp-keys"] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (params: { id: number; isActive: boolean }) => axiosClient.patch(`/mcp-keys/${params.id}`, { isActive: params.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mcp-keys"] }),
  });

  const mcpUrl = `${window.location.origin}/api/mcp`;

  return (
    <div className="card">
      <div className="row gap-2" style={{ justifyContent: "space-between" }}>
        <h3 className="mt-0 mb-0">MCP Connection</h3>
        <button className="btn btn-secondary btn-sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          <Icon name="plus" size={13} /> Generate Key
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        Connect an MCP-compatible AI tool (Claude Desktop, Claude Code) to this app's data — assets, tickets, stock, licenses,
        and more — using this key. It acts as your account, so treat it like a password: revoke it if it's ever exposed.
      </p>

      {justCreatedKey && (
        <div className="alert alert-success" style={{ wordBreak: "break-all" }}>
          <strong>Your new key (shown once):</strong>
          <div style={{ fontFamily: "monospace", marginTop: 4 }}>{justCreatedKey}</div>
        </div>
      )}

      <div className="stack gap-1" style={{ marginBottom: 12 }}>
        {(keys ?? []).map((k) => (
          <div key={k.id} className="row gap-2" style={{ justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
            <span style={{ fontFamily: "monospace" }}>{k.key}</span>
            <span className="muted">{k.lastUsedAt ? `Last used ${dayjs(k.lastUsedAt).format("DD MMM, HH:mm")}` : "Never used"}</span>
            <span className={`badge ${k.isActive ? "badge-success" : "badge-neutral"}`}>{k.isActive ? "Active" : "Revoked"}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => toggleMutation.mutate({ id: k.id, isActive: !k.isActive })}>
              {k.isActive ? "Revoke" : "Reactivate"}
            </button>
          </div>
        ))}
        {!keys?.length && <div className="muted" style={{ fontSize: 12 }}>No MCP keys yet.</div>}
      </div>

      <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 12 }}>
        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 6 }}>Claude Desktop config example</div>
        <pre style={{ fontSize: 11, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
{`{
  "mcpServers": {
    "kynren-asset-register": {
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer YOUR_KEY_HERE" }
    }
  }
}`}
        </pre>
      </div>
    </div>
  );
}
