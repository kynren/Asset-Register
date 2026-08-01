import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { Icon } from "../components/Icon";
import { useAuth } from "../auth/AuthContext";
import { useBranding } from "../theme/BrandingContext";
import { useBattery } from "../hooks/useBattery";
import { useClientInfo } from "../hooks/useClientInfo";
import { useUserPreference } from "../hooks/useUserPreference";
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

function SidebarBattery({ collapsed }: { collapsed: boolean }) {
  const { supported, state } = useBattery();
  if (supported !== true || !state) return null;

  const levelPct = Math.round(state.level * 100);
  const color = levelPct <= 20 ? "var(--color-danger)" : levelPct <= 50 ? "var(--color-warning)" : "var(--color-success)";
  const label = `Client battery: ${levelPct}%${state.charging ? " (charging)" : ""}`;

  if (collapsed) {
    return (
      <div className="sidebar-battery sidebar-battery-collapsed" title={label}>
        <Icon name={state.charging ? "power" : "battery"} size={16} />
      </div>
    );
  }

  return (
    <div className="sidebar-battery" title={label}>
      <Icon name={state.charging ? "power" : "battery"} size={15} />
      <div className="sidebar-battery-bar">
        <div className="sidebar-battery-bar-fill" style={{ width: `${levelPct}%`, background: color }} />
      </div>
      <span className="sidebar-battery-pct">{levelPct}%</span>
    </div>
  );
}

// Ticks a local clock anchored to the server's clock rather than the browser's — offset is
// recomputed on every client-info poll (every 3s) so drift never accumulates, but the displayed
// time itself updates every second locally so it doesn't wait on the next poll to move.
function SidebarClock({ collapsed }: { collapsed: boolean }) {
  const { data } = useClientInfo();
  const [now, setNow] = useState(() => new Date());

  const offsetMs = useMemo(() => (data ? new Date(data.serverTime).getTime() - Date.now() : null), [data]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (offsetMs === null) return null;

  const serverNow = new Date(now.getTime() + offsetMs);
  const time = serverNow.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = serverNow.toLocaleDateString([], { day: "2-digit", month: "short" });

  if (collapsed) {
    return (
      <div className="sidebar-battery sidebar-battery-collapsed" title={`Server time: ${serverNow.toLocaleString()}`}>
        <Icon name="clock" size={16} />
      </div>
    );
  }

  return (
    <div className="sidebar-battery" title={`Server time: ${serverNow.toLocaleString()}`}>
      <Icon name="clock" size={15} />
      <span className="sidebar-battery-pct" style={{ fontVariantNumeric: "tabular-nums" }}>{time}</span>
      <span className="muted" style={{ fontSize: 11 }}>{date}</span>
    </div>
  );
}

export function Sidebar({ pageTitle }: { pageTitle: string }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { hasPermission } = useAuth();
  const branding = useBranding();

  // localStorage gives an instant, flicker-free initial value; the server preference makes the
  // choice follow the account onto a fresh browser/device instead of always starting expanded.
  const { value: savedCollapsed, setValue: saveCollapsed, isLoading: collapsedLoading } = useUserPreference<boolean | null>("sidebar.collapsed", null);
  const [collapsedHydrated, setCollapsedHydrated] = useState(false);

  useEffect(() => {
    localStorage.setItem("sidebar:collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (collapsedLoading || collapsedHydrated) return;
    if (savedCollapsed !== null && savedCollapsed !== undefined) setCollapsed(savedCollapsed);
    setCollapsedHydrated(true);
  }, [collapsedLoading, collapsedHydrated, savedCollapsed]);

  useEffect(() => {
    if (!collapsedHydrated) return;
    saveCollapsed(collapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, collapsedHydrated]);

  const visibleConsole = systemConsoleNav.filter((item) => !item.module || hasPermission(item.module, "view"));
  const visibleSettings = settingsNav.filter((item) => !item.module || hasPermission(item.module, "view"));

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-brand-block">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">
            {branding.appIconUrl ? <img src={branding.appIconUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} /> : branding.companyName[0]}
          </div>
          {!collapsed && <span>{branding.companyName}</span>}
        </div>
        {!collapsed && <div className="sidebar-page-title">{pageTitle.toUpperCase()}</div>}
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

      <SidebarBattery collapsed={collapsed} />
      <SidebarClock collapsed={collapsed} />

      <button className="sidebar-collapse-btn" title={collapsed ? "Expand" : "Collapse"} onClick={() => setCollapsed((c) => !c)}>
        <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={16} />
      </button>
    </aside>
  );
}
