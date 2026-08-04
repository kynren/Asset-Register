import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { axiosClient } from "../../api/axiosClient";
import { useAuth } from "../../auth/AuthContext";
import { Icon } from "../../components/Icon";
import { FormModal } from "../../components/FormModal";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ChipSelect } from "../../components/ChipSelect";

type NavPosition = "sidebar" | "topbar";

interface ThemeRow {
  id: number;
  name: string;
  navPosition: NavPosition;
  primaryColor: string;
  sidebarBgColor: string | null;
  sidebarTextColor: string | null;
  pageBgColor: string | null;
  isDark: boolean;
  createdById: number;
  createdBy: { id: number; firstName: string; lastName: string };
}

// Quick-pick starting points, in the spirit of GLPI's named palette selector (Auror, Midnight,
// Icecream, etc.) — clicking one just fills in the color fields below, still fully editable
// afterward. Not tied to any particular product's exact hex values, just similar variety.
const PRESETS: { name: string; primaryColor: string; sidebarBgColor: string; sidebarTextColor: string }[] = [
  { name: "Classic Blue", primaryColor: "#1d4ed8", sidebarBgColor: "#1b2b4b", sidebarTextColor: "#dbe4ff" },
  { name: "Midnight", primaryColor: "#fbbf24", sidebarBgColor: "#0f172a", sidebarTextColor: "#e2e8f0" },
  { name: "Forest", primaryColor: "#16a34a", sidebarBgColor: "#0f2e1d", sidebarTextColor: "#d7f7e3" },
  { name: "Sunset", primaryColor: "#f97316", sidebarBgColor: "#3b1d0f", sidebarTextColor: "#ffe4d1" },
  { name: "Plum", primaryColor: "#a855f7", sidebarBgColor: "#2a1240", sidebarTextColor: "#ecdcff" },
  { name: "Slate", primaryColor: "#0891b2", sidebarBgColor: "#1e293b", sidebarTextColor: "#e2e8f0" },
];

function themeLabel(t: ThemeRow) {
  return `${t.name}${t.navPosition === "topbar" ? " · Top bar" : ""}`;
}

export function AppearanceTab() {
  const { activeTheme, setActiveTheme, user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ThemeRow | null>(null);
  const [deleting, setDeleting] = useState<ThemeRow | null>(null);
  const [sharing, setSharing] = useState<ThemeRow | null>(null);

  const { data: myThemes, isLoading } = useQuery({
    queryKey: ["appearance-themes-mine"],
    queryFn: async () => (await axiosClient.get("/appearance-themes")).data as ThemeRow[],
  });
  const { data: sharedThemes } = useQuery({
    queryKey: ["appearance-themes-shared"],
    queryFn: async () => (await axiosClient.get("/appearance-themes/shared-with-me")).data as ThemeRow[],
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["appearance-themes-mine"] });
    queryClient.invalidateQueries({ queryKey: ["appearance-themes-shared"] });
  }

  const activateMutation = useMutation({
    mutationFn: (theme: ThemeRow) => axiosClient.post(`/appearance-themes/${theme.id}/activate`),
    onSuccess: (_res, theme) => setActiveTheme(theme),
  });
  const deactivateMutation = useMutation({
    mutationFn: () => axiosClient.post("/appearance-themes/deactivate"),
    onSuccess: () => setActiveTheme(null),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/appearance-themes/${id}`),
    onSuccess: (_res, id) => {
      invalidate();
      setDeleting(null);
      if (activeTheme?.id === id) setActiveTheme(null);
    },
  });

  const cardsFor = (themes: ThemeRow[] | undefined, mine: boolean) =>
    (themes ?? []).map((t) => {
      const isActive = activeTheme?.id === t.id;
      return (
        <div key={t.id} className="card" style={{ padding: 14 }}>
          <div className="row gap-2" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <div className="row gap-2" style={{ alignItems: "center" }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: t.sidebarBgColor ?? "var(--color-sidebar-bg)", border: `2px solid ${t.primaryColor}`, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{themeLabel(t)}</div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {mine ? "Created by you" : `Shared by ${t.createdBy.firstName} ${t.createdBy.lastName}`}
                </div>
              </div>
            </div>
            {isActive && <span className="badge badge-success">Active</span>}
          </div>
          <div className="row gap-1" style={{ marginTop: 10, flexWrap: "wrap" }}>
            <button className="btn btn-secondary btn-sm" disabled={isActive || activateMutation.isPending} onClick={() => activateMutation.mutate(t)}>
              <Icon name="check" size={12} /> {isActive ? "Active" : "Use this theme"}
            </button>
            {mine && (
              <>
                <button className="btn btn-secondary btn-sm btn-icon" title="Edit" onClick={() => setEditing(t)}><Icon name="edit" size={12} /></button>
                <button className="btn btn-secondary btn-sm btn-icon" title="Share" onClick={() => setSharing(t)}><Icon name="profile" size={12} /></button>
                <button className="btn btn-danger btn-sm btn-icon" title="Delete" onClick={() => setDeleting(t)}><Icon name="trash" size={12} /></button>
              </>
            )}
          </div>
        </div>
      );
    });

  return (
    <div className="stack gap-3">
      <div className="card">
        <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 className="mt-0 mb-0">Appearance</h3>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Customize your color palette and switch the main menu between a left sidebar and a horizontal bar under
              the header. Save it as a theme you can reuse, and share it with teammates.
            </p>
          </div>
          {activeTheme ? (
            <button className="btn btn-secondary btn-sm" onClick={() => deactivateMutation.mutate()} disabled={deactivateMutation.isPending}>
              Reset to Default
            </button>
          ) : (
            <span className="badge badge-neutral">Using default look</span>
          )}
        </div>
      </div>

      <div className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ margin: 0 }}>My Themes</h4>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}><Icon name="plus" size={12} /> New Theme</button>
      </div>
      {isLoading ? (
        <p className="muted">Loading...</p>
      ) : (myThemes ?? []).length === 0 ? (
        <div className="empty-state">No themes yet — create one to customize your colors and menu layout.</div>
      ) : (
        <div className="grid grid-cols-2" style={{ gap: 12 }}>{cardsFor(myThemes, true)}</div>
      )}

      <h4 style={{ margin: "8px 0 0" }}>Shared With Me</h4>
      {(sharedThemes ?? []).length === 0 ? (
        <div className="empty-state">No one has shared a theme with you yet.</div>
      ) : (
        <div className="grid grid-cols-2" style={{ gap: 12 }}>{cardsFor(sharedThemes, false)}</div>
      )}

      {(showForm || editing) && (
        <ThemeFormModal
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={(theme) => {
            setShowForm(false);
            setEditing(null);
            invalidate();
            if (activeTheme?.id === theme.id) setActiveTheme(theme);
          }}
        />
      )}

      {sharing && <ShareThemeModal theme={sharing} onClose={() => setSharing(null)} />}

      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"`}
          message="Anyone currently using this theme (including people you shared it with) will revert to the default look."
          danger
          loading={deleteMutation.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}

      {!user && null}
    </div>
  );
}

