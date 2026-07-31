import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { FormModal } from "../../components/FormModal";
import { PermissionGate } from "../../auth/PermissionGate";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Skeleton } from "../../components/Skeleton";

interface DoorRight {
  doorId: number;
  planTemplateNo: string;
  door: { id: number; name: string; doorNumber: number };
}
interface Credential {
  id: number;
  deviceId: number;
  employeeNo: string;
  cardNumber: string | null;
  hasPin: boolean;
  status: "ACTIVE" | "DISABLED";
  validFrom: string | null;
  validTo: string | null;
  createdAt: string;
  user: { id: number; firstName: string; lastName: string; email: string };
  doorRights: DoorRight[];
}
interface DeviceDoor {
  id: number;
  name: string;
  doorNumber: number;
}
interface Device {
  id: number;
  name: string;
  ipAddress: string | null;
  doors: DeviceDoor[];
  credentials: Credential[];
}
interface DirectoryUser {
  id: number;
  firstName: string;
  lastName: string;
}

export function CredentialsTab() {
  const [addingForDevice, setAddingForDevice] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState<Credential | null>(null);
  const queryClient = useQueryClient();

  const { data: devices, isLoading } = useQuery({
    queryKey: ["access-control-devices"],
    queryFn: async () => (await axiosClient.get("/access-control/devices")).data as Device[],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["access-control-devices"] });
  }

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/access-control/credentials/${id}`),
    onSuccess: () => { invalidate(); setDeleting(null); },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "ACTIVE" | "DISABLED" }) => axiosClient.patch(`/access-control/credentials/${id}`, { status }),
    onSuccess: invalidate,
  });

  return (
    <div className="stack gap-3">
      {isLoading && <Skeleton height={140} />}
      {!isLoading && devices?.length === 0 && <div className="empty-state card">Add an access control device first, then enroll credentials against it.</div>}

      {devices?.map((device) => (
        <div key={device.id} className="card">
          <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <strong>{device.name}</strong>
            <PermissionGate module="access-control" action="create">
              <button className="btn btn-secondary btn-sm" disabled={!device.ipAddress} title={!device.ipAddress ? "Set an IP address on this device first" : undefined} onClick={() => setAddingForDevice(device)}>
                <Icon name="plus" size={12} /> Add Credential
              </button>
            </PermissionGate>
          </div>

          {device.credentials.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>No credentials enrolled on this device yet.</div>
          ) : (
            <table className="data-table">
              <thead><tr><th>Person</th><th>Card</th><th>PIN</th><th>Door Access</th><th>Valid</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {device.credentials.map((c) => (
                  <tr key={c.id}>
                    <td>{c.user.firstName} {c.user.lastName}<div className="muted" style={{ fontSize: 11 }}>{c.user.email}</div></td>
                    <td style={{ fontFamily: "monospace" }}>{c.cardNumber ?? "—"}</td>
                    <td>{c.hasPin ? "Yes" : "—"}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {c.doorRights.length === 0
                        ? "Controller default"
                        : c.doorRights.map((r) => `${r.door.name} (plan ${r.planTemplateNo})`).join(", ")}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {c.validFrom || c.validTo
                        ? `${c.validFrom ? dayjs(c.validFrom).format("DD MMM YYYY") : "…"} – ${c.validTo ? dayjs(c.validTo).format("DD MMM YYYY") : "…"}`
                        : "No expiry"}
                    </td>
                    <td>
                      <PermissionGate module="access-control" action="edit" fallback={<span className={`badge ${c.status === "ACTIVE" ? "badge-success" : "badge-neutral"}`}>{c.status}</span>}>
                        <button
                          className={`badge ${c.status === "ACTIVE" ? "badge-success" : "badge-neutral"}`}
                          style={{ border: "none", cursor: "pointer" }}
                          onClick={() => toggleStatusMutation.mutate({ id: c.id, status: c.status === "ACTIVE" ? "DISABLED" : "ACTIVE" })}
                        >
                          {c.status}
                        </button>
                      </PermissionGate>
                    </td>
                    <td>
                      <PermissionGate module="access-control" action="delete">
                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => setDeleting(c)} title="Revoke and remove"><Icon name="trash" size={12} /></button>
                      </PermissionGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {addingForDevice && (
        <AddCredentialModal device={addingForDevice} onClose={() => setAddingForDevice(null)} onCreated={invalidate} />
      )}

      {deleting && (
        <ConfirmDialog
          title="Revoke credential"
          message={`Remove ${deleting.user.firstName} ${deleting.user.lastName}'s access from this controller? This cannot be undone.`}
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
}

