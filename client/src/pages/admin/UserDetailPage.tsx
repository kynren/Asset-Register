import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { Icon } from "../../components/Icon";
import { StatusBadge } from "../../components/StatusBadge";
import { FormModal } from "../../components/FormModal";
import { QrCodeModal } from "../../components/QrCodeModal";
import { Skeleton, SkeletonText } from "../../components/Skeleton";

interface UserDetail {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roleId: number;
  role: { id: number; name: string };
}

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [roleId, setRoleId] = useState<number | "">("");
  const [saved, setSaved] = useState(false);
  const [tempPasswordInfo, setTempPasswordInfo] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const { data: user, isLoading } = useQuery({
    queryKey: ["user", id],
    queryFn: async () => (await axiosClient.get(`/users/${id}`)).data as UserDetail,
  });

  const { data: roles } = useQuery({ queryKey: ["roles-lite"], queryFn: async () => (await axiosClient.get("/roles")).data });

  const { data: devices } = useQuery({
    queryKey: ["user-devices", id],
    queryFn: async () => (await axiosClient.get(`/users/${id}/devices`)).data,
  });

  const { data: activity } = useQuery({
    queryKey: ["user-activity", id],
    queryFn: async () => (await axiosClient.get("/audit", { params: { userId: id, pageSize: 10 } })).data,
  });

  useEffect(() => {
    if (user) {
      setEmail(user.email);
      setFirstName(user.firstName);
      setLastName(user.lastName);
      setRoleId(user.roleId);
    }
  }, [user]);

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/users/${id}`, { email, firstName, lastName, roleId: Number(roleId) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () => axiosClient.patch(`/users/${id}`, { isActive: !user!.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user", id] }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => axiosClient.post(`/users/${id}/reset-password`, {}),
    onSuccess: (res) => setTempPasswordInfo(res.data.tempPassword),
  });

  const magicLinkMutation = useMutation({
    mutationFn: () => axiosClient.post(`/users/${id}/send-magic-link`, {}),
    onSuccess: () => {
      setMagicLinkSent(true);
      setTimeout(() => setMagicLinkSent(false), 4000);
    },
  });

  if (isLoading || !user) {
    return (
      <div className="stack gap-3">
        <div className="row gap-3">
          <Skeleton width={52} height={52} className="rounded-full" />
          <div className="stack gap-1">
            <Skeleton width={180} height={20} />
            <Skeleton width={120} height={14} />
          </div>
        </div>
        <div className="grid grid-cols-2">
          <div className="card"><SkeletonText lines={5} /></div>
          <div className="card"><SkeletonText lines={4} /></div>
        </div>
        <div className="card"><SkeletonText lines={3} /></div>
      </div>
    );
  }

  return (
    <div className="stack gap-3">
      <button className="btn btn-secondary btn-sm" style={{ width: "fit-content" }} onClick={() => navigate("/admin")}>
        <Icon name="chevronLeft" size={14} /> Back to Users
      </button>

      <div className="page-header">
        <div className="row gap-3">
          <div className="avatar" style={{ width: 52, height: 52, fontSize: 18, overflow: "hidden" }}>
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(user.firstName, user.lastName)}
          </div>
          <div>
            <h1 className="page-title">{user.firstName} {user.lastName}</h1>
            <p className="page-subtitle">{user.email}</p>
          </div>
        </div>
        <div className="row gap-2">
          <StatusBadge status={user.role.name.toUpperCase().replace(/\s/g, "_")} />
          <StatusBadge status={user.isActive ? "ACTIVE" : "INACTIVE"} />
          <button className="btn btn-secondary btn-sm" onClick={() => setShowQr(true)}>
            <Icon name="grid" size={13} /> QR Code
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2">
        <div className="card">
          <h3 className="mt-0">Profile & Role</h3>
          {saved && <div className="alert alert-success">Saved.</div>}
          {saveMutation.isError && (
            <div className="alert alert-danger">{(saveMutation.error as any)?.response?.data?.error ?? "Could not save changes."}</div>
          )}
          <div className="field"><label>Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="grid grid-cols-2">
            <div className="field"><label>First Name</label><input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
            <div className="field"><label>Last Name</label><input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
          </div>
          <div className="field">
            <label>Role</label>
            <select className="select" value={roleId} onChange={(e) => setRoleId(Number(e.target.value))}>
              {roles?.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>Save Changes</button>

          <div className="row gap-2" style={{ marginTop: 18, borderTop: "1px solid var(--color-border)", paddingTop: 14, flexWrap: "wrap" }}>
            <button className="btn btn-secondary btn-sm" onClick={() => resetPasswordMutation.mutate()} disabled={resetPasswordMutation.isPending}>
              Set Temporary Password
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => magicLinkMutation.mutate()}
              disabled={magicLinkMutation.isPending || !user.isActive}
              title={!user.isActive ? "Reactivate this account first" : undefined}
            >
              {magicLinkSent ? "Link Sent" : "Send Magic Login Link"}
            </button>
            <button className={`btn btn-sm ${user.isActive ? "btn-danger" : "btn-secondary"}`} onClick={() => toggleActiveMutation.mutate()}>
              {user.isActive ? "Deactivate Account" : "Reactivate Account"}
            </button>
          </div>
          {magicLinkMutation.isError && (
            <div className="alert alert-danger" style={{ marginTop: 10 }}>
              {(magicLinkMutation.error as any)?.response?.data?.error ?? "Could not send the login link."}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="mt-0">Account Info</h3>
          <dl className="stack gap-2" style={{ fontSize: 13 }}>
            <Row label="User ID" value={String(user.id)} />
            <Row label="Created" value={dayjs(user.createdAt).format("DD MMM YYYY")} />
            <Row label="Last Login" value={user.lastLoginAt ? dayjs(user.lastLoginAt).format("DD MMM YYYY, HH:mm") : "Never"} />
            <Row label="Must Change Password" value={user.mustChangePassword ? "Yes (pending first login)" : "No"} />
          </dl>
        </div>
      </div>

      <div className="card">
        <h3 className="mt-0">Linked Devices</h3>
        {devices?.length ? (
          <table className="data-table">
            <thead><tr><th>Asset</th><th>Hostname</th><th>MAC Address</th><th>OS</th><th>Last Seen</th></tr></thead>
            <tbody>
              {devices.map((a: any) => (
                <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/assets/${a.id}`)}>
                  <td>{a.assetTag} — {a.name}</td>
                  <td>{a.device?.hostname ?? "—"}</td>
                  <td style={{ fontFamily: "monospace" }}>{a.device?.macAddress ?? "—"}</td>
                  <td>{a.device?.os ?? "—"}</td>
                  <td className="muted">{a.device ? dayjs(a.device.lastSeen).format("DD MMM, HH:mm") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">No assets/devices assigned to this user.</div>
        )}
      </div>

      <div className="card">
        <h3 className="mt-0">Recent Activity</h3>
        {activity?.items?.length ? (
          <div className="stack gap-2">
            {activity.items.map((a: any) => (
              <div key={a.id} className="row gap-2" style={{ fontSize: 13, borderBottom: "1px solid var(--color-border)", paddingBottom: 8 }}>
                <span className="muted" style={{ minWidth: 130 }}>{dayjs(a.createdAt).format("DD MMM, HH:mm")}</span>
                <span>{a.action}{a.entityType ? ` · ${a.entityType}` : ""}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">No activity recorded yet.</div>
        )}
      </div>

      {tempPasswordInfo && (
        <FormModal title="Temporary Password" onClose={() => setTempPasswordInfo(null)} hideFooter>
          <p>Share this temporary password with <strong>{user.email}</strong> securely. They will be required to change it on next login.</p>
          <div className="card" style={{ fontFamily: "monospace", fontSize: 16, textAlign: "center", background: "var(--color-bg)" }}>
            {tempPasswordInfo}
          </div>
          <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => setTempPasswordInfo(null)}>Done</button>
        </FormModal>
      )}

      {showQr && (
        <QrCodeModal
          title="User QR Code"
          value={`${window.location.origin}/admin/users/${user.id}`}
          label={`${user.firstName} ${user.lastName}`}
          subLabel={user.email}
          onClose={() => setShowQr(false)}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--color-border)", paddingBottom: 6 }}>
      <span className="muted">{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}
