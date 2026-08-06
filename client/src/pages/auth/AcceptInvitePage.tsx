import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { useBranding } from "../../theme/BrandingContext";
import { PasswordInput } from "../../components/PasswordInput";

interface InviteDetails {
  email: string;
  firstName: string;
  lastName: string;
  organizationName: string | null;
}

export function AcceptInvitePage() {
  const { token } = useParams();
  const branding = useBranding();
  const navigate = useNavigate();
  const { acceptInvite } = useAuth();

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axiosClient
      .get(`/auth/invite/${token}`)
      .then((res) => setInvite(res.data))
      .catch((err) => setLoadError(err.response?.data?.error || "This invite link is invalid or has expired."));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await acceptInvite(token!, password);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "This invite link is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="row" style={{ minHeight: "100vh", justifyContent: "center", alignItems: "center", background: "var(--color-bg)" }}>
      <form className="card stack" style={{ width: 400 }} onSubmit={handleSubmit}>
        <div className="stack gap-1" style={{ marginBottom: 18, alignItems: "center" }}>
          <div className="sidebar-brand-mark" style={{ width: 44, height: 44, borderRadius: 12, fontSize: 18, overflow: "hidden" }}>
            {branding.appIconUrl ? <img src={branding.appIconUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : branding.companyName[0]}
          </div>
          <h2 style={{ margin: "10px 0 0" }}>Set Up Your Account</h2>
          {invite && (
            <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>
              {invite.firstName} {invite.lastName} · {invite.email}
              {invite.organizationName ? <> · {invite.organizationName}</> : null}
            </p>
          )}
        </div>

        {loadError && <div className="alert alert-danger">{loadError}</div>}
        {error && <div className="alert alert-danger">{error}</div>}

        {!loadError && invite && (
          <>
            <div className="field">
              <label>Password</label>
              <PasswordInput required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>Confirm Password</label>
              <PasswordInput required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? "Setting up..." : "Create Account"}
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
