import { KeyboardEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { usePermission } from "../auth/PermissionGate";
import { useTheme } from "../theme/ThemeContext";
import { useBranding } from "../theme/BrandingContext";
import { axiosClient } from "../api/axiosClient";
import { Icon } from "../components/Icon";
import { NotificationBell } from "./NotificationBell";
import { ClientInfoModal } from "./ClientInfoModal";
import { useClientInfo } from "../hooks/useClientInfo";

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function useLatency() {
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function measure() {
      const start = performance.now();
      try {
        await axiosClient.get("/health");
        if (!cancelled) setLatency(Math.round(performance.now() - start));
      } catch {
        if (!cancelled) setLatency(null);
      }
    }

    measure();
    const interval = setInterval(measure, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return latency;
}

export function Topbar({ title }: { title: string }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const branding = useBranding();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [showClientInfo, setShowClientInfo] = useState(false);
  const navigate = useNavigate();
  const canAdmin = usePermission("admin", "view");
  const latency = useLatency();

  const { data: clientInfo } = useClientInfo();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && search.trim()) {
      navigate(`/assets?search=${encodeURIComponent(search.trim())}`);
    }
  }

  async function handleExportBriefing() {
    setExporting(true);
    try {
      const res = await axiosClient.get("/dashboard/briefing", { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "operations-briefing.pdf";
      a.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="topbar-brand-icon">
          {branding.appIconUrl ? <img src={branding.appIconUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} /> : <Icon name="cpu" size={18} />}
        </div>
        <div>
          <div className="topbar-brand-name">
            {branding.companyName}
            <span className="topbar-brand-badge">TECH OPS</span>
          </div>
          <div className="topbar-brand-tagline">{title.toUpperCase()}</div>
        </div>
      </div>

      <div className="topbar-search">
        <Icon name="search" size={14} />
        <input
          placeholder="Search assets, tickets, knowledge..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
      </div>

      <div className="topbar-actions">
        <div className="topbar-stat" style={{ cursor: "pointer" }} title="Click for full client machine details" onClick={() => setShowClientInfo(true)}>
          <span className="topbar-stat-dot" />
          <Icon name="cpu" size={13} />
          Node IP: <span>{clientInfo?.observedIp ?? "—"}</span>
        </div>
        <div className="topbar-stat topbar-stat-cyan" title="Round-trip time to the API">
          <Icon name="activity" size={13} />
          Latency: <span>{latency !== null ? `${latency}ms` : "—"}</span>
        </div>

        <NotificationBell />

        <button className="topbar-pill" onClick={toggleTheme}>
          <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
          {theme === "dark" ? "DAY MODE" : "NIGHT MODE"}
        </button>

        <button className="topbar-pill topbar-pill-primary" onClick={handleExportBriefing} disabled={exporting}>
          <Icon name="fileText" size={14} />
          {exporting ? "Exporting..." : "Export Briefing"}
        </button>

        <button className="topbar-icon-btn" onClick={() => navigate("/assistant")} title="Virtual Assistant console">
          <Icon name="terminal" size={16} />
        </button>

        <button className="topbar-icon-btn" onClick={() => navigate(canAdmin ? "/admin" : "/profile")} title="Settings">
          <Icon name="settings" size={16} />
        </button>

        <div style={{ position: "relative" }}>
          <div className="topbar-user" onClick={() => setMenuOpen((o) => !o)}>
            <div className="topbar-avatar">
              {user?.avatarUrl ? <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : user ? initials(user.firstName, user.lastName) : "?"}
            </div>
            <div>
              <div className="topbar-user-name">{user?.firstName} {user?.lastName}</div>
              <div className="topbar-user-role">{user?.roleName?.toUpperCase()}</div>
            </div>
          </div>
          {menuOpen && (
            <div className="user-menu" onMouseLeave={() => setMenuOpen(false)}>
              <div className="user-menu-header">
                <div className="name">{user?.firstName} {user?.lastName}</div>
                <div className="role">{user?.roleName}</div>
              </div>
              <div className="user-menu-item" onClick={() => { setMenuOpen(false); navigate("/profile"); }}>
                <Icon name="profile" size={15} /> Profile
              </div>
              <div className="user-menu-item" onClick={() => { setMenuOpen(false); navigate("/password"); }}>
                <Icon name="password" size={15} /> Password
              </div>
              <div className="user-menu-item" onClick={handleLogout}>
                <Icon name="logout" size={15} /> Logout
              </div>
            </div>
          )}
        </div>

        <button className="topbar-icon-btn" onClick={handleLogout} title="Log out">
          <Icon name="logout" size={16} />
        </button>
      </div>

      {showClientInfo && <ClientInfoModal onClose={() => setShowClientInfo(false)} />}
    </header>
  );
}
