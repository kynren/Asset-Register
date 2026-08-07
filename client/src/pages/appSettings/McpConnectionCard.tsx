import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { Icon } from "../../components/Icon";
import { copyToClipboard } from "../../lib/clipboard";

interface McpKey {
  id: number;
  key: string;
  label: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  createdAt: string;
}

interface McpAccessLogItem {
  id: number;
  toolName: string;
  args: Record<string, unknown> | null;
  ok: boolean;
  occurredAt: string;
}

interface McpKeyDetail extends McpKey {
  firstUsedAt: string | null;
  lastCall: McpAccessLogItem | null;
  callCount: number;
}

function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${"•".repeat(key.length - 6)}${key.slice(-6)}`;
}

function formatSpan(fromIso: string, toIso: string): string {
  const totalMinutes = Math.max(0, dayjs(toIso).diff(dayjs(fromIso), "minute"));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function KeyActivityModal({ keyId, onClose }: { keyId: number; onClose: () => void }) {
  const [page, setPage] = useState(1);

  const { data: detail } = useQuery({
    queryKey: ["mcp-key-detail", keyId],
    queryFn: async () => (await axiosClient.get(`/mcp-keys/${keyId}`)).data as McpKeyDetail,
  });

  const { data: logs, isLoading } = useQuery({
    queryKey: ["mcp-key-logs", keyId, page],
    queryFn: async () => (await axiosClient.get(`/mcp-keys/${keyId}/logs`, { params: { page, pageSize: 25 } })).data,
  });

  const columns: ColumnDef<McpAccessLogItem, any>[] = [
    { header: "Time", accessorFn: (r) => dayjs(r.occurredAt).format("DD MMM YYYY, HH:mm:ss") },
    { header: "Tool", accessorKey: "toolName" },
    { header: "Arguments", accessorFn: (r) => (r.args && Object.keys(r.args).length ? JSON.stringify(r.args) : "—") },
    { header: "Result", accessorFn: (r) => (r.ok ? "OK" : "Error") },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{detail?.label ?? "MCP Key"} — Activity</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {detail && (
          <div className="row gap-3 flex-wrap" style={{ fontSize: 12, marginBottom: 14 }}>
            <span className="muted">Registered {dayjs(detail.createdAt).format("DD MMM YYYY, HH:mm")}</span>
            <span className="muted">
              {detail.firstUsedAt ? `First connected ${dayjs(detail.firstUsedAt).format("DD MMM YYYY, HH:mm")}` : "Never connected"}
            </span>
            {detail.firstUsedAt && detail.lastCall && (
              <span className="muted">Active for {formatSpan(detail.firstUsedAt, detail.lastCall.occurredAt)}</span>
            )}
            <span className="muted">{detail.callCount} call{detail.callCount === 1 ? "" : "s"} total</span>
            {detail.lastCall && <span className="badge badge-neutral">Last tool: {detail.lastCall.toolName}</span>}
          </div>
        )}
        <DataTable
          tableId="appSettings.mcpAccessLogs"
          defaultViewMode="list"
          columns={columns}
          data={logs?.items ?? []}
          isLoading={isLoading}
          page={logs?.page}
          totalPages={logs?.totalPages}
          onPageChange={setPage}
        />
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function McpConnectionCard() {
  const queryClient = useQueryClient();
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [activityKeyId, setActivityKeyId] = useState<number | null>(null);

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

  // Revoke the old key and mint a fresh one in a single click — the common "my key may have leaked,
  // give me a clean one" action, instead of making the user do Revoke then Generate separately.
  const regenerateMutation = useMutation({
    mutationFn: async (id: number) => {
      await axiosClient.patch(`/mcp-keys/${id}`, { isActive: false });
      return axiosClient.post("/mcp-keys", { label: "My MCP Key" });
    },
    onSuccess: (res) => {
      setJustCreatedKey(res.data.key);
      queryClient.invalidateQueries({ queryKey: ["mcp-keys"] });
    },
  });

  function toggleReveal(id: number) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function copyKey(key: string) {
    copyToClipboard(key, "API key copied to clipboard");
  }

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
            <span style={{ fontFamily: "monospace" }}>{revealedIds.has(k.id) ? k.key : maskKey(k.key)}</span>
            <span className="muted">{k.lastUsedAt ? `Last used ${dayjs(k.lastUsedAt).format("DD MMM, HH:mm")}` : "Never used"}</span>
            <span className={`badge ${k.isActive ? "badge-success" : "badge-neutral"}`}>{k.isActive ? "Active" : "Revoked"}</span>
            <div className="row gap-1">
              <button className="btn btn-secondary btn-sm" onClick={() => setActivityKeyId(k.id)}>
                Activity
              </button>
              <button className="btn btn-secondary btn-sm btn-icon" title={revealedIds.has(k.id) ? "Hide" : "Reveal"} onClick={() => toggleReveal(k.id)}>
                <Icon name={revealedIds.has(k.id) ? "eyeOff" : "eye"} size={13} />
              </button>
              <button className="btn btn-secondary btn-sm btn-icon" title="Copy" onClick={() => copyKey(k.key)}>
                <Icon name="paperclip" size={13} />
              </button>
              {k.isActive && (
                <button className="btn btn-secondary btn-sm" title="Revoke this key and generate a new one" disabled={regenerateMutation.isPending} onClick={() => regenerateMutation.mutate(k.id)}>
                  Regenerate
                </button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => toggleMutation.mutate({ id: k.id, isActive: !k.isActive })}>
                {k.isActive ? "Revoke" : "Reactivate"}
              </button>
            </div>
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

      {activityKeyId != null && <KeyActivityModal keyId={activityKeyId} onClose={() => setActivityKeyId(null)} />}
    </div>
  );
}
