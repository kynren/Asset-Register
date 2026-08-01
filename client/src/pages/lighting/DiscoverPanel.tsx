import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { PermissionGate } from "../../auth/PermissionGate";
import { useClientInfo } from "../../hooks/useClientInfo";

interface DiscoverResult {
  id: number;
  ipAddress: string;
  protocol: "SHELLY" | "TASMOTA" | "GENERIC_HTTP";
  name: string | null;
  model: string | null;
  gen: number | null;
  alreadyAdded: boolean;
}

const PROTOCOL_LABELS: Record<DiscoverResult["protocol"], string> = {
  SHELLY: "Shelly",
  TASMOTA: "Tasmota",
  GENERIC_HTTP: "Generic HTTP",
};
interface DiscoverScan {
  id: number;
  startIp: string;
  endIp: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  totalHosts: number;
  scannedHosts: number;
  results?: DiscoverResult[];
}

function isValidSubnetPrefix(v: string): boolean {
  // First three octets only, e.g. "192.168.1" — the last octet is filled in as .1-254.
  return /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(v) && v.split(".").every((o) => Number(o) <= 255);
}

export function DiscoverPanel({ onAdded }: { onAdded: () => void }) {
  const [subnet, setSubnet] = useState("192.168.1");
  const [scanId, setScanId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: clientInfo } = useClientInfo();
  const defaultSubnetSet = useRef(false);
  useEffect(() => {
    if (defaultSubnetSet.current || !clientInfo?.observedIp) return;
    const prefix = clientInfo.observedIp.split(".").slice(0, 3).join(".");
    if (isValidSubnetPrefix(prefix)) setSubnet(prefix);
    defaultSubnetSet.current = true;
  }, [clientInfo]);

  const { data: scan } = useQuery({
    queryKey: ["lighting-discover", scanId],
    queryFn: async () => (await axiosClient.get(`/lighting/discover/${scanId}`)).data as DiscoverScan,
    enabled: scanId !== null,
    refetchInterval: (query) => (query.state.data?.status === "RUNNING" ? 800 : false),
  });

  const startMutation = useMutation({
    mutationFn: () => axiosClient.post("/lighting/discover", { startIp: `${subnet}.1`, endIp: `${subnet}.254` }),
    onSuccess: (res) => setScanId(res.data.id),
  });

  const addMutation = useMutation({
    mutationFn: (result: DiscoverResult) =>
      axiosClient.post("/lighting/devices", { name: result.name || result.model || result.ipAddress, protocol: result.protocol, ipAddress: result.ipAddress }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["lighting-discover", scanId] }); onAdded(); },
  });

  const adoptAllMutation = useMutation({
    mutationFn: () => axiosClient.post(`/lighting/discover/${scanId}/adopt-all`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["lighting-discover", scanId] }); onAdded(); },
  });

  const scanning = scan?.status === "RUNNING";
  const progressPct = scan && scan.totalHosts > 0 ? Math.round((scan.scannedHosts / scan.totalHosts) * 100) : 0;
  const results = scan?.results ?? [];
  const pendingResults = results.filter((r) => !r.alreadyAdded);
  const subnetValid = isValidSubnetPrefix(subnet);

  return (
    <div className="card">
      <div className="row gap-2" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <strong>Discover</strong>
          <span className="ips-field-label">Subnet:</span>
          <input
            className="ips-input"
            value={subnet}
            onChange={(e) => setSubnet(e.target.value)}
            disabled={scanning}
            placeholder="192.168.1"
            style={{ width: 130 }}
          />
          <span className="ips-to">.1 – .254</span>
        </div>
        <div className="row gap-2">
          <PermissionGate module="lighting" action="create">
            <button className="ips-start-btn" disabled={!subnetValid || scanning || startMutation.isPending} onClick={() => startMutation.mutate()}>
              <Icon name="radar" size={14} /> {scanning ? "Scanning..." : "Scan Network"}
            </button>
            <button
              className="btn btn-secondary"
              disabled={!scan || scanning || pendingResults.length === 0 || adoptAllMutation.isPending}
              onClick={() => adoptAllMutation.mutate()}
            >
              <Icon name="plus" size={14} /> {adoptAllMutation.isPending ? "Adopting..." : "Adopt All"}
            </button>
          </PermissionGate>
        </div>
      </div>

      {startMutation.isError && (
        <div className="alert alert-danger" style={{ marginTop: 10 }}>
          {(startMutation.error as any)?.response?.data?.error ?? "Could not start the scan."}
        </div>
      )}

      {scan && (
        <>
          <p className="muted" style={{ fontSize: 12, margin: "10px 0 4px" }}>
            {scan.startIp} – {scan.endIp} · {scan.scannedHosts}/{scan.totalHosts} scanned · {results.length} device{results.length === 1 ? "" : "s"} found
          </p>
          {scanning && (
            <div className="ips-progress-track" style={{ marginLeft: 0, marginRight: 0 }}>
              <div className="ips-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          )}
        </>
      )}

      {results.length > 0 && (
        <table className="data-table" style={{ marginTop: 12 }}>
          <thead><tr><th>IP Address</th><th>Protocol</th><th>Name / Model</th><th>Gen</th><th></th></tr></thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id}>
                <td className="ips-ip-cell">{r.ipAddress}</td>
                <td>{PROTOCOL_LABELS[r.protocol]}</td>
                <td>{r.name || r.model || "—"}</td>
                <td>{r.protocol === "SHELLY" ? r.gen ?? "?" : "—"}</td>
                <td>
                  {r.alreadyAdded ? (
                    <span className="badge badge-success">Added</span>
                  ) : (
                    <PermissionGate module="lighting" action="create">
                      <button className="btn btn-secondary btn-sm" disabled={addMutation.isPending} onClick={() => addMutation.mutate(r)}>
                        <Icon name="plus" size={12} /> Add
                      </button>
                    </PermissionGate>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {scan && scan.status === "COMPLETED" && results.length === 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>No Shelly or Tasmota devices found on {scan.startIp.split(".").slice(0, 3).join(".")}.0/24.</p>
      )}
    </div>
  );
}
