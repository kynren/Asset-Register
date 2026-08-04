import { NavLink } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { useAuth } from "../../auth/AuthContext";
import { ModuleName } from "../../lib/permissions";

export const CONTROLS_MODULES: { label: string; path: string; icon: string; module: ModuleName }[] = [
  { label: "NVRs & Cameras", path: "/nvr", icon: "nvr", module: "nvr" },
  { label: "Access Control", path: "/access-control", icon: "key", module: "access-control" },
  { label: "Lighting", path: "/lighting", icon: "bulb", module: "lighting" },
  { label: "Gates", path: "/gates", icon: "door", module: "gates" },
];

// Cross-links between the three Controls sub-pages, shown at the top of each one so a user
// working in, say, Lighting can jump straight to Access Control without going back through the
// sidebar — RBAC-filtered the same as the sidebar and the /controls landing page.
export function ControlsSubNav() {
  const { hasPermission } = useAuth();
  const items = CONTROLS_MODULES.filter((m) => hasPermission(m.module, "view"));
  if (items.length === 0) return null;

  return (
    <div className="row gap-2 flex-wrap" style={{ marginBottom: 10 }}>
      <NavLink to="/controls" className="btn btn-secondary btn-sm btn-icon" title="Back to Controls">
        <Icon name="sliders" size={13} />
      </NavLink>
      {items.map((m) => (
        <NavLink key={m.path} to={m.path} className={({ isActive }) => `btn btn-sm ${isActive ? "btn-primary" : "btn-secondary"}`}>
          <Icon name={m.icon} size={13} /> {m.label}
        </NavLink>
      ))}
    </div>
  );
}
