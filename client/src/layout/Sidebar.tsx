import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { Icon } from "../components/Icon";
import { useAuth } from "../auth/AuthContext";
import { useBranding } from "../theme/BrandingContext";
import { NavItem, settingsNav, systemConsoleNav } from "./navConfig";

function readCollapsed() {
  return localStorage.getItem("sidebar:collapsed") === "true";
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      className={({ isActive }) =>
        `sidebar-link${isActive ? " active" : ""}`
      }
      title={collapsed ? item.label : undefined}
    >
      <Icon name={item.icon} size={18} />
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { hasPermission } = useAuth();
  const branding = useBranding();

  useEffect(() => {
    localStorage.setItem("sidebar:collapsed", String(collapsed));
  }, [collapsed]);

  const visibleConsole = systemConsoleNav.filter((item) => !item.module || hasPermission(item.module, "view"));
  const visibleSettings = settingsNav.filter((item) => !item.module || hasPermission(item.module, "view"));

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">
          {branding.appIconUrl ? <img src={branding.appIconUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} /> : branding.companyName[0]}
        </div>
        {!collapsed && <span>{branding.companyName}</span>}
      </div>

      <nav className="sidebar-nav">
        {!collapsed && <div className="sidebar-section-label">System Console</div>}
        {visibleConsole.map((item) => (
          <SidebarLink key={item.path} item={item} collapsed={collapsed} />
        ))}

        {!collapsed && <div className="sidebar-section-label">Settings</div>}
        {visibleSettings.map((item) => (
          <SidebarLink key={item.path} item={item} collapsed={collapsed} />
        ))}
      </nav>

      <button className="sidebar-collapse-btn" onClick={() => setCollapsed((c) => !c)}>
        <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={16} />
        {!collapsed && <span>Collapse</span>}
      </button>
    </aside>
  );
}
