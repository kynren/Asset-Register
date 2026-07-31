import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";
import { PermissionGate } from "../../auth/PermissionGate";
import { AssetFormModal, AssetFormValues } from "../assets/AssetFormModal";

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
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  viaRelay: boolean;
  totalHosts: number;
  aliveHosts: number;
  scannedHosts: number;
  startedAt: string;
  completedAt: string | null;
  results?: ScanResult[];
  startedBy?: { firstName: string; lastName: string };
}

// Mirrors server/src/lib/ping.ts COMMON_PORTS — informational only, shown in the settings popover.
const COMMON_PORTS: { port: number; label: string }[] = [
  { port: 21, label: "FTP" },
  { port: 22, label: "SSH" },
  { port: 23, label: "Telnet" },
  { port: 25, label: "SMTP" },
  { port: 80, label: "HTTP" },
  { port: 443, label: "HTTPS" },
  { port: 554, label: "RTSP" },
  { port: 3389, label: "RDP" },
  { port: 8080, label: "HTTP-Alt" },
  { port: 8443, label: "HTTPS-Alt" },
];
// Mirrors server/src/modules/network/scan.service.ts SCAN_CONCURRENCY / MAX_HOSTS_PER_SCAN.
const SCAN_CONCURRENCY = 24;
const MAX_HOSTS_PER_SCAN = 1024;
const CIDR_PRESETS = [16, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30];

