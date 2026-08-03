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

// Converts a CIDR block from a relay's discovered-subnets report into a plain start/end IP range
// (skipping the network/broadcast addresses for anything smaller than a /31) for the "Add as
// Range" convenience button — client-side only, no need for a server round trip for this.
function cidrToRange(cidr: string): { startIp: string; endIp: string } | null {
  const [base, prefixStr] = cidr.split("/");
  const prefix = Number(prefixStr);
  const parts = (base ?? "").split(".").map(Number);
  if (Number.isNaN(prefix) || prefix < 0 || prefix > 32 || parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
  const baseInt = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  const hostBits = 32 - prefix;
  const mask = hostBits === 0 ? 0xffffffff : (0xffffffff << hostBits) >>> 0;
  const network = baseInt & mask;
  const broadcast = hostBits === 0 ? network : (network | (~mask >>> 0)) >>> 0;
  const toIp = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  const startInt = hostBits > 1 ? network + 1 : network;
  const endInt = hostBits > 1 ? broadcast - 1 : broadcast;
  return { startIp: toIp(startInt), endIp: toIp(endInt) };
}

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
  notifyUserIds: number[];
  notifyEmails: string[];
  lastRunAt: string | null;
}

interface DirectoryUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
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

interface SnmpMacTableEntry {
  mac: string;
  port: string;
}

interface SnmpLldpNeighbor {
  localPort: string | null;
  remoteChassisId: string | null;
  remotePortId: string | null;
  remoteSysName: string | null;
  protocol: "LLDP" | "CDP";
}

interface SnmpVlan {
  vlanId: number | string;
  name: string | null;
}

interface SnmpPoeStatus {
  port: string;
  status: string;
}

interface MonitoredDevice {
  id: number;
  key: string;
  ipAddress: string;
  macAddress: string | null;
  hostname: string | null;
  vendor: string | null;
  deviceType: string | null;
  loggedInUser: string | null;
  status: "ONLINE" | "OFFLINE";
  firstSeenAt: string;
  lastSeenAt: string;
  lastChangedAt: string;
  snmpEnabled: boolean;
  snmpConfigured: boolean;
  snmpPort: number;
  snmpSysDescr: string | null;
  snmpSysName: string | null;
  snmpUpTimeTicks: string | null;
  snmpInterfaces: SnmpInterface[] | null;
  snmpMacTable: SnmpMacTableEntry[] | null;
  snmpLldpNeighbors: SnmpLldpNeighbor[] | null;
  snmpVlans: SnmpVlan[] | null;
  snmpPoeStatus: SnmpPoeStatus[] | null;
  snmpLastPolledAt: string | null;
  snmpLastError: string | null;
}

interface DiscoveredSubnet {
  id: number;
  cidr: string;
  label: string | null;
  lastSeenAt: string;
}

