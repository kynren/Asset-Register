import { FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { axiosClient } from "../../api/axiosClient";
import { useBranding } from "../../theme/BrandingContext";
import { PasswordInput } from "../../components/PasswordInput";

export function ResetPasswordPage() {
  const { token } = useParams();
  const branding = useBranding();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await axiosClient.post("/auth/reset-password", { token, newPassword });
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || "This reset link is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="row" style={{ minHeight: "100vh", justifyContent: "center", alignItems: "center", background: "var(--color-bg)" }}>
      <form className="card stack" style={{ width: 380 }} onSubmit={handleSubmit}>
        <div className="stack gap-1" style={{ marginBottom: 18, alignItems: "center" }}>
          <div className="sidebar-brand-mark" style={{ width: 44, height: 44, borderRadius: 12, fontSize: 18, overflow: "hidden" }}>
            {branding.appIconUrl ? <img src={branding.appIconUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : branding.companyName[0]}
          </div>
          <h2 style={{ margin: "10px 0 0" }}>Choose a New Password</h2>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {done ? (
          <div className="alert alert-success">Your password has been reset. Redirecting to sign in...</div>
        ) : (
          <>
            <div className="field">
              <label>New Password</label>
              <PasswordInput required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>Confirm New Password</label>
              <PasswordInput required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </>
        )}

        <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
          <Link to="/login" className="muted" style={{ fontSize: 12 }}>Back to sign in</Link>
        </div>
      </form>
    </div>
  );
}
