import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { AssetDetail, AssetPhoto } from "./types";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { PermissionGate } from "../../../auth/PermissionGate";

interface Checkout {
  id: number;
  checkedOutAt: string;
  dueBackAt: string | null;
  checkedInAt: string | null;
  notes: string | null;
  checkedOutTo: { id: number; firstName: string; lastName: string };
  checkedOutBy: { id: number; firstName: string; lastName: string };
  checkedInBy: { id: number; firstName: string; lastName: string } | null;
}

function OverviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="ad-row-card">
      <div>
        <div className="ad-row-label">{label}</div>
        <div className="ad-row-value">{value}</div>
      </div>
    </div>
  );
}

export function AssetProfileTab({ asset, onUpdated }: { asset: AssetDetail; onUpdated: () => void }) {
  const queryClient = useQueryClient();
  const featuredInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const { data: photos } = useQuery({
    queryKey: ["asset-photos", asset.id],
    queryFn: async () => (await axiosClient.get(`/asset-resources/${asset.id}/photos`)).data as AssetPhoto[],
  });

  const { data: users } = useQuery({ queryKey: ["users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data });
  const { data: checkouts } = useQuery({
    queryKey: ["asset-checkouts", asset.id],
    queryFn: async () => (await axiosClient.get(`/assets/${asset.id}/checkouts`)).data as Checkout[],
  });

  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [checkoutToId, setCheckoutToId] = useState("");
  const [dueBackAt, setDueBackAt] = useState("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [deletingPhoto, setDeletingPhoto] = useState<AssetPhoto | null>(null);

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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["asset-photos", asset.id] }); setDeletingPhoto(null); },
  });

  const checkoutMutation = useMutation({
    mutationFn: () =>
      axiosClient.post(`/assets/${asset.id}/checkout`, {
        checkedOutToId: Number(checkoutToId),
        dueBackAt: dueBackAt ? new Date(dueBackAt).toISOString() : null,
      }),
    onSuccess: () => {
      onUpdated();
      queryClient.invalidateQueries({ queryKey: ["asset-checkouts", asset.id] });
      setShowCheckoutForm(false);
      setCheckoutToId("");
      setDueBackAt("");
      setCheckoutError(null);
    },
    onError: (err: any) => setCheckoutError(err.response?.data?.error ?? "Could not check out this asset."),
  });

  const checkinMutation = useMutation({
    mutationFn: () => axiosClient.post(`/assets/${asset.id}/checkin`, {}),
    onSuccess: () => {
      onUpdated();
      queryClient.invalidateQueries({ queryKey: ["asset-checkouts", asset.id] });
    },
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

      <div className="ad-panel" style={{ marginBottom: 18 }}>
        <div className="ad-panel-title">Asset Overview</div>
        <div className="ad-grid">
          <OverviewField label="Asset Tag" value={asset.assetTag} />
          <OverviewField label="Category" value={asset.category?.name ?? "Uncategorized"} />
          <OverviewField label="Status" value={asset.status.replace("_", " ")} />
          <OverviewField label="Manufacturer" value={asset.manufacturer ?? "—"} />
          <OverviewField label="Model" value={asset.model ?? "—"} />
          <OverviewField label="Serial Number" value={asset.serialNumber ?? "—"} />
          <OverviewField label="Location" value={asset.location?.name ?? "Unassigned"} />
          <OverviewField label="Notes" value={asset.notes ?? "—"} />
          {asset.device && (
            <>
              <OverviewField label="Network Hostname" value={asset.device.hostname} />
              <OverviewField label="Operating System" value={`${asset.device.os ?? "Unknown"} ${asset.device.osVersion ?? ""}`.trim()} />
            </>
          )}
        </div>
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
          <PermissionGate module="assets" action="edit">
            <button className="ad-upload-btn" onClick={() => featuredInputRef.current?.click()} disabled={featuredMutation.isPending}>
              {featuredMutation.isPending ? "Uploading..." : "Upload Image"}
            </button>
          </PermissionGate>

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
            <PermissionGate module="assets" action="edit">
              <button className="ad-btn ad-btn-primary" onClick={() => galleryInputRef.current?.click()} disabled={galleryUploadMutation.isPending}>
                <Icon name="plus" size={12} /> Add Photo
              </button>
            </PermissionGate>
          </div>
          {photos && photos.length > 0 ? (
            <div className="ad-gallery-grid">
              {photos.map((p) => (
                <div key={p.id} className="ad-gallery-item">
                  <img src={p.url} alt="" />
                  <PermissionGate module="assets" action="edit">
                    <button onClick={() => setDeletingPhoto(p)} title="Remove photo"><Icon name="close" size={12} /></button>
                  </PermissionGate>
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
            <PermissionGate module="assets" action="edit">
              {asset.assignedTo ? (
                <button className="ad-btn ad-btn-danger" onClick={() => checkinMutation.mutate()} disabled={checkinMutation.isPending}>
                  {checkinMutation.isPending ? "Checking in..." : "Check In"}
                </button>
              ) : (
                <button className="ad-btn ad-btn-primary" onClick={() => setShowCheckoutForm((v) => !v)}>
                  Check Out
                </button>
              )}
            </PermissionGate>
          </div>

          {showCheckoutForm && !asset.assignedTo && (
            <div className="ad-row-card" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
              {checkoutError && <div className="ad-badge ad-badge-danger" style={{ width: "fit-content" }}>{checkoutError}</div>}
              <div className="ad-field">
                <label>Check Out To</label>
                <select className="ad-select" value={checkoutToId} onChange={(e) => setCheckoutToId(e.target.value)}>
                  <option value="">Select user...</option>
                  {users?.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                </select>
              </div>
              <div className="ad-field">
                <label>Due Back</label>
                <input className="ad-input" type="date" value={dueBackAt} onChange={(e) => setDueBackAt(e.target.value)} />
              </div>
              <button className="ad-btn ad-btn-primary" disabled={!checkoutToId || checkoutMutation.isPending} onClick={() => checkoutMutation.mutate()}>
                {checkoutMutation.isPending ? "Checking out..." : "Confirm Check Out"}
              </button>
            </div>
          )}

          <div className="ad-row-card">
            <div className="row gap-2">
              <div className="ad-icon-circle"><Icon name="power" size={16} /></div>
              <div>
                <div className="ad-row-label">Power Specification</div>
                <div className="ad-row-value">{asset.gridPowered ? "Main AC Powered (Grid)" : "Battery / Backup Powered"}</div>
              </div>
            </div>
            <PermissionGate module="assets" action="edit">
              <label className="ad-toggle">
                <input
                  type="checkbox"
                  checked={asset.gridPowered}
                  disabled={powerMutation.isPending}
                  onChange={(e) => powerMutation.mutate(e.target.checked)}
                />
                <span className="ad-toggle-slider" />
              </label>
            </PermissionGate>
          </div>

          {!asset.gridPowered && (
            <div className="ad-row-card">
              <div className="row gap-2">
                <div className="ad-icon-circle"><Icon name="battery" size={16} /></div>
                <div>
                  <div className="ad-row-label">Battery State</div>
                  <div className="ad-row-value">
                    {asset.device?.batteryPresent === true && asset.device.batteryPercent != null
                      ? `${asset.device.batteryPercent}% ${asset.device.batteryCharging ? "· Charging" : "· On Battery"}`
                      : asset.device?.batteryPresent === false
                        ? "Linked device reports no battery"
                        : "No live reading yet — reported by the device agent"}
                  </div>
                </div>
              </div>
              {asset.device?.batteryPercent != null && (
                <span
                  className={`ad-badge ${asset.device.batteryPercent <= 20 ? "ad-badge-danger" : asset.device.batteryPercent <= 50 ? "ad-badge-warning" : "ad-badge-success"}`}
                >
                  {asset.device.batteryPercent}%
                </span>
              )}
            </div>
          )}

          <div className="ad-panel-title" style={{ marginTop: 18 }}>Checkout History</div>
          {checkouts && checkouts.length > 0 ? (
            <div className="stack gap-2">
              {checkouts.map((c) => (
                <div key={c.id} className="ad-row-card">
                  <div>
                    <div className="ad-row-value">
                      {c.checkedOutTo.firstName} {c.checkedOutTo.lastName}
                      {!c.checkedInAt && <span className="ad-badge ad-badge-warning" style={{ marginLeft: 8 }}>Active</span>}
                    </div>
                    <div className="ad-row-label" style={{ textTransform: "none" }}>
                      Out {dayjs(c.checkedOutAt).format("DD MMM YYYY")}
                      {c.dueBackAt && ` · Due ${dayjs(c.dueBackAt).format("DD MMM YYYY")}`}
                      {c.checkedInAt && ` · Returned ${dayjs(c.checkedInAt).format("DD MMM YYYY")}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ad-empty">No checkout history for this asset yet.</div>
          )}
        </div>
      </div>

      {deletingPhoto && (
        <ConfirmDialog
          title="Delete photo"
          message="Are you sure you want to remove this photo from the asset's gallery? This cannot be undone."
          danger
          loading={galleryDeleteMutation.isPending}
          onCancel={() => setDeletingPhoto(null)}
          onConfirm={() => galleryDeleteMutation.mutate(deletingPhoto.id)}
        />
      )}
    </div>
  );
}
