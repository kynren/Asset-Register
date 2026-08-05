import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { usePermission } from "../auth/PermissionGate";
import { useTheme } from "../theme/ThemeContext";
import { axiosClient } from "../api/axiosClient";
import { Icon } from "../components/Icon";
import { NotificationBell } from "./NotificationBell";
import { ClientInfoModal } from "./ClientInfoModal";
import { useClientInfo } from "../hooks/useClientInfo";
import { OrgSwitchConfirmModal } from "../pages/appSettings/OrgSwitchConfirmModal";

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function openCommandPalette() {
  window.dispatchEvent(new Event("open-command-palette"));
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

interface OrganizationRow {
  id: number;
  name: string;
  schemaName: string;
}

export function Topbar({ onToggleMobileNav }: { onToggleMobileNav?: () => void }) {
  const { user, organization, logout, switchOrganization } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showClientInfo, setShowClientInfo] = useState(false);
  const navigate = useNavigate();
  const canAdmin = usePermission("admin", "view");
  const latency = useLatency();

  const { data: clientInfo } = useClientInfo();

  const isSystemAdmin = user?.roleName === "System Admin";
  const canExportBriefing = user?.roleName === "Super Admin" || user?.roleName === "System Admin";
  const { data: organizations } = useQuery({
    queryKey: ["app-settings-organizations-switcher"],
    queryFn: async () => (await axiosClient.get<OrganizationRow[]>("/app-settings/organizations")).data,
    enabled: isSystemAdmin && menuOpen,
  });
  const [switchingOrgId, setSwitchingOrgId] = useState<number | null>(null);
  const [pendingSwitchOrg, setPendingSwitchOrg] = useState<OrganizationRow | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  async function confirmSwitchOrganization(credential: { password: string } | { pin: string }, rememberMinutes: number | null) {
    if (!pendingSwitchOrg) return;
    setSwitchingOrgId(pendingSwitchOrg.id);
    setSwitchError(null);
    try {
      await switchOrganization(pendingSwitchOrg.id, credential, rememberMinutes);
      setPendingSwitchOrg(null);
      setMenuOpen(false);
      navigate("/");
    } catch (err: any) {
      setSwitchError(err.response?.data?.error ?? "Could not verify your credential.");
    } finally {
      setSwitchingOrgId(null);
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/login");
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
      <button className="topbar-hamburger-btn" onClick={onToggleMobileNav} title="Menu" aria-label="Toggle navigation menu">
        <Icon name="menu" size={18} />
      </button>
      <div className="topbar-search" style={{ cursor: "text" }} onClick={openCommandPalette}>
        <Icon name="search" size={14} />
        <input
          placeholder="Search assets, tickets, knowledge..."
          readOnly
          onFocus={(e) => { e.currentTarget.blur(); openCommandPalette(); }}
          onKeyDown={(e) => { if (e.key === "Enter") openCommandPalette(); }}
          style={{ cursor: "text" }}
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

        <button className="topbar-pill" onClick={toggleTheme} title={theme === "dark" ? "Switch to day mode" : "Switch to night mode"}>
          <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
          <span className="topbar-pill-label">{theme === "dark" ? "DAY MODE" : "NIGHT MODE"}</span>
        </button>

        {canExportBriefing && (
          <button className="topbar-pill topbar-pill-primary" onClick={handleExportBriefing} disabled={exporting} title="Export Briefing">
            <Icon name="fileText" size={14} />
            <span className="topbar-pill-label">{exporting ? "Exporting..." : "Export Briefing"}</span>
          </button>
        )}

        <button className="topbar-icon-btn" onClick={() => navigate("/assistant")} title="Virtual Assistant console">
          <Icon name="terminal" size={16} />
        </button>

        <button className="topbar-icon-btn" onClick={() => navigate(canAdmin ? "/admin" : "/profile")} title="Settings">
          <Icon name="settings" size={16} />
        </button>

        <div style={{ position: "relative" }}>
          <div className="topbar-user" onClick={() => setMenuOpen((o) => !o)} title={`${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()}>
            <div className="topbar-avatar">
              {user?.avatarUrl ? <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : user ? initials(user.firstName, user.lastName) : "?"}
            </div>
            <div className="topbar-user-info">
              <div className="topbar-user-name">{user?.firstName} {user?.lastName}</div>
              <div className="topbar-user-role">
                {user?.roleName?.toUpperCase()}
                {isSystemAdmin && organization && ` · ${organization.name}`}
              </div>
            </div>
            <span className="topbar-user-chevron"><Icon name="chevronDown" size={14} /></span>
          </div>
          {menuOpen && (
            <div className="user-menu" onMouseLeave={() => setMenuOpen(false)}>
              <div className="user-menu-header">
                <div className="name">{user?.firstName} {user?.lastName}</div>
                <div className="role">{user?.roleName}</div>
              </div>

              {isSystemAdmin && (
                <>
                  <div className="user-menu-header" style={{ padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--color-text-muted)" }}>
                    Switch Organization
                  </div>
                  <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    {(organizations ?? []).map((org) => {
                      const isActive = org.id === organization?.id;
                      return (
                        <div
                          key={org.id}
                          className="user-menu-item"
                          style={{ opacity: switchingOrgId !== null && !isActive ? 0.5 : 1, cursor: isActive ? "default" : "pointer" }}
                          onClick={() => { if (!isActive && switchingOrgId === null) { setPendingSwitchOrg(org); setMenuOpen(false); } }}
                        >
                          <Icon name={isActive ? "check" : "layers"} size={15} />
                          <span style={{ fontWeight: isActive ? 600 : 400 }}>{org.name}</span>
                        </div>
                      );
                    })}
                    {!organizations && <div className="user-menu-item muted" style={{ fontSize: 12 }}>Loading...</div>}
                  </div>
                </>
              )}

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
      {pendingSwitchOrg && (
        <OrgSwitchConfirmModal
          organizationName={pendingSwitchOrg.name}
          submitting={switchingOrgId !== null}
          error={switchError}
          onCancel={() => { setPendingSwitchOrg(null); setSwitchError(null); }}
          onConfirm={confirmSwitchOrganization}
        />
      )}
    </header>
  );
}
