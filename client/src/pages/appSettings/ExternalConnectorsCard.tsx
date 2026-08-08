import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { DataTable } from "../../components/DataTable";
import { Icon } from "../../components/Icon";

interface ExternalConnector {
  id: number;
  name: string;
  baseUrl: string;
  authHeaderName: string;
  direction: "PUSH" | "PULL" | "BOTH";
  resources: string[];
  isEnabled: boolean;
  lastPulledAt: string | null;
  lastPushedAt: string | null;
  createdAt: string;
  createdBy: { id: number; firstName: string; lastName: string } | null;
}

interface ExternalConnectorLogItem {
  id: number;
  direction: "PUSH" | "PULL" | "BOTH";
  ok: boolean;
  statusCode: number | null;
  recordCounts: Record<string, number> | null;
  error: string | null;
  occurredAt: string;
}

interface ExternalConnectorDetail extends ExternalConnector {
  firstUsedAt: string | null;
  lastCall: ExternalConnectorLogItem | null;
  callCount: number;
}

interface ExternalConnectorRecordItem {
  id: number;
  store: string;
  externalId: string | null;
  data: unknown;
  pulledAt: string;
}

// Same resource vocabulary as ApiConnectionsCard's RESOURCES — the opposite direction of that
// gateway, but reuses the same picker so an admin only learns one set of names.
const RESOURCES: { key: string; label: string }[] = [
  { key: "assets", label: "Assets" },
  { key: "tickets", label: "Tickets" },
  { key: "stock", label: "Stock Items" },
  { key: "docs", label: "Docs & SOPs" },
  { key: "network", label: "Network Devices" },
  { key: "users", label: "Users" },
];

