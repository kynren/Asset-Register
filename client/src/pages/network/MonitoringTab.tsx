import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { DataTable } from "../../components/DataTable";
import { PermissionGate } from "../../auth/PermissionGate";

dayjs.extend(relativeTime);

interface MonitorRange {
  startIp: string;
  endIp: string;
  label?: string;
}

interface MonitorSettings {
  id: number;
  enabled: boolean;
  intervalMinutes: number;
  ranges: MonitorRange[];
  lastRunAt: string | null;
}

interface SnmpInterface {
  index: number;
  name: string;
  adminStatus: string;
  operStatus: string;
  speedMbps: number | null;
  inOctets: number | null;
  outOctets: number | null;
}

interface MonitoredDevice {
  id: number;
  key: string;
  ipAddress: string;
  macAddress: string | null;
  hostname: string | null;
  vendor: string | null;
  deviceType: string | null;
  status: "ONLINE" | "OFFLINE";
  firstSeenAt: string;
  lastSeenAt: string;
  lastChangedAt: string;
  snmpEnabled: boolean;
  snmpConfigured: boolean;
  snmpPort: number;
  snmpSysDescr: string | null;
  snmpUpTimeTicks: string | null;
  snmpInterfaces: SnmpInterface[] | null;
  snmpLastPolledAt: string | null;
  snmpLastError: string | null;
}

