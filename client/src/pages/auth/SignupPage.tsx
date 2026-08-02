import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useBranding } from "../../theme/BrandingContext";
import { PasswordInput } from "../../components/PasswordInput";

export function SignupPage() {
  const { user, signupOrganization } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();
  const [organizationName, setOrganizationName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signupOrganization({ organizationName, firstName, lastName, email, password });
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Could not create your organization. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="row" style={{ minHeight: "100vh", justifyContent: "center", alignItems: "center", background: "var(--color-bg)" }}>
      <form className="card stack" style={{ width: 420 }} onSubmit={handleSubmit}>
        <div className="stack gap-1" style={{ marginBottom: 18, alignItems: "center" }}>
          <div className="sidebar-brand-mark" style={{ width: 44, height: 44, borderRadius: 12, fontSize: 18, overflow: "hidden" }}>
            {branding.appIconUrl ? <img src={branding.appIconUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : branding.companyName[0]}
          </div>
          <h2 style={{ margin: "10px 0 0" }}>Create your organization</h2>
          <p className="muted mt-0">Set up a new, isolated workspace in {branding.companyName}.</p>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="field">
          <label>Organization Name</label>
          <input className="input" required minLength={2} maxLength={100} value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} autoFocus />
        </div>

        <div className="row" style={{ gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>First Name</label>
            <input className="input" required maxLength={60} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Last Name</label>
            <input className="input" required maxLength={60} value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>Email</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="field">
          <label>Password</label>
          <PasswordInput required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
          {loading ? "Creating organization..." : "Create Organization"}
        </button>

        <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            Already have an account? <Link to="/login">Sign in</Link>
          </span>
        </div>
      </form>
    </div>
  );
}
