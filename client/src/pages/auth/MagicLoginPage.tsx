import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useBranding } from "../../theme/BrandingContext";

export function MagicLoginPage() {
  const { token } = useParams();
  const branding = useBranding();
  const navigate = useNavigate();
  const { magicLogin } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current || !token) return;
    attempted.current = true;
    magicLogin(token)
      .then(() => navigate("/", { replace: true }))
      .catch((err: any) => setError(err.response?.data?.error || "This login link is invalid or has expired."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="row" style={{ minHeight: "100vh", justifyContent: "center", alignItems: "center", background: "var(--color-bg)" }}>
      <div className="card stack" style={{ width: 380, alignItems: "center", textAlign: "center" }}>
        <div className="sidebar-brand-mark" style={{ width: 44, height: 44, borderRadius: 12, fontSize: 18, overflow: "hidden" }}>
          {branding.appIconUrl ? <img src={branding.appIconUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : branding.companyName[0]}
        </div>

        {error ? (
          <>
            <div className="alert alert-danger" style={{ marginTop: 14, width: "100%" }}>{error}</div>
            <Link to="/login" className="btn btn-primary" style={{ marginTop: 4 }}>Go to Sign In</Link>
          </>
        ) : (
          <>
            <h2 style={{ margin: "14px 0 4px" }}>Signing you in...</h2>
            <p className="muted" style={{ fontSize: 13 }}>Verifying your login link.</p>
          </>
        )}
      </div>
    </div>
  );
}
