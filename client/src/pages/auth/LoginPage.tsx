import { FormEvent, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useBranding } from "../../theme/BrandingContext";
import { PasswordInput } from "../../components/PasswordInput";

export function LoginPage() {
  const { user, login } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [usePin, setUsePin] = useState(false);
  const [mfaToken, setMfaToken] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) {
    const from = (location.state as { from?: Location })?.from?.pathname || "/";
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const credential = usePin ? { pin } : { password };
      const result = await login(email, credential, mfaRequired ? mfaToken : undefined);
      if (result.mfaRequired) {
        setMfaRequired(true);
      } else {
        navigate("/");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Login failed. Check your credentials.");
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
          <h2 style={{ margin: "10px 0 0" }}>{branding.companyName}</h2>
          <p className="muted mt-0">{mfaRequired ? "Enter your authentication code" : "Sign in to continue"}</p>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {!mfaRequired ? (
          <>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </div>
            {usePin ? (
              <div className="field">
                <label>PIN</label>
                <input
                  className="input"
                  inputMode="numeric"
                  required
                  maxLength={6}
                  placeholder="123456"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            ) : (
              <div className="field">
                <label>Password</label>
                <PasswordInput required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
            <div className="row" style={{ justifyContent: "space-between", marginTop: -8, marginBottom: 4 }}>
              <button
                type="button"
                className="muted"
                style={{ fontSize: 12, background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
                onClick={() => { setUsePin((v) => !v); setPassword(""); setPin(""); setError(null); }}
              >
                {usePin ? "Log in with password instead" : "Log in with PIN instead"}
              </button>
              {!usePin && <Link to="/forgot-password" className="muted" style={{ fontSize: 12 }}>Forgot password?</Link>}
            </div>
          </>
        ) : (
          <div className="field">
            <label>Authentication Code</label>
            <input
              className="input"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              placeholder="123456"
              value={mfaToken}
              onChange={(e) => setMfaToken(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        )}

        <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
          {loading ? "Signing in..." : mfaRequired ? "Verify" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
