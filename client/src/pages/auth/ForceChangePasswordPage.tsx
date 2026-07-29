import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";

export function ForceChangePasswordPage() {
  const { refreshSession, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword.length < 10) {
      setError("New password must be at least 10 characters.");
      return;
    }
    setLoading(true);
    try {
      await axiosClient.post("/auth/change-password", { currentPassword, newPassword });
      await refreshSession();
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not change password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="row" style={{ minHeight: "100vh", justifyContent: "center", alignItems: "center", background: "var(--color-bg)" }}>
      <form className="card stack" style={{ width: 400 }} onSubmit={handleSubmit}>
        <h2 className="mt-0">Set a new password</h2>
        <p className="muted">For security, you must set a personal password before continuing.</p>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="field">
          <label>Current (temporary) password</label>
          <input className="input" type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div className="field">
          <label>New password</label>
          <input className="input" type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div className="field">
          <label>Confirm new password</label>
          <input className="input" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
          <button type="button" className="btn btn-secondary" onClick={() => logout()}>Log out</button>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save and continue"}
          </button>
        </div>
      </form>
    </div>
  );
}