function isValidIpv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return !!m && m.slice(1).every((o) => Number(o) >= 0 && Number(o) <= 255);
}
function ipToLong(ip: string): number {
  return ip.split(".").reduce((acc, o) => acc * 256 + Number(o), 0);
}
function longToIp(v: number): string {
  return [24, 16, 8, 0].map((shift) => (v >>> shift) & 255).join(".");
}
function applyNetmaskToRange(startIp: string, prefix: number): { start: string; end: string } | null {
  if (!isValidIpv4(startIp)) return null;
  const ipLong = ipToLong(startIp);
  const hostBits = 32 - prefix;
  const mask = hostBits === 0 ? 0xffffffff : (0xffffffff << hostBits) >>> 0;
  const network = (ipLong & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  return { start: longToIp(network), end: longToIp(broadcast) };
}

// A host is shown "identified" (green) once we resolved something about it beyond a bare ping —
// a reverse-DNS hostname or an open port — the same at-a-glance signal Angry IP Scanner gives.
function statusTone(r: ScanResult): "dead" | "info" | "alive" {
  if (!r.alive) return "dead";
  if (r.hostname || r.openPorts.length > 0) return "info";
  return "alive";
}

// Best-effort category prefill for the adopt-into-inventory modal — the picker is always
// editable, this just saves a click when a matching category already exists. Prefers the
// dedicated isComputerAsset/isSwitchingDevice flags where they apply (same flags Admin & Setup
// uses elsewhere), and falls back to a loose name match for the newer taxonomy labels that have
// no dedicated flag (Raspberry Pi, IoT, Lighting, Sound System, etc).
const CATEGORY_NAME_KEYWORDS: Record<string, string[]> = {
  "Raspberry Pi": ["raspberry", "single-board", "sbc"],
  "IoT Device": ["iot", "smart"],
  Lighting: ["light"],
  "Sound System": ["sound", "audio", "speaker"],
  "IP Camera / NVR": ["camera", "nvr"],
  Printer: ["printer"],
  "Virtual Machine": ["virtual"],
};

function guessCategoryId(
  deviceType: string | null,
  categories: { id: number; name: string; isComputerAsset?: boolean; isSwitchingDevice?: boolean }[] | undefined
): number | null {
  if (!categories || !deviceType) return null;
  if (deviceType === "Computer") return categories.find((c) => c.isComputerAsset)?.id ?? null;
  if (deviceType === "Network Switching / Routing") return categories.find((c) => c.isSwitchingDevice)?.id ?? null;
  const keywords = CATEGORY_NAME_KEYWORDS[deviceType];
  if (!keywords) return null;
  return categories.find((c) => keywords.some((k) => c.name.toLowerCase().includes(k)))?.id ?? null;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(2)} sec`;
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(0);
  return `${mins} min ${secs} sec`;
}

export function IpRangeScannerTab() {
  const [startIp, setStartIp] = useState("192.168.1.1");
  const [endIp, setEndIp] = useState("192.168.1.254");
  const [netmaskPick, setNetmaskPick] = useState("");
  const [activeScanId, setActiveScanId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aliveOnly, setAliveOnly] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [statsScan, setStatsScan] = useState<Scan | null>(null);
  const statsShownFor = useRef<number | null>(null);
  const [adopting, setAdopting] = useState<ScanResult | null>(null);
  const queryClient = useQueryClient();

  const { data: history } = useQuery({
    queryKey: ["network-scans"],
    queryFn: async () => (await axiosClient.get("/network/scan")).data as Scan[],
  });

  const { data: categories } = useQuery({
    queryKey: ["asset-categories"],
    queryFn: async () => (await axiosClient.get("/asset-categories")).data as { id: number; name: string; isComputerAsset: boolean; isSwitchingDevice: boolean }[],
  });

  const { data: activeScan } = useQuery({
    queryKey: ["network-scan", activeScanId],
    queryFn: async () => (await axiosClient.get(`/network/scan/${activeScanId}`)).data as Scan,
    enabled: activeScanId !== null,
    refetchInterval: (query) => (query.state.data?.status === "RUNNING" || query.state.data?.status === "PENDING" ? 1000 : false),
  });

  useEffect(() => {
    if (activeScan?.status === "COMPLETED") {
      queryClient.invalidateQueries({ queryKey: ["network-scans"] });
      if (statsShownFor.current !== activeScan.id) {
        statsShownFor.current = activeScan.id;
        setStatsScan(activeScan);
      }
    }
  }, [activeScan?.status, activeScan?.id, activeScan, queryClient]);

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

  const adoptMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => axiosClient.post("/assets", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["asset-stats"] });
      setAdopting(null);
    },
  });

  const scan = activeScan ?? history?.find((s) => s.id === activeScanId);
  const results = (activeScan?.results ?? []).filter((r) => !aliveOnly || r.alive);
  const progressPct = scan && scan.totalHosts > 0 ? Math.round((scan.scannedHosts / scan.totalHosts) * 100) : 0;
  const scanning = scan?.status === "RUNNING";
  const pending = scan?.status === "PENDING";
  const busy = scanning || pending;

  function pickNetmask(value: string) {
    setNetmaskPick("");
    if (!value) return;
    const range = applyNetmaskToRange(startIp, Number(value));
    if (!range) {
      setError("Enter a valid start IP before picking a netmask.");
      return;
    }
    setError(null);
    setStartIp(range.start);
    setEndIp(range.end);
  }

  const resultColumns: ColumnDef<ScanResult, any>[] = [
    { header: "", id: "status-dot", enableSorting: false, cell: ({ row }) => <span className={`ips-dot ${statusTone(row.original)}`} title={statusTone(row.original) === "dead" ? "No response" : statusTone(row.original) === "info" ? "Alive — identified" : "Alive"} /> },
    { header: "IP Address", accessorKey: "ipAddress", cell: ({ row }) => <span className="ips-ip-cell">{row.original.ipAddress}</span> },
    { header: "Ping", accessorFn: (r) => (r.responseTimeMs ?? null), cell: ({ row }) => (row.original.responseTimeMs != null ? `${row.original.responseTimeMs} ms` : "[n/a]") },
    { header: "Hostname", accessorFn: (r) => r.hostname ?? "" , cell: ({ row }) => row.original.hostname || <span className="muted">[n/a]</span> },
    { header: "Ports", accessorFn: (r) => r.openPorts.length, cell: ({ row }) => (row.original.openPorts.length ? row.original.openPorts.join(", ") : <span className="muted">[n/a]</span>) },
    { header: "MAC Address", enableSorting: false, cell: ({ row }) => <span className="muted" style={{ fontFamily: "monospace", fontSize: 12 }}>{row.original.macAddress ?? "—"}</span> },
    { header: "Vendor / Type", enableSorting: false, accessorFn: (r) => [r.vendor, r.deviceType].filter(Boolean).join(" · ") || "—" },
    {
      header: "",
      id: "actions",
      enableSorting: false,
      cell: ({ row }) =>
        row.original.alive && (
          <div className="row gap-1">
            <PermissionGate module="network" action="edit">
              <button className="btn btn-secondary btn-sm" onClick={() => promoteMutation.mutate(row.original.id)}>
                Add to Topology
              </button>
            </PermissionGate>
            <PermissionGate module="assets" action="create">
              <button className="btn btn-primary btn-sm" onClick={() => setAdopting(row.original)}>
                <Icon name="plus" size={12} /> Adopt into Inventory
              </button>
            </PermissionGate>
          </div>
        ),
    },
  ];

  const historyColumns: ColumnDef<Scan, any>[] = [
    { header: "Range", cell: ({ row }) => <span className="ips-ip-cell" style={{ fontSize: 12 }}>{row.original.startIp} – {row.original.endIp}</span> },
    { header: "Status", cell: ({ row }) => <span className="badge badge-neutral">{row.original.status}</span> },
    { header: "Alive / Total", accessorFn: (s) => `${s.aliveHosts} / ${s.totalHosts}` },
    { header: "Started", accessorFn: (s) => new Date(s.startedAt).toLocaleString() },
    { header: "By", accessorFn: (s) => (s.startedBy ? `${s.startedBy.firstName} ${s.startedBy.lastName}` : "") },
  ];

  return (
    <div className="ad-shell nt-shell">
      <div className="nt-toolbar">
        <div className="nt-toolbar-row">
          <span className="ips-field-inline">
            <span className="ips-field-label">IP Range:</span>
            <input className="ips-input" value={startIp} onChange={(e) => setStartIp(e.target.value)} disabled={busy} />
          </span>
          <span className="ips-to">to</span>
          <input className="ips-input" value={endIp} onChange={(e) => setEndIp(e.target.value)} disabled={busy} />

          <select className="ips-select" value={netmaskPick} onChange={(e) => pickNetmask(e.target.value)} disabled={busy} title="Fill the range from a CIDR netmask">
            <option value="">Netmask</option>
            {CIDR_PRESETS.map((p) => (
              <option key={p} value={p}>/{p} ({p >= 31 ? "2" : (2 ** (32 - p) - 2).toLocaleString()} hosts)</option>
            ))}
          </select>

          <div style={{ position: "relative" }}>
            <button className="nt-icon-btn" title="Scan settings" onClick={() => setShowSettings((v) => !v)}>
              <Icon name="settings" size={15} />
            </button>
            {showSettings && (
              <div className="nt-settings-popover" style={{ bottom: "auto", top: 44, left: "auto", right: 0, transform: "none", width: 240 }}>
                <div className="nt-legend-title" style={{ marginBottom: 8 }}>Scan Settings</div>
                <div className="stack gap-1" style={{ fontSize: 12 }}>
                  <div className="row gap-2" style={{ justifyContent: "space-between" }}>
                    <span className="muted">Concurrent threads</span><strong>{SCAN_CONCURRENCY}</strong>
                  </div>
                  <div className="row gap-2" style={{ justifyContent: "space-between" }}>
                    <span className="muted">Max hosts per scan</span><strong>{MAX_HOSTS_PER_SCAN.toLocaleString()}</strong>
                  </div>
                </div>
                <div className="nt-legend-section" style={{ marginTop: 10, marginBottom: 6 }}>Ports Scanned</div>
                <div className="row gap-1 flex-wrap">
                  {COMMON_PORTS.map((p) => (
                    <span key={p.port} className="badge badge-neutral" title={p.label}>{p.port}</span>
                  ))}
                </div>
                <div className="nt-legend-section" style={{ marginTop: 10, marginBottom: 6 }}>Hostname Resolution</div>
                <p className="muted" style={{ fontSize: 11, margin: 0 }}>
                  Reverse DNS → known Kynren agent devices → active NetBIOS query — so hostnames resolve even without DNS records or the agent installed.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="nt-toolbar-row" style={{ marginTop: 10 }}>
          <PermissionGate
            module="network"
            action="create"
            fallback={<span className="muted" style={{ fontSize: 12 }}>You don't have permission to start scans.</span>}
          >
            <button className="ips-start-btn" disabled={startMutation.isPending || busy} onClick={() => startMutation.mutate()}>
              <Icon name="radar" size={14} /> {scanning ? "Scanning..." : pending ? "Queued..." : "Start"}
            </button>
          </PermissionGate>

          {scan && (
            <span className="muted" style={{ fontSize: 12 }}>
              <strong className="text-ad-text">{scan.startIp}</strong> – <strong className="text-ad-text">{scan.endIp}</strong> · {scan.scannedHosts}/{scan.totalHosts} scanned · {scan.aliveHosts} alive
              {scan.viaRelay && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>via Relay</span>}
            </span>
          )}
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ margin: "12px 18px 0" }}>{error}</div>}

      {pending && (
        <div className="alert alert-primary" style={{ margin: "12px 18px 0" }}>
          Waiting for the network relay agent to pick up this scan. Make sure <code>kynren_network_relay.py</code> is
          running on a machine inside the target LAN — see Admin &amp; Setup → System Settings.
        </div>
      )}

      {scanning && (
        <div style={{ paddingTop: 12 }}>
          <div className="ips-progress-track">
            <div className="ips-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      <div className="ips-table-wrap">
        <DataTable
          columns={resultColumns}
          data={scan ? results : []}
          clientPageSize={15}
          emptyMessage={!scan ? "Enter a range above and click Start to scan." : pending ? "Waiting for relay agent..." : scanning ? "Scanning..." : "No hosts found."}
        />
      </div>

      <div className="ips-statusbar">
        <span>{pending ? "Waiting for relay agent..." : scanning ? `Scanning… ${progressPct}%` : scan ? "Scan complete" : "Ready"}</span>
        <label className="nt-checkbox-pill">
          <input type="checkbox" checked={aliveOnly} onChange={(e) => setAliveOnly(e.target.checked)} />
          Display: Alive only
        </label>
        <span>Threads: {scanning ? SCAN_CONCURRENCY : 0}</span>
      </div>

      {history && history.length > 0 && (
        <div className="card" style={{ margin: 18, marginTop: 0 }}>
          <h3 className="mt-0">Recent Scans</h3>
          <DataTable columns={historyColumns} data={history} clientPageSize={5} onRowClick={(s) => setActiveScanId(s.id)} />
        </div>
      )}

      {statsScan && (
        <div className="modal-overlay" onClick={() => setStatsScan(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="row gap-2">
                <span className="ips-stats-icon"><Icon name="gauge" size={20} /></span>
                <div>
                  <h3 style={{ margin: 0 }}>Scanning completed</h3>
                </div>
              </div>
              <button className="modal-close" onClick={() => setStatsScan(null)}><Icon name="close" size={16} /></button>
            </div>

            <dl className="ips-stats-grid">
              {statsScan.completedAt && (
                <>
                  <dt>Total time</dt>
                  <dd>{formatDuration((new Date(statsScan.completedAt).getTime() - new Date(statsScan.startedAt).getTime()) / 1000)}</dd>
                  <dt>Average time per host</dt>
                  <dd>{formatDuration((new Date(statsScan.completedAt).getTime() - new Date(statsScan.startedAt).getTime()) / 1000 / Math.max(1, statsScan.scannedHosts))}</dd>
                </>
              )}
              <dt>IP Range</dt>
              <dd>{statsScan.startIp} – {statsScan.endIp}</dd>
              <dt>Hosts scanned</dt>
              <dd>{statsScan.totalHosts}</dd>
              <dt>Hosts alive</dt>
              <dd>{statsScan.aliveHosts}</dd>
              <dt>With open ports</dt>
              <dd>{(statsScan.results ?? []).filter((r) => r.openPorts.length > 0).length}</dd>
            </dl>

            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setStatsScan(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {adopting && (
        <AssetFormModal
          title={`Adopt "${adopting.hostname || adopting.ipAddress}" into Asset Inventory`}
          initial={{
            assetTag: adopting.macAddress ? adopting.macAddress.replace(/:/g, "").toUpperCase() : adopting.ipAddress.replace(/\./g, "-"),
            name: adopting.hostname || adopting.ipAddress,
            manufacturer: adopting.vendor ?? "",
            categoryId: guessCategoryId(adopting.deviceType, categories),
            notes: [
              "Discovered via IP Range Scanner.",
              adopting.deviceType ? `Detected type: ${adopting.deviceType}.` : null,
              adopting.macAddress ? `MAC: ${adopting.macAddress}.` : null,
            ].filter(Boolean).join(" "),
          }}
          onClose={() => setAdopting(null)}
          submitting={adoptMutation.isPending}
          onSubmit={(values: AssetFormValues) => {
            adoptMutation.mutate({
              ...values,
              nextServiceDate: values.nextServiceDate ? new Date(values.nextServiceDate).toISOString() : null,
              staticIpAddress: adopting.ipAddress,
            });
          }}
        />
      )}
    </div>
  );
}
