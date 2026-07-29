import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { AssetFormModal, AssetFormValues } from "./AssetFormModal";

interface DiscoveredDevice {
  id: number;
  hostname: string;
  macAddress: string;
  ipAddresses: string[];
  os: string | null;
  osVersion: string | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  loggedInUser: string | null;
  lastLoginAt: string | null;
  installedSoftware: { name: string; version?: string }[] | null;
  lastSeen: string;
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function DiscoverDevicesModal({ onClose }: { onClose: () => void }) {
  const [registering, setRegistering] = useState<DiscoveredDevice | null>(null);
  const [expandedSoftware, setExpandedSoftware] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["devices-unregistered"],
    queryFn: async () => (await axiosClient.get("/devices", { params: { unregistered: true, pageSize: 100 } })).data,
  });

  const registerMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => axiosClient.post("/assets", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices-unregistered"] });
      queryClient.invalidateQueries({ queryKey: ["devices-unregistered-count"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["asset-stats"] });
      setRegistering(null);
    },
  });

  const devices: DiscoveredDevice[] = data?.items ?? [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 1000, width: "95%" }} onClick={(e) => e.stopPropagation()}>
        <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Discover Unregistered Assets</div>
            <div className="muted" style={{ fontSize: 12 }}>Devices reported by the Kynren agent that aren't linked to an asset record yet.</div>
          </div>
          <div className="row gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => refetch()} disabled={isFetching}>
              <Icon name="activity" size={13} /> {isFetching ? "Scanning..." : "Refresh"}
            </button>
            <button className="modal-close" onClick={onClose}><Icon name="close" size={18} /></button>
          </div>
        </div>

        {isLoading ? (
          <div className="empty-state">Scanning for unregistered devices...</div>
        ) : devices.length === 0 ? (
          <div className="empty-state">No unregistered devices found. Every reporting agent is already linked to an asset.</div>
        ) : (
          <div style={{ maxHeight: 480, overflow: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th>IP Address</th>
                  <th>MAC Address</th>
                  <th>Logged-in User</th>
                  <th>OS</th>
                  <th>Software</th>
                  <th>Last Login</th>
                  <th>Last Scanned</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.hostname}</td>
                    <td>{d.ipAddresses?.[0] ?? "—"}</td>
                    <td className="muted">{d.macAddress}</td>
                    <td>{d.loggedInUser ?? "—"}</td>
                    <td className="muted">{d.os ? `${d.os}${d.osVersion ? " " + d.osVersion : ""}` : "—"}</td>
                    <td>
                      {d.installedSoftware && d.installedSoftware.length > 0 ? (
                        <button className="btn btn-secondary btn-sm" onClick={() => setExpandedSoftware(expandedSoftware === d.id ? null : d.id)}>
                          {d.installedSoftware.length} apps
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="muted">{d.lastLoginAt ? timeAgo(d.lastLoginAt) : "—"}</td>
                    <td className="muted">{timeAgo(d.lastSeen)}</td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => setRegistering(d)}>Register as Asset</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {expandedSoftware !== null && (
              <div className="card" style={{ marginTop: 10, padding: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>Installed Software</div>
                <div className="row gap-1 flex-wrap">
                  {devices
                    .find((d) => d.id === expandedSoftware)
                    ?.installedSoftware?.map((s, i) => (
                      <span key={i} className="badge badge-neutral">
                        {s.name}
                        {s.version ? ` (${s.version})` : ""}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {registering && (
          <AssetFormModal
            title={`Register "${registering.hostname}" as Asset`}
            initial={{
              assetTag: registering.macAddress.replace(/:/g, "").toUpperCase(),
              name: registering.hostname,
              manufacturer: registering.manufacturer ?? "",
              model: registering.model ?? "",
              serialNumber: registering.serialNumber ?? "",
              notes: registering.loggedInUser ? `Discovered via network agent. Last logged-in user: ${registering.loggedInUser}.` : "Discovered via network agent.",
            }}
            onClose={() => setRegistering(null)}
            submitting={registerMutation.isPending}
            onSubmit={(values: AssetFormValues) => {
              const payload = {
                ...values,
                nextServiceDate: values.nextServiceDate ? new Date(values.nextServiceDate).toISOString() : null,
                deviceId: registering.id,
              };
              registerMutation.mutate(payload);
            }}
          />
        )}
      </div>
    </div>
  );
}