function ThemeFormModal({ initial, onClose, onSaved }: { initial: ThemeRow | null; onClose: () => void; onSaved: (theme: ThemeRow) => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [navPosition, setNavPosition] = useState<NavPosition>(initial?.navPosition ?? "sidebar");
  const [primaryColor, setPrimaryColor] = useState(initial?.primaryColor ?? "#1d4ed8");
  const [customizeSidebar, setCustomizeSidebar] = useState(!!(initial?.sidebarBgColor || initial?.sidebarTextColor));
  const [sidebarBgColor, setSidebarBgColor] = useState(initial?.sidebarBgColor ?? "#1b2b4b");
  const [sidebarTextColor, setSidebarTextColor] = useState(initial?.sidebarTextColor ?? "#dbe4ff");
  const [customizePageBg, setCustomizePageBg] = useState(!!initial?.pageBgColor);
  const [pageBgColor, setPageBgColor] = useState(initial?.pageBgColor ?? "#f4f6f9");
  const [isDark, setIsDark] = useState(initial?.isDark ?? false);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        navPosition,
        primaryColor,
        sidebarBgColor: customizeSidebar ? sidebarBgColor : null,
        sidebarTextColor: customizeSidebar ? sidebarTextColor : null,
        pageBgColor: customizePageBg ? pageBgColor : null,
        isDark,
      };
      return initial
        ? ((await axiosClient.patch(`/appearance-themes/${initial.id}`, payload)).data as ThemeRow)
        : ((await axiosClient.post("/appearance-themes", payload)).data as ThemeRow);
    },
    onSuccess: onSaved,
  });

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setPrimaryColor(preset.primaryColor);
    setCustomizeSidebar(true);
    setSidebarBgColor(preset.sidebarBgColor);
    setSidebarTextColor(preset.sidebarTextColor);
  }

  return (
    <FormModal
      title={initial ? `Edit "${initial.name}"` : "New Appearance Theme"}
      onClose={onClose}
      onSubmit={() => mutation.mutate()}
      submitting={mutation.isPending}
      submitDisabled={!name.trim()}
    >
      {mutation.isError && <div className="alert alert-danger">{(mutation.error as any)?.response?.data?.error ?? "Could not save this theme."}</div>}

      <div className="field"><label>Name *</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Dark Theme" /></div>

      <div className="field">
        <label>Menu Position</label>
        <div className="row gap-2">
          <button type="button" className={`btn btn-sm ${navPosition === "sidebar" ? "btn-primary" : "btn-secondary"}`} onClick={() => setNavPosition("sidebar")}>
            <Icon name="sliders" size={12} /> Sidebar
          </button>
          <button type="button" className={`btn btn-sm ${navPosition === "topbar" ? "btn-primary" : "btn-secondary"}`} onClick={() => setNavPosition("topbar")}>
            <Icon name="menu" size={12} /> Top Bar
          </button>
        </div>
      </div>

      <div className="field">
        <label>Quick Palettes</label>
        <div className="row gap-2 flex-wrap">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              title={p.name}
              onClick={() => applyPreset(p)}
              style={{ width: 30, height: 30, borderRadius: "50%", background: p.sidebarBgColor, border: `3px solid ${p.primaryColor}`, cursor: "pointer" }}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <label>Accent / Primary Color</label>
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} style={{ width: 44, height: 30, padding: 0, border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer" }} />
          <span className="muted" style={{ fontSize: 12, fontFamily: "monospace" }}>{primaryColor}</span>
        </div>
      </div>

      <label className="row gap-2" style={{ cursor: "pointer", marginBottom: 8 }}>
        <input type="checkbox" checked={customizeSidebar} onChange={(e) => setCustomizeSidebar(e.target.checked)} />
        Customize {navPosition === "topbar" ? "menu bar" : "sidebar"} colors
      </label>
      {customizeSidebar && (
        <div className="grid grid-cols-2" style={{ marginBottom: 8 }}>
          <div className="field">
            <label>Background</label>
            <input type="color" value={sidebarBgColor} onChange={(e) => setSidebarBgColor(e.target.value)} style={{ width: 44, height: 30, padding: 0, border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer" }} />
          </div>
          <div className="field">
            <label>Text</label>
            <input type="color" value={sidebarTextColor} onChange={(e) => setSidebarTextColor(e.target.value)} style={{ width: 44, height: 30, padding: 0, border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer" }} />
          </div>
        </div>
      )}

      <label className="row gap-2" style={{ cursor: "pointer", marginBottom: 8 }}>
        <input type="checkbox" checked={customizePageBg} onChange={(e) => setCustomizePageBg(e.target.checked)} />
        Customize page background
      </label>
      {customizePageBg && (
        <div className="field">
          <input type="color" value={pageBgColor} onChange={(e) => setPageBgColor(e.target.value)} style={{ width: 44, height: 30, padding: 0, border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer" }} />
        </div>
      )}

      <label className="row gap-2" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={isDark} onChange={(e) => setIsDark(e.target.checked)} />
        This is a dark theme
      </label>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
        Informational only for now — pairs your palette with the app's existing day/night toggle rather than
        forcing one; switch modes from the topbar as usual.
      </p>
    </FormModal>
  );
}

function ShareThemeModal({ theme, onClose }: { theme: ThemeRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [pickedUserId, setPickedUserId] = useState("");

  const { data: users } = useQuery({ queryKey: ["users-directory"], queryFn: async () => (await axiosClient.get("/users/directory")).data });
  const { data: shares, refetch } = useQuery({
    queryKey: ["appearance-theme-shares", theme.id],
    queryFn: async () => (await axiosClient.get(`/appearance-themes/${theme.id}/shares`)).data as { sharedWithUserId: number; sharedWithUser: { id: number; firstName: string; lastName: string } }[],
  });

  const addMutation = useMutation({
    mutationFn: (userId: number) => axiosClient.post(`/appearance-themes/${theme.id}/share`, { userId }),
    onSuccess: () => { refetch(); setPickedUserId(""); queryClient.invalidateQueries({ queryKey: ["appearance-themes-shared"] }); },
  });
  const removeMutation = useMutation({
    mutationFn: (userId: number) => axiosClient.delete(`/appearance-themes/${theme.id}/share/${userId}`),
    onSuccess: () => { refetch(); queryClient.invalidateQueries({ queryKey: ["appearance-themes-shared"] }); },
  });

  const grantableUsers = (users ?? []).filter((u: any) => u.id !== theme.createdById && !(shares ?? []).some((s) => s.sharedWithUserId === u.id));

  return (
    <FormModal title={`Share "${theme.name}"`} onClose={onClose} hideFooter>
      <p className="muted" style={{ fontSize: 12 }}>Anyone you share this with can select it as their own active theme from their Profile.</p>
      <div className="stack gap-2" style={{ marginBottom: 14 }}>
        {(shares ?? []).length === 0 && <div className="muted" style={{ fontSize: 12 }}>Not shared with anyone yet.</div>}
        {(shares ?? []).map((s) => (
          <div key={s.sharedWithUserId} className="row gap-2" style={{ justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
            <span style={{ fontSize: 13 }}>{s.sharedWithUser.firstName} {s.sharedWithUser.lastName}</span>
            <button className="btn btn-danger btn-sm btn-icon" disabled={removeMutation.isPending} onClick={() => removeMutation.mutate(s.sharedWithUserId)}>
              <Icon name="trash" size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="row gap-2" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <ChipSelect value={pickedUserId} onChange={setPickedUserId} placeholder="Select a person..." options={grantableUsers.map((u: any) => ({ value: String(u.id), label: `${u.firstName} ${u.lastName}` }))} />
        </div>
        <button className="btn btn-primary" disabled={!pickedUserId || addMutation.isPending} onClick={() => addMutation.mutate(Number(pickedUserId))}>
          Share
        </button>
      </div>
    </FormModal>
  );
}
