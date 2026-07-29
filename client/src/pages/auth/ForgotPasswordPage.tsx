import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { axiosClient } from "../../api/axiosClient";
import { useBranding } from "../../theme/BrandingContext";

export function ForgotPasswordPage() {
  const branding = useBranding();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await axiosClient.post("/auth/forgot-password", { email });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.error || "Something went wrong. Please try again.");
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
          <h2 style={{ margin: "10px 0 0" }}>Reset Password</h2>
          <p className="muted mt-0">We'll send you a link to reset your password.</p>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {submitted ? (
          <div className="alert alert-success">If that email is registered, a reset link has been sent. Check your inbox.</div>
        ) : (
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
        )}

        {!submitted && (
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        )}

        <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
          <Link to="/login" className="muted" style={{ fontSize: 12 }}>Back to sign in</Link>
        </div>
      </form>
    </div>
  );
}
