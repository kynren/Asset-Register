import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { PermissionGate } from "../../../auth/PermissionGate";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { SkeletonText } from "../../../components/Skeleton";

interface Booking {
  id: number;
  assetId: number;
  asset: { id: number; assetTag: string; name: string };
  bookedBy: { id: number; firstName: string; lastName: string };
  startAt: string;
  endAt: string;
  purpose: string | null;
  createdAt: string;
}

export function AssetBookingsTab() {
  const queryClient = useQueryClient();
  const [assetId, setAssetId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Booking | null>(null);

  const { data: assets } = useQuery({
    queryKey: ["assets-for-booking"],
    queryFn: async () => (await axiosClient.get("/assets", { params: { pageSize: 200 } })).data.items,
  });

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["op-bookings"],
    queryFn: async () => (await axiosClient.get("/operations/bookings")).data as Booking[],
  });

  const createMutation = useMutation({
    mutationFn: () =>
      axiosClient.post("/operations/bookings", {
        assetId: Number(assetId),
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        purpose: purpose || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["op-bookings"] });
      setAssetId("");
      setStartAt("");
      setEndAt("");
      setPurpose("");
      setError(null);
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Could not create booking."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/operations/bookings/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["op-bookings"] }); setDeleting(null); },
  });

  const upcoming = bookings?.filter((b) => new Date(b.endAt) >= new Date()) ?? [];
  const past = bookings?.filter((b) => new Date(b.endAt) < new Date()) ?? [];

  return (
    <div>
      <div className="ad-panel" style={{ marginBottom: 18 }}>
        <div className="ad-panel-title">Book an Asset</div>
        {error && <div className="ad-badge ad-badge-danger" style={{ marginBottom: 12, display: "block", width: "fit-content" }}>{error}</div>}
        <div className="ad-add-form">
          <div className="ad-field">
            <label>Asset</label>
            <select className="ad-select" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">Select asset...</option>
              {assets?.map((a: any) => <option key={a.id} value={a.id}>{a.assetTag} — {a.name}</option>)}
            </select>
          </div>
          <div className="ad-field"><label>Start</label><input className="ad-input" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></div>
          <div className="ad-field"><label>End</label><input className="ad-input" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></div>
          <div className="ad-field"><label>Purpose</label><input className="ad-input" placeholder="Optional" value={purpose} onChange={(e) => setPurpose(e.target.value)} /></div>
          <button
            className="ad-btn ad-btn-primary"
            disabled={!assetId || !startAt || !endAt || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            <Icon name="calendar" size={12} /> Book Asset
          </button>
        </div>
      </div>

      <div className="ad-grid">
        <div className="ad-panel">
          <div className="ad-panel-title">Upcoming Bookings</div>
          {isLoading ? (
            <div className="stack gap-2"><SkeletonText lines={3} /></div>
          ) : upcoming.length > 0 ? (
            <div className="stack gap-2">
              {upcoming.map((b) => (
                <div key={b.id} className="ad-row-card">
                  <div>
                    <div className="ad-row-value">{b.asset.name} ({b.asset.assetTag})</div>
                    <div className="ad-row-label" style={{ textTransform: "none" }}>
                      {dayjs(b.startAt).format("DD MMM YYYY, HH:mm")} → {dayjs(b.endAt).format("DD MMM YYYY, HH:mm")} · {b.bookedBy.firstName} {b.bookedBy.lastName}
                      {b.purpose ? ` · ${b.purpose}` : ""}
                    </div>
                  </div>
                  <PermissionGate module="operations" action="delete">
                    <button className="ad-btn ad-btn-danger" onClick={() => setDeleting(b)}><Icon name="trash" size={12} /></button>
                  </PermissionGate>
                </div>
              ))}
            </div>
          ) : (
            <div className="ad-empty">No upcoming bookings.</div>
          )}
        </div>

        <div className="ad-panel">
          <div className="ad-panel-title">Past Bookings</div>
          {past.length > 0 ? (
            <div className="stack gap-2">
              {past.map((b) => (
                <div key={b.id} className="ad-row-card">
                  <div>
                    <div className="ad-row-value">{b.asset.name} ({b.asset.assetTag})</div>
                    <div className="ad-row-label" style={{ textTransform: "none" }}>
                      {dayjs(b.startAt).format("DD MMM YYYY, HH:mm")} → {dayjs(b.endAt).format("DD MMM YYYY, HH:mm")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ad-empty">No past bookings recorded.</div>
          )}
        </div>
      </div>

      {deleting && (
        <ConfirmDialog
          title="Delete booking"
          message={`Are you sure you want to delete the booking for "${deleting.asset.name}" (${deleting.asset.assetTag})? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}
