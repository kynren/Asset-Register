import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { AssetDetail } from "./types";
import { PermissionGate } from "../../../auth/PermissionGate";

const PROTOCOLS = ["RDP", "SSH", "VNC", "TeamViewer", "AnyDesk", "Other"];

export function RemoteManagementTab({ asset, onUpdated }: { asset: AssetDetail; onUpdated: () => void }) {
  const [enabled, setEnabled] = useState(asset.remoteManagementEnabled);
  const [protocol, setProtocol] = useState(asset.remoteManagementProtocol ?? "RDP");
  const [url, setUrl] = useState(asset.remoteManagementUrl ?? "");

  useEffect(() => {
    setEnabled(asset.remoteManagementEnabled);
    setProtocol(asset.remoteManagementProtocol ?? "RDP");
    setUrl(asset.remoteManagementUrl ?? "");
  }, [asset.id, asset.updatedAt]);

  const saveMutation = useMutation({
    mutationFn: () =>
      axiosClient.patch(`/assets/${asset.id}`, {
        remoteManagementEnabled: enabled,
        remoteManagementProtocol: protocol,
        remoteManagementUrl: url || null,
      }),
    onSuccess: onUpdated,
  });

  return (
    <div>
      <div className="ad-content-header">
        <h2 className="ad-content-title"><Icon name="terminal" size={16} /> Remote Management</h2>
        <p className="ad-content-subtitle">Configure how technicians can remotely reach this asset.</p>
      </div>

      <div className="ad-panel" style={{ maxWidth: 520 }}>
        <div className="ad-row-card">
          <div>
            <div className="ad-row-label">Remote Access</div>
            <div className="ad-row-value">{enabled ? "Enabled" : "Disabled"}</div>
          </div>
          <label className="ad-toggle">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span className="ad-toggle-slider" />
          </label>
        </div>

        <div className="ad-field" style={{ marginTop: 14 }}>
          <label>Protocol</label>
          <select className="ad-select" value={protocol} onChange={(e) => setProtocol(e.target.value)}>
            {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="ad-field" style={{ marginTop: 10 }}>
          <label>Connection Address / URL</label>
          <input className="ad-input" placeholder="e.g. rdp://192.168.1.50 or https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>

        <div className="row gap-2" style={{ marginTop: 14 }}>
          <PermissionGate module="assets" action="edit">
            <button className="ad-btn ad-btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
          </PermissionGate>
          {enabled && url && (
            <a className="ad-btn" href={url} target="_blank" rel="noreferrer">
              <Icon name="terminal" size={12} /> Connect
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
