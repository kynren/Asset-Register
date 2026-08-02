import { KeyboardEvent, useEffect, useState } from "react";
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

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

interface SearchResult {
  type: "asset" | "ticket" | "doc";
  id: number;
  path: string;
  label: string;
  sublabel: string;
}

interface SearchResponse {
  assets: SearchResult[];
  tickets: SearchResult[];
  docs: SearchResult[];
}

const SEARCH_GROUPS: { key: keyof SearchResponse; heading: string }[] = [
  { key: "assets", heading: "Assets" },
  { key: "tickets", heading: "Tickets" },
  { key: "docs", heading: "Docs & SOPs" },
];

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
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
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showClientInfo, setShowClientInfo] = useState(false);
  const navigate = useNavigate();
  const canAdmin = usePermission("admin", "view");
  const latency = useLatency();

  const { data: clientInfo } = useClientInfo();

  const isSystemAdmin = user?.roleName === "System Admin";
  const { data: organizations } = useQuery({
    queryKey: ["app-settings-organizations-switcher"],
    queryFn: async () => (await axiosClient.get<OrganizationRow[]>("/app-settings/organizations")).data,
    enabled: isSystemAdmin && menuOpen,
  });
  const [switchingOrgId, setSwitchingOrgId] = useState<number | null>(null);

  async function handleSwitchOrganization(orgId: number) {
    setSwitchingOrgId(orgId);
    try {
      await switchOrganization(orgId);
      setMenuOpen(false);
      navigate("/");
    } finally {
      setSwitchingOrgId(null);
    }
  }

  const debouncedSearch = useDebouncedValue(search.trim(), 250);
  const { data: searchResults, isFetching: searchLoading } = useQuery({
    queryKey: ["global-search", debouncedSearch],
    queryFn: async () => (await axiosClient.get<SearchResponse>("/search", { params: { q: debouncedSearch } })).data,
    enabled: debouncedSearch.length >= 2,
  });

  const flatResults = searchResults ? SEARCH_GROUPS.flatMap((g) => searchResults[g.key]) : [];
  const hasResults = flatResults.length > 0;

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  function goToResult(result: SearchResult) {
    navigate(result.path);
    setSearch("");
    setSearchOpen(false);
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setSearchOpen(false);
      e.currentTarget.blur();
      return;
    }
    if (e.key !== "Enter" || !search.trim()) return;
    if (flatResults.length > 0) {
      goToResult(flatResults[0]);
    } else {
      // No indexed match (or results haven't loaded yet) — fall back to the asset list's own
      // search filter, which also catches tags/serials that don't rank in the quick-search.
      navigate(`/assets?search=${encodeURIComponent(search.trim())}`);
      setSearchOpen(false);
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
      <button className="topbar-hamburger-btn" onClick={onToggleMobileNav} title="Menu" aria-label="Toggle navigation menu">
        <Icon name="menu" size={18} />
      </button>
      <div className="topbar-search" style={{ position: "relative" }}>
        <Icon name="search" size={14} />
        <input
          placeholder="Search assets, tickets, knowledge..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
          onKeyDown={handleSearchKeyDown}
        />
        {searchOpen && debouncedSearch.length >= 2 && (
          <div className="user-menu" style={{ top: 44, left: 0, right: "auto", width: "100%", minWidth: 320 }}>
            {searchLoading && !searchResults && <div className="empty-state" style={{ padding: 16, fontSize: 12.5 }}>Searching...</div>}
            {!searchLoading && !hasResults && <div className="empty-state" style={{ padding: 16, fontSize: 12.5 }}>No matches for "{debouncedSearch}".</div>}
            {hasResults && (
              <div style={{ maxHeight: 360, overflowY: "auto" }}>
                {SEARCH_GROUPS.map((group) => {
                  const items = searchResults?.[group.key] ?? [];
                  if (items.length === 0) return null;
                  return (
                    <div key={group.key}>
                      <div className="user-menu-header" style={{ padding: "6px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--color-text-muted)" }}>
                        {group.heading}
                      </div>
                      {items.map((item) => (
                        <div key={`${item.type}-${item.id}`} className="user-menu-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }} onMouseDown={() => goToResult(item)}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</span>
                          <span className="muted" style={{ fontSize: 11 }}>{item.sublabel}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
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

        <button className="topbar-pill topbar-pill-primary" onClick={handleExportBriefing} disabled={exporting} title="Export Briefing">
          <Icon name="fileText" size={14} />
          <span className="topbar-pill-label">{exporting ? "Exporting..." : "Export Briefing"}</span>
        </button>

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
                          onClick={() => { if (!isActive && switchingOrgId === null) handleSwitchOrganization(org.id); }}
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
    </header>
  );
}
