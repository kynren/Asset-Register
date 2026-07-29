import dayjs from "dayjs";
import { Icon } from "../../../components/Icon";
import { AssetDetail } from "./types";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="ad-row-card">
      <div>
        <div className="ad-row-label">{label}</div>
        <div className="ad-row-value">{value}</div>
      </div>
    </div>
  );
}

export function OperatingSystemsTab({ asset }: { asset: AssetDetail }) {
  return (
    <div>
      <div className="ad-content-header">
        <h2 className="ad-content-title"><Icon name="layers" size={16} /> Operating Systems</h2>
        <p className="ad-content-subtitle">Platform details reported by the Kynren agent running on this asset.</p>
      </div>

      <div className="ad-panel">
        {asset.device ? (
          <>
            <Row label="Operating System" value={`${asset.device.os ?? "Unknown"} ${asset.device.osVersion ?? ""}`.trim()} />
            <Row label="Hostname" value={asset.device.hostname} />
            <Row label="CPU" value={asset.device.cpu ?? "—"} />
            <Row label="RAM" value={asset.device.ramGb ? `${asset.device.ramGb} GB` : "—"} />
            <Row label="Logged-in User" value={asset.device.loggedInUser ?? "—"} />
            <Row label="Last Login" value={asset.device.lastLoginAt ? dayjs(asset.device.lastLoginAt).format("DD MMM YYYY, HH:mm") : "—"} />
            <Row label="Last Scanned" value={dayjs(asset.device.lastSeen).format("DD MMM YYYY, HH:mm")} />
          </>
        ) : (
          <div className="ad-empty">
            No device linked to this asset. Run the Kynren agent on this machine and link it from Asset Inventory's
            "Discover Unregistered Assets" or the Devices list under Network Topology Map.
          </div>
        )}
      </div>
    </div>
  );
}
