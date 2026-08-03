import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { useBranding } from "../../theme/BrandingContext";
import { Icon } from "../../components/Icon";
import { LoginFormCard } from "./LoginFormCard";
import { loginBackgroundCss } from "../appSettings/loginDesignTypes";

export function LoginPage() {
  const { user } = useAuth();
  const location = useLocation();
  const branding = useBranding();
  const { background, layout, blocks } = branding.loginDesign;

  if (user) {
    const from = (location.state as { from?: Location })?.from?.pathname || "/";
    return <Navigate to={from} replace />;
  }

  const isSplit = layout.preset !== "CENTERED";
  const flexDirection: "row" | "column" = layout.preset === "SPLIT_HORIZONTAL" ? "column" : "row";
  const formFirst = layout.formSide !== "end";
  const cssBackground = background.type === "image" || background.type === "video" ? "var(--color-bg)" : loginBackgroundCss(background);

  return (
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden", background: cssBackground }}>
      {background.type === "image" && background.url && (
        <img src={background.url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      {background.type === "video" && background.url && (
        <video src={background.url} autoPlay muted loop style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      )}

      <div style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection, alignItems: "center", justifyContent: isSplit ? "space-around" : "center", flexWrap: "wrap" }}>
        {formFirst && <LoginFormCard />}
        {isSplit && <div style={{ flex: 1 }} />}
        {!formFirst && <LoginFormCard />}
      </div>

      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {blocks.map((b) => (
          <div key={b.id} style={{ position: "absolute", left: `${b.x}%`, top: `${b.y}%`, transform: "translate(-50%, -50%)" }}>
            {b.type === "text" && <span style={{ fontSize: b.fontSize ?? 16, color: b.color ?? "#fff", fontWeight: b.fontWeight ?? "normal", whiteSpace: "nowrap" }}>{b.text}</span>}
            {b.type === "icon" && <Icon name={b.icon} size={b.size ?? 32} />}
            {b.type === "image" && <img src={b.url} alt="" style={{ width: b.width ?? 120, display: "block" }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
