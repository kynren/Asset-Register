import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { AssetDetail } from "./types";

export function VirtualizationTab({ asset, onUpdated }: { asset: AssetDetail; onUpdated: () => void }) {
  const [isVirtual, setIsVirtual] = useState(asset.isVirtual);
  const [hypervisor, setHypervisor] = useState(asset.hypervisor ?? "");
  const [vmHost, setVmHost] = useState(asset.vmHost ?? "");

  useEffect(() => {
    setIsVirtual(asset.isVirtual);
    setHypervisor(asset.hypervisor ?? "");
    setVmHost(asset.vmHost ?? "");
  }, [asset.id, asset.updatedAt]);

  const saveMutation = useMutation({
    mutationFn: () =>
      axiosClient.patch(`/assets/${asset.id}`, {
        isVirtual,
        hypervisor: hypervisor || null,
        vmHost: vmHost || null,
      }),
    onSuccess: onUpdated,
  });

  return (
    <div>
      <div className="ad-content-header">
        <h2 className="ad-content-title"><Icon name="cloud" size={16} /> Virtualization</h2>
        <p className="ad-content-subtitle">Mark this asset as a virtual machine and record its host details.</p>
      </div>

      <div className="ad-panel" style={{ maxWidth: 520 }}>
        <div className="ad-row-card">
          <div>
            <div className="ad-row-label">Machine Type</div>
            <div className="ad-row-value">{isVirtual ? "Virtual Machine" : "Physical Machine"}</div>
          </div>
          <label className="ad-toggle">
            <input type="checkbox" checked={isVirtual} onChange={(e) => setIsVirtual(e.target.checked)} />
            <span className="ad-toggle-slider" />
          </label>
        </div>

        {isVirtual && (
          <>
            <div className="ad-field" style={{ marginTop: 14 }}>
              <label>Hypervisor</label>
              <input className="ad-input" placeholder="e.g. VMware ESXi, Hyper-V, Proxmox" value={hypervisor} onChange={(e) => setHypervisor(e.target.value)} />
            </div>
            <div className="ad-field" style={{ marginTop: 10 }}>
              <label>Host Server</label>
              <input className="ad-input" placeholder="e.g. esxi-host-02" value={vmHost} onChange={(e) => setVmHost(e.target.value)} />
            </div>
          </>
        )}

        <button className="ad-btn ad-btn-primary" style={{ marginTop: 14 }} disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
