import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { axiosClient } from "../api/axiosClient";
import { useAuth } from "../auth/AuthContext";
import { ModuleName } from "../lib/permissions";
import { Icon } from "./Icon";
import { systemConsoleNav, controlsNavGroup, settingsNav } from "../layout/navConfig";

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

const SEARCH_GROUPS: { key: keyof SearchResponse; heading: string; icon: string }[] = [
  { key: "assets", heading: "Assets", icon: "assets" },
  { key: "tickets", heading: "Tickets", icon: "helpdesk" },
  { key: "docs", heading: "Docs & SOPs", icon: "fileText" },
];

// Curated create-shortcuts — each navigates to the module's own list page with a `?new=1` query
// param that page's mount effect watches for to auto-open its existing "Add"/"New" modal, rather
// than this component knowing how to build any of those forms itself.
const QUICK_ACTIONS: { key: string; label: string; sublabel: string; icon: string; path: string; module: ModuleName }[] = [
  { key: "add-asset", label: "Add Asset", sublabel: "Asset Inventory", icon: "plus", path: "/assets?new=1", module: "assets" },
  { key: "new-ticket", label: "New Ticket", sublabel: "Helpdesk & Ticketing", icon: "plus", path: "/helpdesk?new=1", module: "helpdesk" },
  { key: "add-stock", label: "Add Stock Item", sublabel: "Stock Register & Analytics", icon: "plus", path: "/stock?new=1", module: "stock" },
  { key: "new-report", label: "New Report", sublabel: "Reports", icon: "plus", path: "/reports?new=1", module: "reports" },
];

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface Row {
  key: string;
  icon: string;
  label: string;
  sublabel?: string;
  onSelect: () => void;
}

// Global "click the header search box" launcher, opened either via the custom "open-command-palette"
// window event (dispatched by Topbar's search box) or Ctrl/Cmd+K from anywhere. Mounted once in
// AppShell so it's reachable regardless of which page is active.
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  useEffect(() => {
    function onOpenEvent() {
      setOpen(true);
    }
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("open-command-palette", onOpenEvent);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("open-command-palette", onOpenEvent);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const debouncedQuery = useDebouncedValue(query.trim(), 200);
  const { data: searchResults } = useQuery({
    queryKey: ["global-search", debouncedQuery],
    queryFn: async () => (await axiosClient.get<SearchResponse>("/search", { params: { q: debouncedQuery } })).data,
    enabled: open && debouncedQuery.length >= 2,
  });

  function close() {
    setOpen(false);
  }

  function activate(path: string) {
    navigate(path);
    close();
  }

  if (!open) return null;

  const q = query.trim().toLowerCase();

  const sections: { heading: string; rows: Row[] }[] = [];

  const filteredQuickActions = QUICK_ACTIONS.filter((a) => hasPermission(a.module, "create") && (!q || a.label.toLowerCase().includes(q)));
  if (filteredQuickActions.length > 0) {
    sections.push({
      heading: "Quick Actions",
      rows: filteredQuickActions.map((a) => ({ key: a.key, icon: a.icon, label: a.label, sublabel: a.sublabel, onSelect: () => activate(a.path) })),
    });
  }

  const navEntries = [...systemConsoleNav, ...controlsNavGroup.children, ...settingsNav];
  const filteredNav = navEntries.filter((item) => (!item.module || hasPermission(item.module as ModuleName, "view")) && (!q || item.label.toLowerCase().includes(q)));
  if (filteredNav.length > 0) {
    sections.push({
      heading: "Navigate",
      rows: filteredNav.map((item) => ({ key: `nav-${item.path}`, icon: item.icon, label: item.label, sublabel: "Go to page", onSelect: () => activate(item.path) })),
    });
  }

  if (debouncedQuery.length >= 2 && searchResults) {
    for (const group of SEARCH_GROUPS) {
      const items = searchResults[group.key];
      if (items.length === 0) continue;
      sections.push({
        heading: group.heading,
        rows: items.map((item) => ({ key: `${item.type}-${item.id}`, icon: group.icon, label: item.label, sublabel: item.sublabel, onSelect: () => activate(item.path) })),
      });
    }
  }

  const flatRows = sections.flatMap((s) => s.rows);
  const clampedActiveIndex = Math.min(activeIndex, Math.max(flatRows.length - 1, 0));

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatRows.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = flatRows[clampedActiveIndex];
      row?.onSelect();
    }
  }

  return createPortal(
    <div className="cmdk-overlay" onClick={close}>
      <div className="cmdk-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            className="cmdk-input"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search projects, workspaces, actions..."
          />
          <span className="cmdk-kbd">Esc</span>
        </div>
        <div className="cmdk-list">
          {sections.length === 0 && (
            <div className="cmdk-empty">No matches{query ? ` for "${query}"` : ""}.</div>
          )}
          {sections.map((section) => (
            <div key={section.heading}>
              <div className="cmdk-section-heading">{section.heading}</div>
              {section.rows.map((row) => {
                const idx = flatRows.indexOf(row);
                return (
                  <button
                    key={row.key}
                    type="button"
                    className={`cmdk-row${idx === clampedActiveIndex ? " cmdk-row-active" : ""}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={row.onSelect}
                  >
                    <Icon name={row.icon} size={16} />
                    <span className="cmdk-row-text">
                      <span className="cmdk-row-label">{row.label}</span>
                      {row.sublabel && <span className="cmdk-row-sublabel">{row.sublabel}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
