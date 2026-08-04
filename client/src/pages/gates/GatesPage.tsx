import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { axiosClient } from "../../api/axiosClient";
import { ControlsSubNav } from "../controls/ControlsSubNav";
import { DataTable } from "../../components/DataTable";
import { Icon } from "../../components/Icon";
import { StatusBadge } from "../../components/StatusBadge";
import { FormModal } from "../../components/FormModal";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PasswordInput } from "../../components/PasswordInput";
import { PermissionGate } from "../../auth/PermissionGate";

interface Net2Server {
  id: number;
  name: string;
  ipAddress: string;
  port: number;
  clientId: string | null;
  username: string | null;
  hasPassword: boolean;
  notes: string | null;
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  lastCheckedAt: string | null;
  createdAt: string;
  createdBy: { firstName: string; lastName: string } | null;
}

interface DiscoveryCandidate {
  ipAddress: string;
  openPorts: number[];
}

function isValidIpv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return !!m && m.slice(1).every((o) => Number(o) >= 0 && Number(o) <= 255);
}

export function GatesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Net2Server | null>(null);
  const [deleting, setDeleting] = useState<Net2Server | null>(null);
  const [prefill, setPrefill] = useState<{ ipAddress: string; port: number } | null>(null);

  const [startIp, setStartIp] = useState("192.168.1.1");
  const [endIp, setEndIp] = useState("192.168.1.254");
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DiscoveryCandidate[] | null>(null);

  const { data: servers, isLoading } = useQuery({
    queryKey: ["gates-servers"],
    queryFn: async () => (await axiosClient.get("/gates/servers")).data as Net2Server[],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/gates/servers/${id}`),
    meta: { successMessage: "Server removed" },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["gates-servers"] }); setDeleting(null); },
  });

  const testMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/gates/servers/${id}/test-connection`),
    meta: { successMessage: "Connection test complete" },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gates-servers"] }),
  });

  const discoverMutation = useMutation({
    mutationFn: () => axiosClient.post("/gates/discover", { startIp, endIp }),
    onSuccess: (res) => { setDiscoveryError(null); setCandidates(res.data.candidates); },
    onError: (err: any) => { setDiscoveryError(err.response?.data?.error || "Could not scan that range."); setCandidates(null); },
  });

  const columns: ColumnDef<Net2Server, any>[] = [
    { header: "Name", accessorKey: "name" },
    { header: "IP Address", accessorFn: (r) => `${r.ipAddress}:${r.port}` },
    { header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { header: "Client ID", accessorFn: (r) => r.clientId ?? "—" },
    { header: "Last Checked", accessorFn: (r) => (r.lastCheckedAt ? new Date(r.lastCheckedAt).toLocaleString() : "Never") },
    { header: "Added By", accessorFn: (r) => (r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : "—") },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => (
        <div className="row gap-1">
          <PermissionGate module="gates" action="edit">
            <button className="btn btn-secondary btn-sm" disabled={testMutation.isPending} onClick={() => testMutation.mutate(row.original.id)}>
              Test Connection
            </button>
            <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setEditing(row.original)}><Icon name="edit" size={13} /></button>
          </PermissionGate>
          <PermissionGate module="gates" action="delete">
            <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleting(row.original)}><Icon name="trash" size={13} /></button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  return (
    <div className="stack gap-3">
      <div className="page-header-sticky">
        <div className="page-header-content">
          <div>
            <ControlsSubNav />
            <h1 className="page-title">Gates</h1>
            <p className="page-subtitle">
              Paxton Net2 gate controller servers on the local network — discover candidate servers by IP range, or
              register one directly if you already know its details.
            </p>
          </div>
          <PermissionGate module="gates" action="create">
            <button className="btn btn-primary" onClick={() => { setPrefill(null); setShowForm(true); }}>
              <Icon name="plus" size={14} /> Add Server
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="card">
        <h3 className="mt-0">Discover Servers</h3>
        <p className="muted" style={{ fontSize: 13 }}>
          Probes each address in the range for Net2's default API ports (8443, 8080) via TCP connect. Paxton Net2 has
          no broadcast discovery protocol, so this only finds servers reachable directly from wherever this app's
          server process runs — if it's hosted off-site with no route into this LAN, run the scan from a machine that
          does have access and register the server manually below instead.
        </p>
        <div className="row gap-2 flex-wrap" style={{ alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12 }}>IP Range:</span>
          <input className="input" style={{ maxWidth: 160 }} value={startIp} onChange={(e) => setStartIp(e.target.value)} disabled={discoverMutation.isPending} />
          <span className="muted">to</span>
          <input className="input" style={{ maxWidth: 160 }} value={endIp} onChange={(e) => setEndIp(e.target.value)} disabled={discoverMutation.isPending} />
          <PermissionGate module="gates" action="view">
            <button
              className="btn btn-primary btn-sm"
              disabled={discoverMutation.isPending || !isValidIpv4(startIp) || !isValidIpv4(endIp)}
              onClick={() => discoverMutation.mutate()}
            >
              <Icon name="radar" size={13} /> {discoverMutation.isPending ? "Scanning..." : "Discover"}
            </button>
          </PermissionGate>
        </div>

        {discoveryError && <div className="alert alert-danger" style={{ marginTop: 10 }}>{discoveryError}</div>}

        {candidates && (
          <div className="stack gap-2" style={{ marginTop: 12 }}>
            {candidates.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>No candidates found in that range.</p>
            ) : (
              candidates.map((c) => (
                <div key={c.ipAddress} className="row gap-2" style={{ alignItems: "center", justifyContent: "space-between", padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 8 }}>
                  <div>
                    <strong style={{ fontFamily: "monospace" }}>{c.ipAddress}</strong>
                    <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>open ports: {c.openPorts.join(", ")}</span>
                  </div>
                  <PermissionGate module="gates" action="create">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => { setPrefill({ ipAddress: c.ipAddress, port: c.openPorts.includes(8443) ? 8443 : c.openPorts[0] }); setShowForm(true); }}
                    >
                      <Icon name="plus" size={12} /> Add as Server
                    </button>
                  </PermissionGate>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="mt-0">Registered Servers</h3>
        <DataTable
          tableId="gates.servers"
          exportModule="gates"
          columns={columns}
          data={servers ?? []}
          isLoading={isLoading}
          clientPageSize={10}
          emptyMessage="No Net2 servers registered yet."
        />
      </div>

      {(showForm || editing) && (
        <Net2ServerFormModal
          server={editing}
          prefill={prefill}
          onClose={() => { setShowForm(false); setEditing(null); setPrefill(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); setPrefill(null); queryClient.invalidateQueries({ queryKey: ["gates-servers"] }); }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Remove "${deleting.name}"`}
          message="This only removes the registration from Kynren — it does not change anything on the Net2 server itself."
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}

function Net2ServerFormModal({
  server,
  prefill,
  onClose,
  onSaved,
}: {
  server: Net2Server | null;
  prefill: { ipAddress: string; port: number } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(server?.name ?? "");
  const [ipAddress, setIpAddress] = useState(server?.ipAddress ?? prefill?.ipAddress ?? "");
  const [port, setPort] = useState(server?.port ?? prefill?.port ?? 8443);
  const [clientId, setClientId] = useState(server?.clientId ?? "");
  const [username, setUsername] = useState(server?.username ?? "");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState(server?.notes ?? "");

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        ipAddress,
        port,
        clientId: clientId || null,
        username: username || null,
        notes: notes || null,
        ...(password ? { password } : {}),
      };
      return server ? axiosClient.patch(`/gates/servers/${server.id}`, payload) : axiosClient.post("/gates/servers", payload);
    },
    meta: { successMessage: server ? "Server updated" : "Server registered" },
    onSuccess: onSaved,
  });

  const canSubmit = name.trim() && isValidIpv4(ipAddress) && port >= 1 && port <= 65535;

  return (
    <FormModal
      title={server ? `Edit "${server.name}"` : "Register Net2 Server"}
      onClose={onClose}
      onSubmit={() => mutation.mutate()}
      submitting={mutation.isPending}
      submitDisabled={!canSubmit}
    >
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Could not save this server."}</div>}

      <div className="field"><label>Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Building Net2 Server" /></div>

      <div className="grid grid-cols-2">
        <div className="field"><label>IP Address *</label><input className="input" style={{ fontFamily: "monospace" }} value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} placeholder="192.168.1.50" /></div>
        <div className="field"><label>Port *</label><input className="input" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(Number(e.target.value))} /></div>
      </div>

      <div className="field"><label>Client ID</label><input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Net2 API client ID, if known" /></div>

      <div className="grid grid-cols-2">
        <div className="field"><label>Username</label><input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" /></div>
        <div className="field">
          <label>Password {server?.hasPassword && !password ? <span className="muted">(saved — leave blank to keep)</span> : ""}</label>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </div>
      </div>

      <div className="field"><label>Notes</label><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

      <p className="muted" style={{ fontSize: 12 }}>
        Credentials are stored encrypted and only ever used for connecting to this Net2 server — they're never sent
        back to the browser. Full door/credential control depends on the Net2 Local Web API license configured on
        that server; this registration only tracks how to reach it.
      </p>
    </FormModal>
  );
}
