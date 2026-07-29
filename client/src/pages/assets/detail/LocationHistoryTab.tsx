import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { AssetDetail, AuditLogEntry } from "./types";
import { SkeletonText } from "../../../components/Skeleton";

function summarizeMetadata(metadata: Record<string, unknown> | null): string {
  if (!metadata) return "Updated";
  const keys = Object.keys(metadata).filter((k) => !["resourceKey", "id"].includes(k));
  if (keys.length === 0) return "Updated";
  return `Changed: ${keys.join(", ")}`;
}

export function LocationHistoryTab({ asset }: { asset: AssetDetail }) {
  const { data: history, isLoading } = useQuery({
    queryKey: ["asset-history", asset.id],
    queryFn: async () => (await axiosClient.get(`/assets/${asset.id}/history`)).data as AuditLogEntry[],
  });

  const mapQuery = encodeURIComponent(asset.location?.address || asset.location?.name || "");

  return (
    <div>
      <div className="ad-content-header">
        <h2 className="ad-content-title"><Icon name="mapPin" size={16} /> Location History &amp; Map</h2>
        <p className="ad-content-subtitle">Current placement and a timeline of changes recorded against this asset.</p>
      </div>

      <div className="ad-grid">
        <div className="ad-panel">
          <div className="ad-panel-title">Current Location</div>
          {asset.location ? (
            <>
              <div className="ad-row-card">
                <div className="row gap-2">
                  <div className="ad-icon-circle"><Icon name="mapPin" size={16} /></div>
                  <div>
                    <div className="ad-row-label">Site</div>
                    <div className="ad-row-value">{asset.location.name}</div>
                  </div>
                </div>
              </div>
              {asset.location.address && (
                <div className="ad-row-card">
                  <div>
                    <div className="ad-row-label">Address</div>
                    <div className="ad-row-value">{asset.location.address}</div>
                  </div>
                </div>
              )}
              <a
                className="ad-btn ad-btn-primary"
                style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
                href={`https://www.openstreetmap.org/search?query=${mapQuery}`}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="mapPin" size={13} /> Open in Maps
              </a>
            </>
          ) : (
            <div className="ad-empty">No location assigned to this asset yet.</div>
          )}
        </div>

        <div className="ad-panel">
          <div className="ad-panel-title">Change History</div>
          {isLoading ? (
            <SkeletonText lines={3} />
          ) : history && history.length > 0 ? (
            <div className="stack gap-2">
              {history.map((h) => (
                <div key={h.id} className="ad-row-card">
                  <div>
                    <div className="ad-row-value">{summarizeMetadata(h.metadata)}</div>
                    <div className="ad-row-label" style={{ textTransform: "none" }}>
                      {h.user ? `${h.user.firstName} ${h.user.lastName}` : "System"} · {dayjs(h.createdAt).format("DD MMM YYYY, HH:mm")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ad-empty">No recorded changes for this asset yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
