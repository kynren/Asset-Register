import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";
import { PermissionGate } from "../../auth/PermissionGate";

interface ScanResult {
  id: number;
  ipAddress: string;
  alive: boolean;
  hostname: string | null;
  macAddress: string | null;
  vendor: string | null;
  deviceType: string | null;
  responseTimeMs: number | null;
  openPorts: number[];
}

interface Scan {
  id: number;
  startIp: string;
  endIp: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  totalHosts: number;
  aliveHosts: number;
  scannedHosts: number;
  startedAt: string;
  results?: ScanResult[];
  startedBy?: { firstName: string; lastName: string };
}

export function IpRangeScannerTab() {
  const [startIp, setStartIp] = useState("192.168.1.1");
  const [endIp, setEndIp] = useState("192.168.1.254");
  const [activeScanId, setActiveScanId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aliveOnly, setAliveOnly] = useState(true);
  const queryClient = useQueryClient();

  const { data: history } = useQuery({
    queryKey: ["network-scans"],
    queryFn: async () => (await axiosClient.get("/network/scan")).data as Scan[],
  });

  const { data: activeScan } = useQuery({
    queryKey: ["network-scan", activeScanId],
    queryFn: async () => (await axiosClient.get(`/network/scan/${activeScanId}`)).data as Scan,
    enabled: activeScanId !== null,
    refetchInterval: (query) => (query.state.data?.status === "RUNNING" ? 1000 : false),
  });

  useEffect(() => {
    if (activeScan?.status === "COMPLETED") {
      queryClient.invalidateQueries({ queryKey: ["network-scans"] });
    }
  }, [activeScan?.status, queryClient]);

  const startMutation = useMutation({
    mutationFn: () => axiosClient.post("/network/scan", { startIp, endIp }),
    onSuccess: (res) => {
      setError(null);
      setActiveScanId(res.data.id);
      queryClient.invalidateQueries({ queryKey: ["network-scans"] });
    },
    onError: (err: any) => setError(err.response?.data?.error || "Could not start scan."),
  });

  const promoteMutation = useMutation({
    mutationFn: (resultId: number) => axiosClient.post(`/network/scan-results/${resultId}/promote`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["network-graph"] }),
  });

  const scan = activeScan ?? history?.find((s) => s.id === activeScanId);
  const results = (activeScan?.results ?? []).filter((r) => !aliveOnly || r.alive);
  const progressPct = scan && scan.totalHosts > 0 ? Math.round((scan.scannedHosts / scan.totalHosts) * 100) : 0;

  const resultColumns: ColumnDef<ScanResult, any>[] = [
    { header: "", id: "status-dot", cell: ({ row }) => <span className={`tag-dot ${row.original.alive ? "online" : "offline"}`} /> },
    { header: "IP Address", accessorKey: "ipAddress", cell: ({ row }) => <span style={{ fontFamily: "monospace" }}>{row.original.ipAddress}</span> },
    { header: "Hostname", accessorFn: (r) => r.hostname ?? "—" },
    { header: "MAC Address", cell: ({ row }) => <span style={{ fontFamily: "monospace" }}>{row.original.macAddress ?? "—"}</span> },
    { header: "Vendor", accessorFn: (r) => r.vendor ?? "—" },
    { header: "Device Type", accessorFn: (r) => r.deviceType ?? "—" },
    { header: "Ping (ms)", accessorFn: (r) => r.responseTimeMs ?? "—" },
    { header: "Open Ports", accessorFn: (r) => (r.openPorts.length ? r.openPorts.join(", ") : "—") },
    {
      header: "",
      id: "actions",
      cell: ({ row }) =>
        row.original.alive && (
          <PermissionGate module="network" action="edit">
            <button className="btn btn-secondary btn-sm" onClick={() => promoteMutation.mutate(row.original.id)}>
              Add to Topology
            </button>
          </PermissionGate>
        ),
    },
  ];

  const historyColumns: ColumnDef<Scan, any>[] = [
    { header: "Range", cell: ({ row }) => <span style={{ fontFamily: "monospace" }}>{row.original.startIp} – {row.original.endIp}</span> },
    { header: "Status", cell: ({ row }) => <span className="badge badge-neutral">{row.original.status}</span> },
    { header: "Alive / Total", accessorFn: (s) => `${s.aliveHosts} / ${s.totalHosts}` },
    { header: "Started", accessorFn: (s) => new Date(s.startedAt).toLocaleString() },
    { header: "By", accessorFn: (s) => (s.startedBy ? `${s.startedBy.firstName} ${s.startedBy.lastName}` : "") },
  ];

  return (
    <div className="stack gap-3">
      <div className="card">
        <h3 className="mt-0">IP Range Scanner</h3>
        <p className="muted" style={{ marginTop: -6 }}>
          Ping-sweep a range of addresses on your network (like Angry IP Scanner) to discover live hosts, hostnames, MAC
          addresses, vendor/device type, response times, and common open ports.
        </p>
        {error && <div className="alert alert-danger">{error}</div>}
        <PermissionGate module="network" action="create">
          <div className="row gap-2 flex-wrap" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Start IP</label>
              <input className="input" value={startIp} onChange={(e) => setStartIp(e.target.value)} style={{ width: 160 }} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>End IP</label>
              <input className="input" value={endIp} onChange={(e) => setEndIp(e.target.value)} style={{ width: 160 }} />
            </div>
            <button className="btn btn-primary" disabled={startMutation.isPending || scan?.status === "RUNNING"} onClick={() => startMutation.mutate()}>
              <Icon name="radar" size={14} /> {scan?.status === "RUNNING" ? "Scanning..." : "Start Scan"}
            </button>
          </div>
        </PermissionGate>
      </div>

      {scan && (
        <div className="card">
          <div className="row gap-3 flex-wrap" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div className="row gap-3 flex-wrap">
              <span><strong>{scan.startIp}</strong> – <strong>{scan.endIp}</strong></span>
              <span className="badge badge-primary">{scan.status}</span>
              <span className="muted">{scan.scannedHosts}/{scan.totalHosts} scanned · {scan.aliveHosts} alive</span>
            </div>
            <label className="row gap-1" style={{ fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={aliveOnly} onChange={(e) => setAliveOnly(e.target.checked)} />
              Show alive hosts only
            </label>
          </div>

          {scan.status === "RUNNING" && (
            <div style={{ height: 6, background: "var(--color-border)", borderRadius: 999, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ height: "100%", width: `${progressPct}%`, background: "var(--color-primary)", transition: "width 0.3s ease" }} />
            </div>
          )}

          <DataTable
            columns={resultColumns}
            data={results}
            clientPageSize={10}
            emptyMessage={scan.status === "RUNNING" ? "Scanning..." : "No hosts found."}
          />
        </div>
      )}

      {history && history.length > 0 && (
        <div className="card">
          <h3 className="mt-0">Recent Scans</h3>
          <DataTable columns={historyColumns} data={history} clientPageSize={5} onRowClick={(s) => setActiveScanId(s.id)} />
        </div>
      )}
    </div>
  );
}