function AddCredentialModal({ device, onClose, onCreated }: { device: Device; onClose: () => void; onCreated: () => void }) {
  const [userId, setUserId] = useState<number | "">("");
  const [cardNumber, setCardNumber] = useState("");
  const [hasPin, setHasPin] = useState(false);
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  // Mirrors Hikvision's own RightPlan: which doors this person may use, and which pre-configured
  // schedule template applies on each (template numbers are authored on the controller itself,
  // e.g. "1" = All-day, "2" = Weekday — this app only assigns a template number per door).
  const [doorTemplates, setDoorTemplates] = useState<Record<number, string>>({});

  const { data: users } = useQuery({ queryKey: ["users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data as DirectoryUser[] });

  function toggleDoor(doorId: number, checked: boolean) {
    setDoorTemplates((prev) => {
      const next = { ...prev };
      if (checked) next[doorId] = next[doorId] ?? "1";
      else delete next[doorId];
      return next;
    });
  }

  const mutation = useMutation({
    mutationFn: () =>
      axiosClient.post(`/access-control/devices/${device.id}/credentials`, {
        userId: Number(userId),
        cardNumber: cardNumber || undefined,
        hasPin,
        validFrom: validFrom ? new Date(validFrom).toISOString() : undefined,
        validTo: validTo ? new Date(validTo).toISOString() : undefined,
        doorRights: Object.entries(doorTemplates).map(([doorId, planTemplateNo]) => ({ doorId: Number(doorId), planTemplateNo })),
      }),
    onSuccess: () => { onCreated(); onClose(); },
  });

  const alreadyEnrolled = new Set(device.credentials.map((c) => c.user.id));
  const availableUsers = users?.filter((u) => !alreadyEnrolled.has(u.id));

  return (
    <FormModal
      title={`Add Credential — ${device.name}`}
      onClose={onClose}
      onSubmit={() => mutation.mutate()}
      submitting={mutation.isPending}
      submitDisabled={!userId}
    >
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Could not provision this credential on the controller."}</div>}
      <div className="field">
        <label>Person *</label>
        <select className="select" value={userId} onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Select a user...</option>
          {availableUsers?.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
        </select>
      </div>
      <div className="field"><label>Card Number</label><input className="input" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="Optional — scan or enter the card's number" /></div>
      <label className="row gap-1" style={{ fontSize: 13, cursor: "pointer", marginBottom: 12 }}>
        <input type="checkbox" checked={hasPin} onChange={(e) => setHasPin(e.target.checked)} />
        Also has a PIN set directly on the controller keypad
      </label>
      <div className="grid grid-cols-2">
        <div className="field"><label>Valid From</label><input className="input" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></div>
        <div className="field"><label>Valid To</label><input className="input" type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} /></div>
      </div>

      <div className="field">
        <label>Door Access</label>
        {device.doors.length === 0 ? (
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>No doors added to this device yet — leave unchecked and the controller's own default access applies.</p>
        ) : (
          <div className="stack gap-1">
            {device.doors.map((door) => (
              <label key={door.id} className="row gap-2" style={{ fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={door.id in doorTemplates} onChange={(e) => toggleDoor(door.id, e.target.checked)} />
                {door.name} (Door {door.doorNumber})
                {door.id in doorTemplates && (
                  <input
                    className="input"
                    style={{ width: 70, marginLeft: "auto" }}
                    value={doorTemplates[door.id]}
                    onChange={(e) => setDoorTemplates((prev) => ({ ...prev, [door.id]: e.target.value }))}
                    placeholder="Plan #"
                    title="Schedule template number configured on the controller (e.g. 1 = All-day)"
                  />
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      <p className="muted" style={{ fontSize: 12 }}>Leave the validity dates blank for no expiry. This provisions the person directly on the controller over ISAPI, including door access and schedule template assignment (RightPlan).</p>
    </FormModal>
  );
}
