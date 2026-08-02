import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { AssetDetail } from "./types";
import { PermissionGate } from "../../../auth/PermissionGate";

const STATUS_OPTIONS = ["PROTECTED", "AT_RISK", "DISABLED", "UNKNOWN"];

export function AntivirusTab({ asset, onUpdated }: { asset: AssetDetail; onUpdated: () => void }) {
  const [product, setProduct] = useState(asset.antivirusProduct ?? "");
  const [status, setStatus] = useState(asset.antivirusStatus ?? "UNKNOWN");
  const [lastScan, setLastScan] = useState(asset.antivirusLastScanAt?.slice(0, 10) ?? "");

  useEffect(() => {
    setProduct(asset.antivirusProduct ?? "");
    setStatus(asset.antivirusStatus ?? "UNKNOWN");
    setLastScan(asset.antivirusLastScanAt?.slice(0, 10) ?? "");
  }, [asset.id, asset.updatedAt]);

  const saveMutation = useMutation({
    mutationFn: () =>
      axiosClient.patch(`/assets/${asset.id}`, {
        antivirusProduct: product || null,
        antivirusStatus: status,
        antivirusLastScanAt: lastScan ? new Date(lastScan).toISOString() : null,
      }),
    onSuccess: onUpdated,
  });

  const badgeClass = status === "PROTECTED" ? "ad-badge-success" : status === "AT_RISK" ? "ad-badge-danger" : status === "DISABLED" ? "ad-badge-warning" : "ad-badge-neutral";

  return (
    <div>
      <div className="ad-content-header">
        <h2 className="ad-content-title"><Icon name="shield" size={16} /> Antivirus &amp; Endpoint Protection</h2>
        <p className="ad-content-subtitle">Record the antivirus/EDR product protecting this asset and its current status.</p>
      </div>

      <div className="ad-panel" style={{ maxWidth: 520 }}>
        <div className="ad-row-card">
          <div>
            <div className="ad-row-label">Protection Status</div>
            <div className="ad-row-value"><span className={`ad-badge ${badgeClass}`}>{status.replace("_", " ")}</span></div>
          </div>
        </div>

        <div className="ad-field" style={{ marginTop: 14 }}>
          <label>Antivirus Product</label>
          <input className="ad-input" placeholder="e.g. Microsoft Defender, CrowdStrike" value={product} onChange={(e) => setProduct(e.target.value)} />
        </div>
        <div className="ad-field" style={{ marginTop: 10 }}>
          <label>Status</label>
          <select className="ad-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </div>
        <div className="ad-field" style={{ marginTop: 10 }}>
          <label>Last Scan Date</label>
          <input className="ad-input" type="date" value={lastScan} onChange={(e) => setLastScan(e.target.value)} />
        </div>

        <PermissionGate module="assets" action="edit">
          <button className="ad-btn ad-btn-primary" style={{ marginTop: 14 }} disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        </PermissionGate>
      </div>
    </div>
  );
}