function formatSpan(fromIso: string, toIso: string): string {
  const totalMinutes = Math.max(0, dayjs(toIso).diff(dayjs(fromIso), "minute"));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function ConnectorActivityModal({ connectorId, onClose }: { connectorId: number; onClose: () => void }) {
  const [page, setPage] = useState(1);

  const { data: detail } = useQuery({
    queryKey: ["external-connector-detail", connectorId],
    queryFn: async () => (await axiosClient.get(`/external-connectors/${connectorId}`)).data as ExternalConnectorDetail,
  });

  const { data: logs, isLoading } = useQuery({
    queryKey: ["external-connector-logs", connectorId, page],
    queryFn: async () => (await axiosClient.get(`/external-connectors/${connectorId}/logs`, { params: { page, pageSize: 25 } })).data,
  });

  const columns: ColumnDef<ExternalConnectorLogItem, any>[] = [
    { header: "Time", accessorFn: (r) => dayjs(r.occurredAt).format("DD MMM YYYY, HH:mm:ss") },
    { header: "Direction", accessorKey: "direction" },
    { header: "Result", accessorFn: (r) => (r.ok ? "OK" : "Error") },
    { header: "Status", accessorFn: (r) => r.statusCode ?? "—" },
    { header: "Records", accessorFn: (r) => (r.recordCounts ? Object.entries(r.recordCounts).map(([k, v]) => `${k}: ${v}`).join(", ") : "—") },
    { header: "Error", accessorFn: (r) => r.error ?? "—" },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{detail?.name ?? "Connector"} — Activity</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {detail && (
          <div className="row gap-3 flex-wrap" style={{ fontSize: 12, marginBottom: 14 }}>
            <span className="muted">Registered {dayjs(detail.createdAt).format("DD MMM YYYY, HH:mm")}</span>
            <span className="muted">
              {detail.firstUsedAt ? `First attempt ${dayjs(detail.firstUsedAt).format("DD MMM YYYY, HH:mm")}` : "Never attempted"}
            </span>
            {detail.firstUsedAt && detail.lastCall && (
              <span className="muted">Active for {formatSpan(detail.firstUsedAt, detail.lastCall.occurredAt)}</span>
            )}
            <span className="muted">{detail.callCount} attempt{detail.callCount === 1 ? "" : "s"} total</span>
            {detail.lastCall && (
              <span className={`badge ${detail.lastCall.ok ? "badge-success" : "badge-danger"}`}>
                Last: {detail.lastCall.ok ? "OK" : "Failed"} ({detail.lastCall.statusCode ?? "—"})
              </span>
            )}
          </div>
        )}
        <DataTable
          tableId="appSettings.externalConnectorLogs"
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

// Landed data is invisible otherwise — the store dropdown lets an admin confirm what actually came
// back from the external API without needing raw database access.
function ConnectorRecordsModal({ connector, onClose }: { connector: ExternalConnector; onClose: () => void }) {
  const [store, setStore] = useState(connector.resources[0] ?? "");
  const [page, setPage] = useState(1);

  const { data: records, isLoading } = useQuery({
    queryKey: ["external-connector-records", connector.id, store, page],
    enabled: !!store,
    queryFn: async () => (await axiosClient.get(`/external-connectors/${connector.id}/records`, { params: { store, page, pageSize: 25 } })).data,
  });

  const columns: ColumnDef<ExternalConnectorRecordItem, any>[] = [
    { header: "Pulled", accessorFn: (r) => dayjs(r.pulledAt).format("DD MMM YYYY, HH:mm:ss") },
    { header: "External ID", accessorFn: (r) => r.externalId ?? "—" },
    { header: "Data", accessorFn: (r) => JSON.stringify(r.data) },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{connector.name} — Pulled Records</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="row gap-2 flex-wrap" style={{ marginBottom: 10 }}>
          {connector.resources.map((r) => (
            <button
              key={r}
              className={`btn btn-sm ${store === r ? "btn-primary" : "btn-secondary"}`}
              onClick={() => { setStore(r); setPage(1); }}
            >
              {RESOURCES.find((x) => x.key === r)?.label ?? r}
            </button>
          ))}
        </div>
        <DataTable
          tableId="appSettings.externalConnectorRecords"
          defaultViewMode="list"
          columns={columns}
          data={records?.items ?? []}
          isLoading={isLoading}
          page={records?.page}
          totalPages={records?.totalPages}
          onPageChange={setPage}
        />
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_FORM = { name: "", baseUrl: "", authHeaderName: "Authorization", authHeaderValue: "", resources: [] as string[] };

// Admin-facing management for outbound "App Connector" credentials — the inverse of
// ApiConnectionsCard: instead of another app calling into us, this app calls out to another
// system's API on a schedule/on-demand and pulls its data in. See
// server/src/modules/externalConnectors/externalConnectors.routes.ts for the actual Test/Pull
// HTTP calls this triggers.
export function ExternalConnectorsCard() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [activityConnectorId, setActivityConnectorId] = useState<number | null>(null);
  const [recordsConnector, setRecordsConnector] = useState<ExternalConnector | null>(null);
  const [testResult, setTestResult] = useState<Record<number, { ok: boolean; statusCode: number | null; error?: string }>>({});
  const [pullResult, setPullResult] = useState<Record<number, { ok: boolean; recordCounts?: Record<string, number>; error?: string }>>({});

  const { data: connectors } = useQuery({
    queryKey: ["external-connectors"],
    queryFn: async () => (await axiosClient.get("/external-connectors")).data as ExternalConnector[],
  });

  const createMutation = useMutation({
    mutationFn: () => axiosClient.post("/external-connectors", { ...form, direction: "PULL" }),
    onSuccess: () => {
      setForm(DEFAULT_FORM);
      queryClient.invalidateQueries({ queryKey: ["external-connectors"] });
    },
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: (params: { id: number; isEnabled: boolean }) => axiosClient.patch(`/external-connectors/${params.id}`, { isEnabled: params.isEnabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["external-connectors"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/external-connectors/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["external-connectors"] }),
  });

  const testMutation = useMutation({
    mutationFn: async (id: number) => ({ id, ...(await axiosClient.post(`/external-connectors/${id}/test`)).data }),
    onSuccess: (res) => setTestResult((prev) => ({ ...prev, [res.id]: res })),
  });

  const pullMutation = useMutation({
    mutationFn: async (id: number) => {
      try {
        return { id, ...(await axiosClient.post(`/external-connectors/${id}/pull`)).data };
      } catch (err: any) {
        return { id, ok: false, error: err?.response?.data?.error ?? "Pull failed." };
      }
    },
    onSuccess: (res) => {
      setPullResult((prev) => ({ ...prev, [res.id]: res }));
      queryClient.invalidateQueries({ queryKey: ["external-connectors"] });
    },
  });

  function toggleResource(key: string, checked: boolean) {
    setForm((f) => ({ ...f, resources: checked ? [...f.resources, key] : f.resources.filter((r) => r !== key) }));
  }

  return (
    <div className="card">
      <h3 className="mt-0">
        <Icon name="plug" size={16} /> App Connector
      </h3>
      <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
        Connect this organization's data to another app over its API — pull records in on demand or on the next scheduled
        run. The external endpoint must answer <code>GET {"{baseUrl}"}?since=&lt;ISO&gt;</code> with{" "}
        <code>{"{ stores: { <store>: record[] } }"}</code>; the auth value is sent in a header, never the URL.
      </p>

      <div className="stack gap-2" style={{ marginBottom: 16 }}>
        {(connectors ?? []).map((c) => (
          <div key={c.id} className="stack gap-1" style={{ padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}>
            <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ fontSize: 13 }}>{c.name}</strong>{" "}
                <span className="muted" style={{ fontSize: 11 }}>{c.baseUrl}</span>
              </div>
              <div className="row gap-2" style={{ alignItems: "center" }}>
                <span className={`badge ${c.isEnabled ? "badge-success" : "badge-neutral"}`}>{c.isEnabled ? "Enabled" : "Disabled"}</span>
                <span className="badge badge-neutral">Pull</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setActivityConnectorId(c.id)}>Activity</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setRecordsConnector(c)}>Records</button>
                <button className="btn btn-secondary btn-sm" disabled={testMutation.isPending} onClick={() => testMutation.mutate(c.id)}>Test</button>
                <button className="btn btn-primary btn-sm" disabled={!c.isEnabled || pullMutation.isPending} onClick={() => pullMutation.mutate(c.id)}>
                  <Icon name="download" size={12} /> Pull now
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => toggleEnabledMutation.mutate({ id: c.id, isEnabled: !c.isEnabled })}>
                  {c.isEnabled ? "Disable" : "Enable"}
                </button>
                <button className="btn btn-secondary btn-sm btn-icon" title="Delete" onClick={() => deleteMutation.mutate(c.id)}>
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
            <span className="muted" style={{ fontSize: 11 }}>
              {c.resources.map((r) => RESOURCES.find((x) => x.key === r)?.label ?? r).join(", ")}
              {c.lastPulledAt ? ` · Last pulled ${dayjs(c.lastPulledAt).format("DD MMM, HH:mm")}` : " · Never pulled"}
              {c.createdBy && ` · Created by ${c.createdBy.firstName} ${c.createdBy.lastName}`}
            </span>
            {testResult[c.id] && (
              <span style={{ fontSize: 11, color: testResult[c.id].ok ? "var(--color-success)" : "var(--color-danger)" }}>
                {testResult[c.id].ok ? `✓ Reachable (HTTP ${testResult[c.id].statusCode}).` : `✕ ${testResult[c.id].error ?? `HTTP ${testResult[c.id].statusCode}`}`}
              </span>
            )}
            {pullResult[c.id] && (
              <span style={{ fontSize: 11, color: pullResult[c.id].ok ? "var(--color-success)" : "var(--color-danger)" }}>
                {pullResult[c.id].ok
                  ? `✓ Pulled ${Object.entries(pullResult[c.id].recordCounts ?? {}).map(([k, v]) => `${v} ${k}`).join(", ") || "0 records"}.`
                  : `✕ ${pullResult[c.id].error}`}
              </span>
            )}
          </div>
        ))}
        {!connectors?.length && <div className="muted" style={{ fontSize: 12 }}>No connectors yet.</div>}
      </div>

      <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 12 }}>
        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 8 }}>New connector</div>
        <input
          className="input"
          style={{ marginBottom: 8 }}
          placeholder="Name (e.g. Warehouse ERP)"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          className="input"
          style={{ marginBottom: 8 }}
          placeholder="Base URL (e.g. https://erp.example.com/api/sync)"
          value={form.baseUrl}
          onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
        />
        <div className="row gap-2" style={{ marginBottom: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Auth header name"
            value={form.authHeaderName}
            onChange={(e) => setForm((f) => ({ ...f, authHeaderName: e.target.value }))}
          />
          <input
            className="input"
            style={{ flex: 2 }}
            type="password"
            placeholder="Auth header value (e.g. Bearer <token>)"
            value={form.authHeaderValue}
            onChange={(e) => setForm((f) => ({ ...f, authHeaderValue: e.target.value }))}
          />
        </div>

        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 6 }}>Pull into</div>
        <div className="row gap-2 flex-wrap" style={{ marginBottom: 10 }}>
          {RESOURCES.map((r) => (
            <label key={r.key} className="row gap-1" style={{ alignItems: "center", fontSize: 12 }}>
              <input type="checkbox" checked={form.resources.includes(r.key)} onChange={(e) => toggleResource(r.key, e.target.checked)} />
              {r.label}
            </label>
          ))}
        </div>

        <button
          className="btn btn-primary btn-sm"
          disabled={!form.name.trim() || !form.baseUrl.trim() || !form.authHeaderValue.trim() || !form.resources.length || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          <Icon name="plus" size={13} /> Create Connector
        </button>
      </div>

      {activityConnectorId != null && (
        <ConnectorActivityModal connectorId={activityConnectorId} onClose={() => setActivityConnectorId(null)} />
      )}
      {recordsConnector && <ConnectorRecordsModal connector={recordsConnector} onClose={() => setRecordsConnector(null)} />}
    </div>
  );
}
