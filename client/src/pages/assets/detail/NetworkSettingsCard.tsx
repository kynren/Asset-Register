import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { AssetDetail } from "./types";
import { PermissionGate } from "../../../auth/PermissionGate";

// Manually-recorded network configuration (what the network *should* be set to) — distinct from
// the "Network identity reported by the Kynren agent" block below, which is what the agent
// actually observed live. The two can legitimately disagree (planned config vs. current reality).
export function NetworkSettingsCard({ asset, onUpdated }: { asset: AssetDetail; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [staticIpAddress, setStaticIpAddress] = useState(asset.staticIpAddress ?? "");
  const [subnetMask, setSubnetMask] = useState(asset.subnetMask ?? "");
  const [defaultGateway, setDefaultGateway] = useState(asset.defaultGateway ?? "");
  const [dnsServers, setDnsServers] = useState(asset.dnsServers ?? "");

  useEffect(() => {
    setStaticIpAddress(asset.staticIpAddress ?? "");
    setSubnetMask(asset.subnetMask ?? "");
    setDefaultGateway(asset.defaultGateway ?? "");
    setDnsServers(asset.dnsServers ?? "");
  }, [asset.id, asset.updatedAt]);

  const saveMutation = useMutation({
    mutationFn: () =>
      axiosClient.patch(`/assets/${asset.id}`, {
        staticIpAddress: staticIpAddress || null,
        subnetMask: subnetMask || null,
        defaultGateway: defaultGateway || null,
        dnsServers: dnsServers || null,
      }),
    onSuccess: () => {
      onUpdated();
      setEditing(false);
    },
  });

  const hasAnyValue = asset.staticIpAddress || asset.subnetMask || asset.defaultGateway || asset.dnsServers;

  return (
    <div className="ad-panel" style={{ marginBottom: 16 }}>
      <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <div className="row gap-2">
          <Icon name="network" size={14} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>Network Configuration</span>
        </div>
        {!editing && (
          <PermissionGate module="assets" action="edit">
            <button className="ad-btn" onClick={() => setEditing(true)}>
              <Icon name="edit" size={12} /> {hasAnyValue ? "Edit" : "Set Network Config"}
            </button>
          </PermissionGate>
        )}
      </div>

      {editing ? (
        <>
          <div className="ad-add-form">
            <div className="ad-field">
              <label>IP Address</label>
              <input className="ad-input" placeholder="192.168.1.50" value={staticIpAddress} onChange={(e) => setStaticIpAddress(e.target.value)} />
            </div>
            <div className="ad-field">
              <label>Subnet Mask</label>
              <input className="ad-input" placeholder="255.255.255.0" value={subnetMask} onChange={(e) => setSubnetMask(e.target.value)} />
            </div>
            <div className="ad-field">
              <label>Default Gateway</label>
              <input className="ad-input" placeholder="192.168.1.1" value={defaultGateway} onChange={(e) => setDefaultGateway(e.target.value)} />
            </div>
            <div className="ad-field">
              <label>DNS Servers</label>
              <input className="ad-input" placeholder="8.8.8.8, 8.8.4.4" value={dnsServers} onChange={(e) => setDnsServers(e.target.value)} />
            </div>
          </div>
          <div className="row gap-2" style={{ marginTop: 12 }}>
            <button className="ad-btn ad-btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
            <button className="ad-btn" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </>
      ) : hasAnyValue ? (
        <table className="ad-table">
          <thead>
            <tr><th>IP Address</th><th>Subnet Mask</th><th>Default Gateway</th><th>DNS Servers</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>{asset.staticIpAddress ?? "—"}</td>
              <td>{asset.subnetMask ?? "—"}</td>
              <td>{asset.defaultGateway ?? "—"}</td>
              <td>{asset.dnsServers ?? "—"}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <div className="ad-empty">No network configuration recorded yet.</div>
      )}
    </div>
  );
}
