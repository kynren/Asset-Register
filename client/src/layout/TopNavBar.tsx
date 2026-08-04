import { useEffect, useRef, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { Icon } from "../components/Icon";
import { AnimatedBatteryIcon } from "../components/AnimatedBatteryIcon";
import { useAuth } from "../auth/AuthContext";
import { useBranding } from "../theme/BrandingContext";
import { useBattery } from "../hooks/useBattery";
import { NavItem, controlsNavGroup, settingsNav, systemConsoleNav } from "./navConfig";

function TopNavDropdown({ label, icon, items }: { label: string; icon: NavItem["icon"]; items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const hasActive = items.some((item) => (item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path)));

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  if (items.length === 0) return null;

  return (
    <div className="top-nav-dropdown" ref={ref}>
      <button
        type="button"
        className={`top-nav-dropdown-trigger${open ? " open" : ""}${hasActive ? " has-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={icon} size={15} />
        <span>{label}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <div className="top-nav-dropdown-menu">
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) => `top-nav-dropdown-item${isActive ? " active" : ""}`}
            >
              <Icon name={item.icon} size={15} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

// Alternative to the left Sidebar — a horizontal bar directly under the header, used when the
// signed-in user's active AppearanceTheme has navPosition "topbar" (see Profile > Appearance and
// AuthContext.tsx's activeTheme). Since the Sidebar (which normally carries the brand mark and
// battery indicator) is hidden entirely in this layout, this bar carries its own logo and battery
// so neither disappears just because navPosition changed. Controls' sub-pages are folded into the
// System Console dropdown at the same spot the sidebar splices its collapsible group.
export function TopNavBar() {
  const { hasPermission } = useAuth();
  const branding = useBranding();
  const { supported, state } = useBattery();

  const visibleConsole = systemConsoleNav.filter((item) => !item.module || hasPermission(item.module, "view"));
  const visibleSettings = settingsNav.filter((item) => !item.module || hasPermission(item.module, "view"));
  const visibleControls = controlsNavGroup.children.filter((item) => !item.module || hasPermission(item.module, "view"));

  const docsIndex = visibleConsole.findIndex((item) => item.path === "/docs");
  const consoleBeforeControls = docsIndex === -1 ? visibleConsole : visibleConsole.slice(0, docsIndex);
  const consoleAfterControls = docsIndex === -1 ? [] : visibleConsole.slice(docsIndex);
  const consoleItems = [...consoleBeforeControls, ...visibleControls, ...consoleAfterControls];

  const levelPct = state ? Math.round(state.level * 100) : null;

  return (
    <nav className="top-nav-bar">
      <Link to="/" className="top-nav-brand" title="Go to homepage">
        <div className="top-nav-brand-mark">
          {branding.appIconUrl ? (
            <img src={branding.appIconUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            branding.companyName[0]
          )}
        </div>
        <span>{branding.companyName}</span>
      </Link>

      <div className="top-nav-groups">
        <TopNavDropdown label="System Console" icon="grid" items={consoleItems} />
        {visibleSettings.length > 0 && <span className="top-nav-divider" />}
        <TopNavDropdown label="Settings" icon="settings" items={visibleSettings} />
      </div>

      {supported === true && state && levelPct !== null ? (
        <div className="top-nav-battery" title={`Client battery: ${levelPct}%${state.charging ? " (charging)" : ""}`}>
          <AnimatedBatteryIcon level={levelPct} charging={state.charging} size={24} />
          <span>{levelPct}%</span>
        </div>
      ) : (
        <span />
      )}
    </nav>
  );
}
