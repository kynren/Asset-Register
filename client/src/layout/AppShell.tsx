import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { FloatingAssistant } from "./FloatingAssistant";
import { ThemeSync } from "../theme/ThemeSync";
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

  return (
    <div className="app-shell">
      <ThemeSync />
      <Sidebar pageTitle={titleForPath(location.pathname)} />
      <div className="main-area">
        <Topbar />
        <div className="page-content">
          <Outlet />
        </div>
      </div>
      <FloatingAssistant />
    </div>
  );
}
