import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { AssetDetail, AssetPhoto } from "./types";

export function AssetProfileTab({ asset, onUpdated }: { asset: AssetDetail; onUpdated: () => void }) {
  const queryClient = useQueryClient();
  const featuredInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const { data: photos } = useQuery({
    queryKey: ["asset-photos", asset.id],
    queryFn: async () => (await axiosClient.get(`/asset-resources/${asset.id}/photos`)).data as AssetPhoto[],
  });

  const { data: users } = useQuery({ queryKey: ["users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data });

  const featuredMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return axiosClient.post(`/asset-resources/${asset.id}/featured-image`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: onUpdated,
  });

  const galleryUploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return axiosClient.post(`/asset-resources/${asset.id}/photos`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-photos", asset.id] }),
  });

  const galleryDeleteMutation = useMutation({
    mutationFn: (photoId: number) => axiosClient.delete(`/asset-resources/${asset.id}/photos/${photoId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["asset-photos", asset.id] }),
  });

  const assignMutation = useMutation({
    mutationFn: (assignedToId: number | null) => axiosClient.patch(`/assets/${asset.id}`, { assignedToId }),
    onSuccess: onUpdated,
  });

  const powerMutation = useMutation({
    mutationFn: (gridPowered: boolean) => axiosClient.patch(`/assets/${asset.id}`, { gridPowered }),
    onSuccess: onUpdated,
  });

  return (
    <div>
      <div className="ad-content-header">
        <h2 className="ad-content-title"><Icon name="profile" size={16} /> Asset Profile &amp; Identity</h2>
        <p className="ad-content-subtitle">Manage asset imagery, visual gallery, and assign staff responsibility.</p>
      </div>

      <div className="ad-grid">
        <div className="ad-panel">
          <div className="ad-panel-title">Featured Image</div>
          <div className="ad-featured-image">
            {asset.featuredImageUrl ? (
              <img src={asset.featuredImageUrl} alt="" />
            ) : (
              <div className="stack gap-1" style={{ alignItems: "center" }}>
                <Icon name="profile" size={28} />
                <span>No Featured Image</span>
              </div>
            )}
          </div>
          <input
            ref={featuredInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) featuredMutation.mutate(file);
              if (featuredInputRef.current) featuredInputRef.current.value = "";
            }}
          />
          <button className="ad-upload-btn" onClick={() => featuredInputRef.current?.click()} disabled={featuredMutation.isPending}>
            {featuredMutation.isPending ? "Uploading..." : "Upload Image"}
          </button>

          <div className="ad-panel-title" style={{ marginTop: 18 }}>
            Asset Photo Gallery
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) galleryUploadMutation.mutate(file);
                if (galleryInputRef.current) galleryInputRef.current.value = "";
              }}
            />
            <button className="ad-btn ad-btn-primary" onClick={() => galleryInputRef.current?.click()} disabled={galleryUploadMutation.isPending}>
              <Icon name="plus" size={12} /> Add Photo
            </button>
          </div>
          {photos && photos.length > 0 ? (
            <div className="ad-gallery-grid">
              {photos.map((p) => (
                <div key={p.id} className="ad-gallery-item">
                  <img src={p.url} alt="" />
                  <button onClick={() => galleryDeleteMutation.mutate(p.id)} title="Remove photo"><Icon name="close" size={12} /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="ad-gallery-empty">No images logged in this asset's gallery registry.</div>
          )}
        </div>

        <div className="ad-panel">
          <div className="ad-panel-title">Asset Responsibility &amp; Assignment</div>

          <div className="ad-row-card">
            <div className="row gap-2">
              <div className="ad-icon-circle"><Icon name="profile" size={16} /></div>
              <div>
                <div className="ad-row-label">Currently Assigned Operator</div>
                <div className="ad-row-value">{asset.assignedTo ? `${asset.assignedTo.firstName} ${asset.assignedTo.lastName}` : "Unassigned"}</div>
              </div>
            </div>
            {asset.assignedTo ? (
              <button className="ad-btn ad-btn-danger" onClick={() => assignMutation.mutate(null)} disabled={assignMutation.isPending}>
                Un-assign Asset
              </button>
            ) : (
              <select
                className="ad-select"
                style={{ width: "auto" }}
                value=""
                onChange={(e) => e.target.value && assignMutation.mutate(Number(e.target.value))}
              >
                <option value="">Assign to...</option>
                {users?.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
            )}
          </div>

          <div className="ad-row-card">
            <div className="row gap-2">
              <div className="ad-icon-circle"><Icon name="power" size={16} /></div>
              <div>
                <div className="ad-row-label">Power Specification</div>
                <div className="ad-row-value">{asset.gridPowered ? "Main AC Powered (Grid)" : "Battery / Backup Powered"}</div>
              </div>
            </div>
            <label className="ad-toggle">
              <input
                type="checkbox"
                checked={asset.gridPowered}
                disabled={powerMutation.isPending}
                onChange={(e) => powerMutation.mutate(e.target.checked)}
              />
              <span className="ad-toggle-slider" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
