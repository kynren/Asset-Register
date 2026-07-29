import { StatusBadge } from "../../components/StatusBadge";
import { Icon } from "../../components/Icon";

export function AssetGridCard({ asset, onOpen }: { asset: any; onOpen: () => void }) {
  const isOnline = asset.device ? Date.now() - new Date(asset.device.lastSeen).getTime() < 15 * 60 * 1000 : null;

  return (
    <div className="card" style={{ cursor: "pointer" }} onClick={onOpen}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row gap-2">
          <Icon name="assets" size={16} />
          <strong style={{ fontSize: 13 }}>{asset.name}</strong>
        </div>
        <StatusBadge status={asset.status} />
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "6px 0" }}>{asset.assetTag}{asset.serialNumber ? ` · ${asset.serialNumber}` : ""}</p>
      <div className="row gap-2" style={{ fontSize: 12, flexWrap: "wrap" }}>
        <span className="badge badge-neutral">{asset.category?.name ?? "Uncategorized"}</span>
        {asset.location && <span className="badge badge-neutral">{asset.location.name}</span>}
        {isOnline !== null && (
          <span className="row gap-1">
            <span className={`tag-dot ${isOnline ? "online" : "offline"}`} /> {isOnline ? "Online" : "Offline"}
          </span>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
        {asset.assignedTo ? `${asset.assignedTo.firstName} ${asset.assignedTo.lastName}` : "Unassigned"}
      </p>
    </div>
  );
}
