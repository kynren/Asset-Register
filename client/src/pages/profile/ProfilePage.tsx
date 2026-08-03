import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { AvatarGallery } from "./AvatarGallery";
import { ColorPaletteCard } from "./ColorPaletteCard";
import { PasswordInput } from "../../components/PasswordInput";
import { McpConnectionCard } from "./McpConnectionCard";
import { MfaCard } from "../password/MfaCard";
import { PinCard } from "../password/PinCard";
import { SessionsCard } from "../password/SessionsCard";
import { NotificationsTab } from "./NotificationsTab";
import { ContactEmailsCard } from "./ContactEmailsCard";
import { AuthorizedSubstitutesCard } from "./AuthorizedSubstitutesCard";

const TABS = [
  { key: "general", label: "General" },
  { key: "account", label: "Account" },
  { key: "notifications", label: "Notifications" },
  { key: "settings", label: "Settings" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function PasswordChangeCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: () => axiosClient.post("/auth/change-password", { currentPassword, newPassword }),
    onSuccess: () => { setSuccess(true); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); },
    onError: (err: any) => setError(err.response?.data?.error || "Could not change password."),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) return setError("New password and confirmation do not match.");
    if (newPassword.length < 10) return setError("New password must be at least 10 characters.");
    mutation.mutate();
  }

  return (
    <div className="card">
      <h3 className="mt-0">Change Password</h3>
      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">Password changed successfully.</div>}
      <form onSubmit={handleSubmit}>
        <div className="field"><label>Current Password</label><PasswordInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></div>
        <div className="grid grid-cols-2">
          <div className="field"><label>New Password</label><PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></div>
          <div className="field"><label>Confirm Password</label><PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></div>
        </div>
        <button className="btn btn-primary btn-sm" type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : "Update Password"}</button>
      </form>
    </div>
  );
}

export function ProfilePage() {
  const { user, refreshSession } = useAuth();
  const [tab, setTab] = useState<TabKey>("general");
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [saved, setSaved] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: { firstName?: string; lastName?: string; avatarUrl?: string; accentColor?: string | null }) => axiosClient.patch("/profile", data),
    onSuccess: async () => {
      await refreshSession();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const { data: activity } = useQuery({
    queryKey: ["my-activity"],
    queryFn: async () => (await axiosClient.get("/profile/activity", { params: { pageSize: 5 } })).data,
  });

  const { data: devices } = useQuery({
    queryKey: ["my-devices"],
    queryFn: async () => (await axiosClient.get("/profile/devices")).data,
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    updateMutation.mutate({ firstName, lastName });
  }

  if (!user) return null;

  return (
    <div className="stack gap-3">
      <div className="page-header-sticky">
        <div className="page-header-content">
          <div>
            <h1 className="page-title">Profile</h1>
            <p className="page-subtitle">Manage your personal information, appearance, notifications, and devices.</p>
          </div>
        </div>

        <div className="row gap-2 flex-wrap">
          {TABS.map((t) => (
            <button key={t.key} className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card row gap-3" style={{ alignItems: "center" }}>
        <div className="avatar" style={{ width: 64, height: 64, fontSize: 22, overflow: "hidden" }}>
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(user.firstName, user.lastName)}
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{user.firstName} {user.lastName}</div>
          <div className="muted">{user.email} · {user.roleName}</div>
        </div>
      </div>

      {tab === "general" && (
        <div className="grid grid-cols-2">
          <div className="card">
            <h3 className="mt-0">Profile Photo</h3>
            <AvatarGallery currentAvatarUrl={user.avatarUrl} onSelect={(url) => updateMutation.mutate({ avatarUrl: url })} />
          </div>
          <div className="card">
            <h3 className="mt-0">Accent Color</h3>
            <ColorPaletteCard selected={user.accentColor} onSelect={(color) => updateMutation.mutate({ accentColor: color })} />
          </div>
        </div>
      )}

      {tab === "account" && (
        <div className="card" style={{ maxWidth: 480 }}>
          <h3 className="mt-0">Your Details</h3>
          {saved && <div className="alert alert-success">Profile updated.</div>}
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2">
              <div className="field"><label>First Name</label><input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
              <div className="field"><label>Last Name</label><input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
            </div>
            <div className="field"><label>Email</label><input className="input" value={user.email} disabled /></div>
            <div className="field"><label>Role</label><input className="input" value={user.roleName} disabled /></div>
            <button className="btn btn-primary" type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? "Saving..." : "Save Changes"}</button>
          </form>
        </div>
      )}

      {tab === "notifications" && <NotificationsTab />}

      {tab === "settings" && (
        <div className="stack gap-3">
          <PasswordChangeCard />

          <div className="grid grid-cols-2">
            <PinCard />
            <MfaCard />
          </div>

          <SessionsCard />

          <McpConnectionCard />

          <ContactEmailsCard />

          <AuthorizedSubstitutesCard />

          <div className="card">
            <h3 className="mt-0">My Devices</h3>
            {devices?.length ? (
              <table className="data-table">
                <thead><tr><th>Asset</th><th>Hostname</th><th>MAC Address</th><th>OS</th><th>Last Seen</th></tr></thead>
                <tbody>
                  {devices.map((a: any) => (
                    <tr key={a.id}>
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
              <div className="empty-state">No assets or devices are linked to your account yet.</div>
            )}
          </div>

          <div className="card">
            <h3 className="mt-0">My Activity</h3>
            {!activity?.items?.length && <div className="empty-state">No activity recorded yet.</div>}
            <div className="stack gap-2">
              {activity?.items?.map((a: any) => (
                <div key={a.id} className="row gap-2" style={{ fontSize: 13, borderBottom: "1px solid var(--color-border)", paddingBottom: 8 }}>
                  <span className="muted" style={{ minWidth: 120 }}>{dayjs(a.createdAt).format("DD MMM, HH:mm")}</span>
                  <span>{a.action}</span>
                </div>
              ))}
            </div>
            {activity && activity.totalPages > 1 && <p className="muted" style={{ fontSize: 12 }}>Showing page {activity.page} of {activity.totalPages}.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
