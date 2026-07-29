import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../../api/axiosClient";
import { Icon } from "../../../components/Icon";
import { ConfirmDialog } from "../../../components/ConfirmDialog";

interface License {
  id: number;
  name: string;
  vendor: string | null;
  licenseKey: string | null;
  seats: number;
  seatsUsed: number;
  purchaseDate: string | null;
  expiresAt: string | null;
  cost: string | null;
  notes: string | null;
}

interface Assignment {
  id: number;
  assignedAt: string;
  asset: { id: number; assetTag: string; name: string } | null;
  user: { id: number; firstName: string; lastName: string } | null;
}

export function LicensesTab() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [seats, setSeats] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [deletingLicense, setDeletingLicense] = useState<License | null>(null);
  const [unassigning, setUnassigning] = useState<{ licenseId: number; assignmentId: number; label: string } | null>(null);

  const { data: licenses, isLoading } = useQuery({
    queryKey: ["op-licenses"],
    queryFn: async () => (await axiosClient.get("/licenses")).data as License[],
  });
  const { data: users } = useQuery({ queryKey: ["users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data });
  const { data: assignments } = useQuery({
    queryKey: ["op-license-assignments", expanded],
    queryFn: async () => (await axiosClient.get(`/licenses/${expanded}/assignments`)).data as Assignment[],
    enabled: expanded !== null,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      axiosClient.post("/licenses", {
        name,
        vendor: vendor || undefined,
        seats: Number(seats) || 1,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["op-licenses"] });
      setName("");
      setVendor("");
      setSeats("1");
      setExpiresAt("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/licenses/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["op-licenses"] }); setDeletingLicense(null); },
  });

  const assignMutation = useMutation({
    mutationFn: (licenseId: number) => axiosClient.post(`/licenses/${licenseId}/assignments`, { userId: Number(assignUserId) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["op-licenses"] });
      queryClient.invalidateQueries({ queryKey: ["op-license-assignments", expanded] });
      setAssignUserId("");
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (params: { licenseId: number; assignmentId: number }) => axiosClient.delete(`/licenses/${params.licenseId}/assignments/${params.assignmentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["op-licenses"] });
      queryClient.invalidateQueries({ queryKey: ["op-license-assignments", expanded] });
      setUnassigning(null);
    },
  });

  return (
    <div>
      <div className="ad-panel" style={{ marginBottom: 18 }}>
        <div className="ad-panel-title">Add Software License</div>
        <div className="ad-add-form">
          <div className="ad-field"><label>Name</label><input className="ad-input" placeholder="e.g. Microsoft 365 E3" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="ad-field"><label>Vendor</label><input className="ad-input" placeholder="e.g. Microsoft" value={vendor} onChange={(e) => setVendor(e.target.value)} /></div>
          <div className="ad-field"><label>Seats</label><input className="ad-input" type="number" min={1} value={seats} onChange={(e) => setSeats(e.target.value)} /></div>
          <div className="ad-field"><label>Expires</label><input className="ad-input" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} /></div>
          <button className="ad-btn ad-btn-primary" disabled={!name.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
            <Icon name="plus" size={12} /> Add License
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="ad-empty">Loading...</div>
      ) : licenses && licenses.length > 0 ? (
        <div className="stack gap-2">
          {licenses.map((l) => {
            const seatsFull = l.seatsUsed >= l.seats;
            const expiringSoon = l.expiresAt && dayjs(l.expiresAt).diff(dayjs(), "day") <= 30;
            return (
              <div key={l.id} className="ad-panel">
                <div className="row gap-2" style={{ justifyContent: "space-between" }}>
                  <div>
                    <div className="row gap-2">
                      <strong style={{ fontSize: 13 }}>{l.name}</strong>
                      {l.vendor && <span className="ad-badge ad-badge-neutral">{l.vendor}</span>}
                      <span className={`ad-badge ${seatsFull ? "ad-badge-danger" : "ad-badge-success"}`}>{l.seatsUsed}/{l.seats} seats</span>
                      {expiringSoon && <span className="ad-badge ad-badge-warning">Expires {dayjs(l.expiresAt).format("DD MMM YYYY")}</span>}
                    </div>
                  </div>
                  <div className="row gap-1">
                    <button className="ad-btn" onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                      {expanded === l.id ? "Hide" : "Manage"} Assignments
                    </button>
                    <button className="ad-btn ad-btn-danger" onClick={() => setDeletingLicense(l)}><Icon name="trash" size={12} /></button>
                  </div>
                </div>

                {expanded === l.id && (
                  <div style={{ marginTop: 12 }}>
                    <div className="row gap-2" style={{ marginBottom: 10 }}>
                      <select className="ad-select" style={{ width: "auto" }} value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)}>
                        <option value="">Assign to user...</option>
                        {users?.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                      </select>
                      <button className="ad-btn ad-btn-primary" disabled={!assignUserId || seatsFull || assignMutation.isPending} onClick={() => assignMutation.mutate(l.id)}>
                        Assign
                      </button>
                    </div>
                    {assignments && assignments.length > 0 ? (
                      <div className="stack gap-1">
                        {assignments.map((a) => (
                          <div key={a.id} className="ad-row-card">
                            <div className="ad-row-value">
                              {a.user ? `${a.user.firstName} ${a.user.lastName}` : a.asset ? `${a.asset.name} (${a.asset.assetTag})` : "Unknown"}
                            </div>
                            <button
                              className="ad-btn ad-btn-danger"
                              onClick={() =>
                                setUnassigning({
                                  licenseId: l.id,
                                  assignmentId: a.id,
                                  label: a.user ? `${a.user.firstName} ${a.user.lastName}` : a.asset ? `${a.asset.name} (${a.asset.assetTag})` : "this assignment",
                                })
                              }
                            >
                              <Icon name="trash" size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="ad-empty">No seats assigned yet.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ad-empty">No software licenses tracked yet.</div>
      )}

      {deletingLicense && (
        <ConfirmDialog
          title="Delete license"
          message={`Are you sure you want to delete "${deletingLicense.name}"? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeletingLicense(null)}
          onConfirm={() => deleteMutation.mutate(deletingLicense.id)}
        />
      )}

      {unassigning && (
        <ConfirmDialog
          title="Unassign license"
          message={`Are you sure you want to unassign this license from "${unassigning.label}"?`}
          danger
          loading={unassignMutation.isPending}
          onCancel={() => setUnassigning(null)}
          onConfirm={() => unassignMutation.mutate({ licenseId: unassigning.licenseId, assignmentId: unassigning.assignmentId })}
        />
      )}
    </div>
  );
}