// Continuous, Domotz-style network monitoring: unlike the on-demand IP Range Scanner, this
// re-scans the configured ranges on a schedule, tracks each device's online/offline history
// (alerting only on actual state transitions), and optionally SNMP-polls devices for basic
// MIB-II interface health. All server-side in server/src/lib/networkMonitor.ts.
export function MonitoringTab() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<{ enabled: boolean; intervalMinutes: number; ranges: MonitorRange[]; notifyUserIds: number[]; notifyEmails: string[] } | null>(null);
  const [newEmail, setNewEmail] = useState("");
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

  const { data: discoveredSubnets } = useQuery({
    queryKey: ["network-discovered-subnets"],
    queryFn: async () => (await axiosClient.get("/network/discovered-subnets")).data as DiscoveredSubnet[],
    refetchInterval: 30000,
  });

  const { data: directory } = useQuery({
    queryKey: ["users-directory"],
    queryFn: async () => (await axiosClient.get("/users/directory")).data as DirectoryUser[],
  });

  useEffect(() => {
    if (settings && !draft) {
      setDraft({
        enabled: settings.enabled,
        intervalMinutes: settings.intervalMinutes,
        ranges: settings.ranges ?? [],
        notifyUserIds: settings.notifyUserIds ?? [],
        notifyEmails: settings.notifyEmails ?? [],
      });
    }
  }, [settings, draft]);

  const saveMutation = useMutation({
    mutationFn: (payload: { enabled: boolean; intervalMinutes: number; ranges: MonitorRange[]; notifyUserIds: number[]; notifyEmails: string[] }) =>
      axiosClient.put("/network/monitor/settings", payload),
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

  function toggleNotifyUser(userId: number) {
    if (!draft) return;
    const has = draft.notifyUserIds.includes(userId);
    setDraft({ ...draft, notifyUserIds: has ? draft.notifyUserIds.filter((id) => id !== userId) : [...draft.notifyUserIds, userId] });
  }
  function addNotifyEmail() {
    if (!draft) return;
    const email = newEmail.trim().toLowerCase();
    if (!email || draft.notifyEmails.includes(email)) return;
    setDraft({ ...draft, notifyEmails: [...draft.notifyEmails, email] });
    setNewEmail("");
  }
  function removeNotifyEmail(email: string) {
    if (!draft) return;
    setDraft({ ...draft, notifyEmails: draft.notifyEmails.filter((e) => e !== email) });
  }

  function addSubnetAsRange(subnet: DiscoveredSubnet) {
    if (!draft) return;
    const range = cidrToRange(subnet.cidr);
    if (!range) return;
    setDraft({ ...draft, ranges: [...draft.ranges, { ...range, label: subnet.label ?? subnet.cidr }] });
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
      cell: ({ row }) => <span className={`ips-dot status-flash ${row.original.status === "ONLINE" ? "alive" : "dead"}`} title={row.original.status} />,
    },
    { header: "Device", accessorFn: (d) => d.hostname ?? d.ipAddress, cell: ({ row }) => (
      <div>
        <div style={{ fontWeight: 600 }}>{row.original.hostname || row.original.ipAddress}</div>
        <div className="muted" style={{ fontSize: 11, fontFamily: "monospace" }}>{row.original.ipAddress}</div>
        {row.original.loggedInUser && (
          <div className="muted" style={{ fontSize: 11 }}>
            <Icon name="profile" size={10} /> {row.original.loggedInUser}
          </div>
        )}
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

            <div className="stack gap-2" style={{ marginBottom: 12, paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
              <strong style={{ fontSize: 13 }}>Alert Delivery</strong>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                Only the users and addresses below are notified on a device status change. Leave both empty to send nothing.
              </p>

              <div className="field">
                <label style={{ fontSize: 12 }}>Notify Users (in-app)</label>
                <div className="stack gap-1" style={{ maxHeight: 140, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 6, padding: 8 }}>
                  {(directory ?? []).map((u) => (
                    <label key={u.id} className="row gap-2" style={{ alignItems: "center", fontSize: 12, cursor: "pointer" }}>
                      <input type="checkbox" checked={draft.notifyUserIds.includes(u.id)} onChange={() => toggleNotifyUser(u.id)} />
                      {u.firstName} {u.lastName} <span className="muted">({u.email})</span>
                    </label>
                  ))}
                  {(!directory || directory.length === 0) && <span className="muted" style={{ fontSize: 12 }}>No active users.</span>}
                </div>
              </div>

              <div className="field">
                <label style={{ fontSize: 12 }}>Notify Emails</label>
                <div className="row gap-2 flex-wrap" style={{ marginBottom: 6 }}>
                  {draft.notifyEmails.map((email) => (
                    <span key={email} className="badge badge-neutral row gap-1" style={{ alignItems: "center" }}>
                      {email}
                      <button className="nt-icon-btn" style={{ padding: 0 }} title="Remove" onClick={() => removeNotifyEmail(email)}>
                        <Icon name="close" size={10} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="row gap-2">
                  <input
                    className="input"
                    style={{ width: 220 }}
                    placeholder="name@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNotifyEmail(); } }}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={addNotifyEmail}>
                    <Icon name="plus" size={12} /> Add
                  </button>
                </div>
              </div>
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

      {discoveredSubnets && discoveredSubnets.length > 0 && (
        <div className="card">
          <h3 className="mt-0">Subnets Detected by Relay</h3>
          <p className="muted" style={{ marginTop: -6 }}>
            Reported by the on-prem network relay agent's own local network interfaces (see Admin & Setup → System Settings →
            Network Relay Agent). Purely informational — nothing here is added to the ranges above automatically.
          </p>
          <div className="stack gap-1">
            {discoveredSubnets.map((s) => (
              <div key={s.id} className="row gap-2" style={{ alignItems: "center", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                <span>
                  <span style={{ fontFamily: "monospace" }}>{s.cidr}</span>
                  {s.label && <span className="muted"> — {s.label}</span>}
                </span>
                <span className="row gap-2" style={{ alignItems: "center" }}>
                  <span className="muted" style={{ fontSize: 11 }}>seen {dayjs(s.lastSeenAt).fromNow()}</span>
                  <PermissionGate module="network" action="edit">
                    <button className="btn btn-secondary btn-sm" disabled={!draft} onClick={() => addSubnetAsRange(s)}>
                      <Icon name="plus" size={11} /> Add as Range
                    </button>
                  </PermissionGate>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="mt-0">Monitored Devices</h3>
        <DataTable
          tableId="network.monitoredDevices"
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
          <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>{detailsDevice.snmpSysName || detailsDevice.hostname || detailsDevice.ipAddress} — SNMP Detail</h3>
              <button className="modal-close" onClick={() => setDetailsDevice(null)}><Icon name="close" size={16} /></button>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>{detailsDevice.snmpSysDescr}</p>
            <div className="stack gap-3" style={{ maxHeight: 420, overflowY: "auto" }}>
              <div>
                <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Interfaces</div>
                <div className="stack gap-1">
                  {(detailsDevice.snmpInterfaces ?? []).map((iface) => (
                    <div key={iface.index} className="row gap-2" style={{ justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "1px solid var(--color-border)" }}>
                      <span>{iface.name}</span>
                      <span className={`badge ${iface.operStatus === "up" ? "badge-success" : "badge-neutral"}`}>{iface.operStatus}</span>
                      <span className="muted">{iface.speedMbps ? `${iface.speedMbps} Mbps` : "—"}</span>
                    </div>
                  ))}
                  {(!detailsDevice.snmpInterfaces || detailsDevice.snmpInterfaces.length === 0) && <p className="muted" style={{ fontSize: 12 }}>No interface data returned.</p>}
                </div>
              </div>

              {detailsDevice.snmpLldpNeighbors && detailsDevice.snmpLldpNeighbors.length > 0 && (
                <div>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>LLDP / CDP Neighbors</div>
                  <div className="stack gap-1">
                    {detailsDevice.snmpLldpNeighbors.map((n, i) => (
                      <div key={i} className="row gap-2" style={{ justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "1px solid var(--color-border)" }}>
                        <span>Port {n.localPort ?? "—"}</span>
                        <span className="muted">{n.remoteSysName || n.remoteChassisId || "unknown neighbor"}{n.remotePortId ? ` (${n.remotePortId})` : ""}</span>
                        <span className="badge badge-neutral">{n.protocol}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailsDevice.snmpMacTable && detailsDevice.snmpMacTable.length > 0 && (
                <div>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>MAC Address Table ({detailsDevice.snmpMacTable.length})</div>
                  <div className="stack gap-1" style={{ maxHeight: 140, overflowY: "auto" }}>
                    {detailsDevice.snmpMacTable.map((m, i) => (
                      <div key={i} className="row gap-2" style={{ justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}>
                        <span style={{ fontFamily: "monospace" }}>{m.mac}</span>
                        <span className="muted">port {m.port}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {((detailsDevice.snmpVlans && detailsDevice.snmpVlans.length > 0) || (detailsDevice.snmpPoeStatus && detailsDevice.snmpPoeStatus.length > 0)) && (
                <div className="row gap-4">
                  {detailsDevice.snmpVlans && detailsDevice.snmpVlans.length > 0 && (
                    <div style={{ flex: 1 }}>
                      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>VLANs</div>
                      {detailsDevice.snmpVlans.map((v, i) => (
                        <div key={i} style={{ fontSize: 12 }}>{v.vlanId} — {v.name || "unnamed"}</div>
                      ))}
                    </div>
                  )}
                  {detailsDevice.snmpPoeStatus && detailsDevice.snmpPoeStatus.length > 0 && (
                    <div style={{ flex: 1 }}>
                      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>PoE</div>
                      {detailsDevice.snmpPoeStatus.map((p, i) => (
                        <div key={i} className="row gap-2" style={{ fontSize: 12 }}>
                          <span>Port {p.port}</span>
                          <span className={`badge ${p.status === "delivering" ? "badge-success" : "badge-neutral"}`}>{p.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
