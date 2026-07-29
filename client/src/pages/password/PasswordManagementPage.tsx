import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { VaultTab } from "./VaultTab";
import { MfaCard } from "./MfaCard";
import { SessionsCard } from "./SessionsCard";

function AccountSecurityTab() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: () => axiosClient.post("/auth/change-password", { currentPassword, newPassword }),
    onSuccess: () => {
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: any) => setError(err.response?.data?.error || "Could not change password."),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword.length < 10) {
      setError("New password must be at least 10 characters.");
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="card" style={{ maxWidth: 460 }}>
      <h3 className="mt-0">Account Password</h3>
      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">Password changed successfully.</div>}
      <form onSubmit={handleSubmit}>
        <div className="field"><label>Current Password</label><input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></div>
        <div className="field"><label>New Password</label><input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></div>
        <div className="field"><label>Confirm New Password</label><input className="input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></div>
        <button className="btn btn-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : "Change Password"}</button>
      </form>
    </div>
  );
}

function AccountSecuritySection() {
  return (
    <div className="stack gap-3">
      <AccountSecurityTab />
      <MfaCard />
      <SessionsCard />
    </div>
  );
}

const TABS = [
  { key: "vault", label: "Password Vault" },
  { key: "account", label: "Account Security" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function PasswordManagementPage() {
  const [tab, setTab] = useState<TabKey>("vault");

  return (
    <div className="stack gap-3">
      <div className="page-header">
        <div>
          <h1 className="page-title">Password Management</h1>
          <p className="page-subtitle">Your personal password vault and account security.</p>
        </div>
      </div>

      <div className="row gap-2">
        {TABS.map((t) => (
          <button key={t.key} className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "vault" ? <VaultTab /> : <AccountSecuritySection />}
    </div>
  );
}