// Continuous, Domotz-style network monitoring: unlike the on-demand IP Range Scanner, this
// re-scans the configured ranges on a schedule, tracks each device's online/offline history
// (alerting only on actual state transitions), and optionally SNMP-polls devices for basic
// MIB-II interface health. All server-side in server/src/lib/networkMonitor.ts.
export function MonitoringTab() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<{ enabled: boolean; intervalMinutes: number; ranges: MonitorRange[] } | null>(null);
  const [snmpDeviceId, setSnmpDeviceId] = useState<number | null>(null);
  const [snmpCommunity, setSnmpCommunity] = useState("");
  const [snmpPort, setSnmpPort] = useState(161);
  const [snmpEnabledDraft, setSnmpEnabledDraft] = useState(true);
  const [detailsDevice, setDetailsDevice] = useState<MonitoredDevice | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["network-monitor-settings"],
    queryFn: async () => (await axiosClient.get("/network/monitor/settings")).data as MonitorSettings,
  });

  const { data: devices, isLoading } = useQuery({
    queryKey: ["network-monitor-devices"],
    queryFn: async () => (await axiosClient.get("/network/monitor/devices")).data as MonitoredDevice[],
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (settings && !draft) setDraft({ enabled: settings.enabled, intervalMinutes: settings.intervalMinutes, ranges: settings.ranges ?? [] });
  }, [settings, draft]);

  const saveMutation = useMutation({
    mutationFn: (payload: { enabled: boolean; intervalMinutes: number; ranges: MonitorRange[] }) => axiosClient.put("/network/monitor/settings", payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["network-monitor-settings"] }),
  });

  const runNowMutation = useMutation({
    mutationFn: () => axiosClient.post("/network/monitor/run-now"),
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["network-monitor-devices"] });
        queryClient.invalidateQueries({ queryKey: ["network-monitor-settings"] });
      }, 3000);
    },
  });

  const snmpMutation = useMutation({
    mutationFn: (payload: { id: number; snmpEnabled: boolean; snmpCommunity?: string; snmpPort: number }) =>
      axiosClient.post(`/network/monitor/devices/${payload.id}/snmp`, { snmpEnabled: payload.snmpEnabled, snmpCommunity: payload.snmpCommunity || undefined, snmpPort: payload.snmpPort }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["network-monitor-devices"] });
      setSnmpDeviceId(null);
      setSnmpCommunity("");
    },
  });

  function addRange() {
    if (!draft) return;
    setDraft({ ...draft, ranges: [...draft.ranges, { startIp: "", endIp: "", label: "" }] });
  }
  function updateRange(index: number, patch: Partial<MonitorRange>) {
    if (!draft) return;
    setDraft({ ...draft, ranges: draft.ranges.map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  }
  function removeRange(index: number) {
    if (!draft) return;
    setDraft({ ...draft, ranges: draft.ranges.filter((_, i) => i !== index) });
  }

  function openSnmp(device: MonitoredDevice) {
    setSnmpDeviceId(device.id);
    setSnmpCommunity("");
    setSnmpPort(device.snmpPort || 161);
    setSnmpEnabledDraft(true);
  }

  const columns: ColumnDef<MonitoredDevice, any>[] = [
    {
      header: "",
      id: "status-dot",
      enableSorting: false,
      cell: ({ row }) => <span className={`ips-dot ${row.original.status === "ONLINE" ? "alive" : "dead"}`} title={row.original.status} />,
    },
    { header: "Device", accessorFn: (d) => d.hostname ?? d.ipAddress, cell: ({ row }) => (
      <div>
        <div style={{ fontWeight: 600 }}>{row.original.hostname || row.original.ipAddress}</div>
        <div className="muted" style={{ fontSize: 11, fontFamily: "monospace" }}>{row.original.ipAddress}</div>
      </div>
    ) },
    { header: "Vendor / Type", accessorFn: (d) => [d.vendor, d.deviceType].filter(Boolean).join(" · ") || "—" },
    { header: "Status Since", accessorFn: (d) => d.lastChangedAt, cell: ({ row }) => dayjs(row.original.lastChangedAt).fromNow() },
    { header: "Last Seen", accessorFn: (d) => d.lastSeenAt, cell: ({ row }) => dayjs(row.original.lastSeenAt).fromNow() },
    {
      header: "SNMP",
      id: "snmp",
      enableSorting: false,
      cell: ({ row }) => {
        const d = row.original;
        if (!d.snmpEnabled) {
          return (
            <PermissionGate module="network" action="edit">
              <button className="btn btn-secondary btn-sm" onClick={() => openSnmp(d)}>Enable</button>
            </PermissionGate>
          );
        }
        return (
          <div className="row gap-1">
            {d.snmpLastError ? (
              <span className="badge badge-danger" title={d.snmpLastError}>Error</span>
            ) : d.snmpLastPolledAt ? (
              <button className="btn btn-secondary btn-sm" onClick={() => setDetailsDevice(d)}>
                {d.snmpInterfaces?.length ?? 0} interfaces
              </button>
            ) : (
              <span className="badge badge-neutral">Polling…</span>
            )}
            <PermissionGate module="network" action="edit">
              <button className="nt-icon-btn" title="Reconfigure SNMP" onClick={() => openSnmp(d)}>
                <Icon name="wrench" size={12} />
              </button>
            </PermissionGate>
          </div>
        );
      },
    },
  ];

  return (
    <div className="stack gap-3">
      <div className="card">
        <h3 className="mt-0">Continuous Monitoring</h3>
        <p className="muted" style={{ marginTop: -6 }}>
          Domotz-style background monitoring: periodically re-scans the ranges below, tracks each device's online/offline
          history, alerts on real status changes, and can poll SNMP-enabled devices for basic interface health.
        </p>

        {draft && (
          <>
            <div className="row gap-3 flex-wrap" style={{ alignItems: "center", marginBottom: 12 }}>
              <label className="row gap-2" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
                Enabled
              </label>
              <span className="row gap-2" style={{ alignItems: "center" }}>
                <span className="muted" style={{ fontSize: 13 }}>Re-scan every</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={1440}
                  style={{ width: 70 }}
                  value={draft.intervalMinutes}
                  onChange={(e) => setDraft({ ...draft, intervalMinutes: Number(e.target.value) || 1 })}
                />
                <span className="muted" style={{ fontSize: 13 }}>minutes</span>
              </span>
              {settings?.lastRunAt && <span className="muted" style={{ fontSize: 12 }}>Last run: {dayjs(settings.lastRunAt).fromNow()}</span>}
            </div>

            <div className="stack gap-2" style={{ marginBottom: 12 }}>
              {draft.ranges.map((r, i) => (
                <div key={i} className="row gap-2" style={{ alignItems: "center" }}>
                  <input className="input" style={{ width: 150 }} placeholder="Start IP" value={r.startIp} onChange={(e) => updateRange(i, { startIp: e.target.value })} />
                  <span className="muted">to</span>
                  <input className="input" style={{ width: 150 }} placeholder="End IP" value={r.endIp} onChange={(e) => updateRange(i, { endIp: e.target.value })} />
                  <input className="input" style={{ width: 160 }} placeholder="Label (optional)" value={r.label ?? ""} onChange={(e) => updateRange(i, { label: e.target.value })} />
                  <button className="nt-icon-btn" title="Remove range" onClick={() => removeRange(i)}>
                    <Icon name="close" size={13} />
                  </button>
                </div>
              ))}
              <button className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} onClick={addRange}>
                <Icon name="plus" size={12} /> Add Range
              </button>
            </div>

            <PermissionGate module="network" action="edit">
              <div className="row gap-2">
                <button className="btn btn-primary btn-sm" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate(draft)}>
                  {saveMutation.isPending ? "Saving..." : "Save Settings"}
                </button>
                <button className="btn btn-secondary btn-sm" disabled={runNowMutation.isPending || draft.ranges.length === 0} onClick={() => runNowMutation.mutate()}>
                  <Icon name="refresh" size={12} /> {runNowMutation.isPending ? "Starting..." : "Run Now"}
                </button>
              </div>
            </PermissionGate>
          </>
        )}
      </div>

      <div className="card">
        <h3 className="mt-0">Monitored Devices</h3>
        <DataTable
          columns={columns}
          data={devices ?? []}
          isLoading={isLoading}
          clientPageSize={15}
          emptyMessage="No devices yet — enable monitoring above and Run Now (or wait for the next scheduled pass)."
        />
      </div>

      {snmpDeviceId !== null && (
        <div className="modal-overlay" onClick={() => setSnmpDeviceId(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>SNMP Configuration</h3>
              <button className="modal-close" onClick={() => setSnmpDeviceId(null)}><Icon name="close" size={16} /></button>
            </div>
            <div className="stack gap-2">
              <label className="row gap-2" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={snmpEnabledDraft} onChange={(e) => setSnmpEnabledDraft(e.target.checked)} />
                Enable SNMP polling for this device
              </label>
              <div className="field">
                <label>Community String</label>
                <input className="input" type="password" placeholder="e.g. public" value={snmpCommunity} onChange={(e) => setSnmpCommunity(e.target.value)} />
              </div>
              <div className="field">
                <label>Port</label>
                <input className="input" type="number" value={snmpPort} onChange={(e) => setSnmpPort(Number(e.target.value) || 161)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSnmpDeviceId(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={snmpMutation.isPending}
                onClick={() => snmpMutation.mutate({ id: snmpDeviceId, snmpEnabled: snmpEnabledDraft, snmpCommunity, snmpPort })}
              >
                {snmpMutation.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailsDevice && (
        <div className="modal-overlay" onClick={() => setDetailsDevice(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>{detailsDevice.hostname || detailsDevice.ipAddress} — SNMP Detail</h3>
              <button className="modal-close" onClick={() => setDetailsDevice(null)}><Icon name="close" size={16} /></button>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>{detailsDevice.snmpSysDescr}</p>
            <div className="stack gap-1" style={{ maxHeight: 320, overflowY: "auto" }}>
              {(detailsDevice.snmpInterfaces ?? []).map((iface) => (
                <div key={iface.index} className="row gap-2" style={{ justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "1px solid var(--color-border)" }}>
                  <span>{iface.name}</span>
                  <span className={`badge ${iface.operStatus === "up" ? "badge-success" : "badge-neutral"}`}>{iface.operStatus}</span>
                  <span className="muted">{iface.speedMbps ? `${iface.speedMbps} Mbps` : "—"}</span>
                </div>
              ))}
              {(!detailsDevice.snmpInterfaces || detailsDevice.snmpInterfaces.length === 0) && <p className="muted">No interface data returned.</p>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setDetailsDevice(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
