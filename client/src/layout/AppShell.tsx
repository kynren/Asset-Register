import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { TopNavBar } from "./TopNavBar";
import { FloatingAssistant } from "./FloatingAssistant";
import { ChangelogModal } from "./ChangelogModal";
import { ThemeSync } from "../theme/ThemeSync";
import { useAuth } from "../auth/AuthContext";
import { settingsNav, systemConsoleNav } from "./navConfig";

const allNav = [...systemConsoleNav, ...settingsNav];

function titleForPath(pathname: string) {
  const exact = allNav.find((n) => n.path === pathname);
  if (exact) return exact.label;
  const prefixMatch = allNav
    .filter((n) => n.path !== "/" && pathname.startsWith(n.path))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return prefixMatch?.label ?? "Kynren Asset Register";
}

export function AppShell() {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { activeTheme } = useAuth();
  const useTopNav = activeTheme?.navPosition === "topbar";

  // A route change always means the user picked a destination — close the drawer so the next
  // page isn't hidden behind it on a phone-width viewport.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className={`app-shell${mobileNavOpen ? " mobile-nav-open" : ""}`}>
      <ThemeSync />
      {!useTopNav && <Sidebar pageTitle={titleForPath(location.pathname)} />}
      {mobileNavOpen && <div className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)} />}
      <div className="main-area">
        <Topbar onToggleMobileNav={() => setMobileNavOpen((v) => !v)} />
        {useTopNav && <TopNavBar />}
        <div className="page-content">
          <Outlet />
        </div>
      </div>
      <FloatingAssistant />
      <ChangelogModal />
    </div>
  );
}
