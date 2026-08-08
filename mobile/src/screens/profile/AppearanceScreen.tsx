import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Alert, FlatList, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { ShimmerList } from "../../components/Shimmer";

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

interface DirectoryUser { id: number; firstName: string; lastName: string }

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const PRESETS: { name: string; primaryColor: string; sidebarBgColor: string; sidebarTextColor: string }[] = [
  { name: "Classic Blue", primaryColor: "#1d4ed8", sidebarBgColor: "#1b2b4b", sidebarTextColor: "#dbe4ff" },
  { name: "Midnight", primaryColor: "#fbbf24", sidebarBgColor: "#0f172a", sidebarTextColor: "#e2e8f0" },
  { name: "Forest", primaryColor: "#16a34a", sidebarBgColor: "#0f2e1d", sidebarTextColor: "#d7f7e3" },
  { name: "Sunset", primaryColor: "#f97316", sidebarBgColor: "#3b1d0f", sidebarTextColor: "#ffe4d1" },
  { name: "Plum", primaryColor: "#a855f7", sidebarBgColor: "#2a1240", sidebarTextColor: "#ecdcff" },
  { name: "Slate", primaryColor: "#0891b2", sidebarBgColor: "#1e293b", sidebarTextColor: "#e2e8f0" },
];

function emptyForm() {
  return { name: "", navPosition: "sidebar" as NavPosition, primaryColor: "#1d4ed8", customizeSidebar: false, sidebarBgColor: "#1b2b4b", sidebarTextColor: "#dbe4ff", customizePageBg: false, pageBgColor: "#f4f6f9", isDark: false };
}

// Mirrors client/src/pages/profile/AppearanceTab.tsx — this manages the WEB app's active theme
// (sidebar/topbar colors, page background) for this account; it doesn't re-skin the mobile app
// itself, which has its own separate light/dark ThemeContext. GET /auth/me's activeTheme field is
// used to know which theme (if any) is currently active, rather than extending AuthContext for a
// setting mobile's own UI doesn't consume.
export function AppearanceScreen() {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ThemeRow | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [sharingTheme, setSharingTheme] = useState<ThemeRow | null>(null);
  const [activeThemeId, setActiveThemeId] = useState<number | null | undefined>(undefined);

  const { data: me } = useQuery({ queryKey: ["mobile-auth-me-appearance"], queryFn: async () => (await axiosClient.get("/auth/me")).data as { activeTheme: { id: number } | null } });
  useEffect(() => { if (me !== undefined) setActiveThemeId(me.activeTheme?.id ?? null); }, [me]);

  const { data: myThemes, isLoading } = useQuery({ queryKey: ["mobile-appearance-themes-mine"], queryFn: async () => (await axiosClient.get("/appearance-themes")).data as ThemeRow[] });
  const { data: sharedThemes } = useQuery({ queryKey: ["mobile-appearance-themes-shared"], queryFn: async () => (await axiosClient.get("/appearance-themes/shared-with-me")).data as ThemeRow[] });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["mobile-appearance-themes-mine"] });
    queryClient.invalidateQueries({ queryKey: ["mobile-appearance-themes-shared"] });
  }

  const activateMutation = useMutation({ mutationFn: (id: number) => axiosClient.post(`/appearance-themes/${id}/activate`), onSuccess: (_res, id) => setActiveThemeId(id) });
  const deactivateMutation = useMutation({ mutationFn: () => axiosClient.post("/appearance-themes/deactivate"), onSuccess: () => setActiveThemeId(null) });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => axiosClient.delete(`/appearance-themes/${id}`),
    onSuccess: (_res, id) => { invalidate(); if (activeThemeId === id) setActiveThemeId(null); },
  });

  function confirmDelete(t: ThemeRow) {
    Alert.alert(`Delete "${t.name}"`, "Anyone currently using this theme (including people you shared it with) will revert to the default look.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(t.id) },
    ]);
  }

  function closeForm() { setShowForm(false); setEditing(null); setForm(emptyForm()); }
  function startEdit(t: ThemeRow) {
    setEditing(t);
    setForm({
      name: t.name, navPosition: t.navPosition, primaryColor: t.primaryColor,
      customizeSidebar: !!(t.sidebarBgColor || t.sidebarTextColor), sidebarBgColor: t.sidebarBgColor ?? "#1b2b4b", sidebarTextColor: t.sidebarTextColor ?? "#dbe4ff",
      customizePageBg: !!t.pageBgColor, pageBgColor: t.pageBgColor ?? "#f4f6f9", isDark: t.isDark,
    });
    setShowForm(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        navPosition: form.navPosition,
        primaryColor: form.primaryColor,
        sidebarBgColor: form.customizeSidebar ? form.sidebarBgColor : null,
        sidebarTextColor: form.customizeSidebar ? form.sidebarTextColor : null,
        pageBgColor: form.customizePageBg ? form.pageBgColor : null,
        isDark: form.isDark,
      };
      return editing ? axiosClient.patch(`/appearance-themes/${editing.id}`, payload) : axiosClient.post("/appearance-themes", payload);
    },
    onSuccess: () => { invalidate(); closeForm(); },
  });

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setForm((f) => ({ ...f, primaryColor: preset.primaryColor, customizeSidebar: true, sidebarBgColor: preset.sidebarBgColor, sidebarTextColor: preset.sidebarTextColor }));
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };
  const panel = { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md };

  function ThemeCard({ t, mine }: { t: ThemeRow; mine: boolean }) {
    const isActive = activeThemeId === t.id;
    return (
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <View style={{ width: 28, height: 28, borderRadius: radius.sm, backgroundColor: t.sidebarBgColor ?? colors.bg, borderWidth: 2, borderColor: t.primaryColor }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{t.name}{t.navPosition === "topbar" ? " · Top bar" : ""}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{mine ? "Created by you" : `Shared by ${t.createdBy.firstName} ${t.createdBy.lastName}`}</Text>
          </View>
          {isActive && (
            <View style={{ backgroundColor: colors.success + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: colors.success, fontSize: 10, fontWeight: "700" }}>Active</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6, opacity: isActive ? 0.5 : 1 }} disabled={isActive || activateMutation.isPending} onPress={() => activateMutation.mutate(t.id)}>
            <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>{isActive ? "Active" : "Use this theme"}</Text>
          </TouchableOpacity>
          {mine && (
            <>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startEdit(t)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => setSharingTheme(t)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(t)}>
                <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  if (isLoading) return <ShimmerList />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={panel}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Appearance</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 2 }}>Customize your web app color palette and menu layout. Save it as a theme you can reuse and share with teammates.</Text>
          </View>
          {activeThemeId ? (
            <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={deactivateMutation.isPending} onPress={() => deactivateMutation.mutate()}>
              <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Reset to Default</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ backgroundColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700" }}>Default look</Text>
            </View>
          )}
        </View>
      </View>

      {!showForm ? (
        <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, marginBottom: spacing.md }} onPress={() => setShowForm(true)}>
          <Ionicons name="add" size={16} color={colors.text} />
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>New Theme</Text>
        </TouchableOpacity>
      ) : (
        <View style={[panel, { gap: 10 }]}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{editing ? `Edit "${editing.name}"` : "New Appearance Theme"}</Text>
          <TextInput style={inputStyle} placeholder="e.g. My Dark Theme" placeholderTextColor={colors.textMuted} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />

          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>Menu Position</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: form.navPosition === "sidebar" ? colors.primary : colors.border, backgroundColor: form.navPosition === "sidebar" ? colors.primarySoft : "transparent" }} onPress={() => setForm((f) => ({ ...f, navPosition: "sidebar" }))}>
              <Text style={{ color: form.navPosition === "sidebar" ? colors.primary : colors.text, fontSize: 12, fontWeight: "700" }}>Sidebar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: form.navPosition === "topbar" ? colors.primary : colors.border, backgroundColor: form.navPosition === "topbar" ? colors.primarySoft : "transparent" }} onPress={() => setForm((f) => ({ ...f, navPosition: "topbar" }))}>
              <Text style={{ color: form.navPosition === "topbar" ? colors.primary : colors.text, fontSize: 12, fontWeight: "700" }}>Top Bar</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>Quick Palettes</Text>
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            {PRESETS.map((p) => (
              <TouchableOpacity key={p.name} onPress={() => applyPreset(p)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: p.sidebarBgColor, borderWidth: 3, borderColor: p.primaryColor }} />
            ))}
          </View>

          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>Accent / Primary Color</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View style={{ width: 32, height: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: HEX_COLOR_PATTERN.test(form.primaryColor) ? form.primaryColor : colors.bg }} />
            <TextInput style={[inputStyle, { flex: 1, fontFamily: "monospace" }]} value={form.primaryColor} onChangeText={(v) => setForm((f) => ({ ...f, primaryColor: v }))} maxLength={7} autoCapitalize="none" />
          </View>

          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8 }} onPress={() => setForm((f) => ({ ...f, customizeSidebar: !f.customizeSidebar }))}>
            <Ionicons name={form.customizeSidebar ? "checkbox" : "square-outline"} size={18} color={form.customizeSidebar ? colors.primary : colors.textMuted} />
            <Text style={{ color: colors.text, fontSize: 12.5 }}>Customize {form.navPosition === "topbar" ? "menu bar" : "sidebar"} colors</Text>
          </TouchableOpacity>
          {form.customizeSidebar && (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 10.5, marginBottom: 4 }}>Background</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 4, borderWidth: 1, borderColor: colors.border, backgroundColor: HEX_COLOR_PATTERN.test(form.sidebarBgColor) ? form.sidebarBgColor : colors.bg }} />
                  <TextInput style={[inputStyle, { flex: 1, fontSize: 11.5, fontFamily: "monospace", paddingVertical: 8 }]} value={form.sidebarBgColor} onChangeText={(v) => setForm((f) => ({ ...f, sidebarBgColor: v }))} maxLength={7} autoCapitalize="none" />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 10.5, marginBottom: 4 }}>Text</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 4, borderWidth: 1, borderColor: colors.border, backgroundColor: HEX_COLOR_PATTERN.test(form.sidebarTextColor) ? form.sidebarTextColor : colors.bg }} />
                  <TextInput style={[inputStyle, { flex: 1, fontSize: 11.5, fontFamily: "monospace", paddingVertical: 8 }]} value={form.sidebarTextColor} onChangeText={(v) => setForm((f) => ({ ...f, sidebarTextColor: v }))} maxLength={7} autoCapitalize="none" />
                </View>
              </View>
            </View>
          )}

          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8 }} onPress={() => setForm((f) => ({ ...f, customizePageBg: !f.customizePageBg }))}>
            <Ionicons name={form.customizePageBg ? "checkbox" : "square-outline"} size={18} color={form.customizePageBg ? colors.primary : colors.textMuted} />
            <Text style={{ color: colors.text, fontSize: 12.5 }}>Customize page background</Text>
          </TouchableOpacity>
          {form.customizePageBg && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 24, height: 24, borderRadius: 4, borderWidth: 1, borderColor: colors.border, backgroundColor: HEX_COLOR_PATTERN.test(form.pageBgColor) ? form.pageBgColor : colors.bg }} />
              <TextInput style={[inputStyle, { flex: 1, fontSize: 11.5, fontFamily: "monospace", paddingVertical: 8 }]} value={form.pageBgColor} onChangeText={(v) => setForm((f) => ({ ...f, pageBgColor: v }))} maxLength={7} autoCapitalize="none" />
            </View>
          )}

          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8 }} onPress={() => setForm((f) => ({ ...f, isDark: !f.isDark }))}>
            <Ionicons name={form.isDark ? "checkbox" : "square-outline"} size={18} color={form.isDark ? colors.primary : colors.textMuted} />
            <Text style={{ color: colors.text, fontSize: 12.5 }}>This is a dark theme</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>Informational only — pairs your palette with the web app's existing day/night toggle.</Text>

          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }} onPress={closeForm}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: form.name.trim() ? 1 : 0.5 }} disabled={!form.name.trim() || saveMutation.isPending} onPress={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>{editing ? "Save" : "Create"}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700", marginBottom: spacing.sm }}>My Themes</Text>
      {(myThemes ?? []).length === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>No themes yet — create one to customize your colors and menu layout.</Text>
      ) : (
        <FlatList data={myThemes} keyExtractor={(t) => String(t.id)} scrollEnabled={false} renderItem={({ item }) => <ThemeCard t={item} mine />} />
      )}

      <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700", marginTop: spacing.sm, marginBottom: spacing.sm }}>Shared With Me</Text>
      {(sharedThemes ?? []).length === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>No one has shared a theme with you yet.</Text>
      ) : (
        <FlatList data={sharedThemes} keyExtractor={(t) => String(t.id)} scrollEnabled={false} renderItem={({ item }) => <ThemeCard t={item} mine={false} />} />
      )}

      {sharingTheme && <ShareThemeSheet theme={sharingTheme} onClose={() => setSharingTheme(null)} />}
    </ScrollView>
  );
}

function ShareThemeSheet({ theme, onClose }: { theme: ThemeRow; onClose: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: users } = useQuery({ queryKey: ["mobile-users-directory-appearance"], queryFn: async () => (await axiosClient.get("/users/directory")).data as DirectoryUser[] });
  const { data: shares, refetch } = useQuery({
    queryKey: ["mobile-appearance-theme-shares", theme.id],
    queryFn: async () => (await axiosClient.get(`/appearance-themes/${theme.id}/shares`)).data as { sharedWithUserId: number; sharedWithUser: DirectoryUser }[],
  });

  const addMutation = useMutation({
    mutationFn: (userId: number) => axiosClient.post(`/appearance-themes/${theme.id}/share`, { userId }),
    onSuccess: () => { refetch(); queryClient.invalidateQueries({ queryKey: ["mobile-appearance-themes-shared"] }); },
  });
  const removeMutation = useMutation({
    mutationFn: (userId: number) => axiosClient.delete(`/appearance-themes/${theme.id}/share/${userId}`),
    onSuccess: () => { refetch(); queryClient.invalidateQueries({ queryKey: ["mobile-appearance-themes-shared"] }); },
  });

  const grantableUsers = (users ?? []).filter((u) => u.id !== theme.createdById && !(shares ?? []).some((s) => s.sharedWithUserId === u.id));
  const options: PickerOption[] = grantableUsers.map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}` }));

  return (
    <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "75%" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Share "{theme.name}"</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 11.5, marginBottom: spacing.md }}>Anyone you share this with can select it as their own active theme from their Profile.</Text>

        {(shares ?? []).length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>Not shared with anyone yet.</Text>}
        <FlatList
          data={shares ?? []}
          keyExtractor={(s) => String(s.sharedWithUserId)}
          style={{ maxHeight: 220 }}
          renderItem={({ item: s }) => (
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: 13 }}>{s.sharedWithUser.firstName} {s.sharedWithUser.lastName}</Text>
              <TouchableOpacity disabled={removeMutation.isPending} onPress={() => removeMutation.mutate(s.sharedWithUserId)}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              </TouchableOpacity>
            </View>
          )}
        />

        <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, alignItems: "center", marginTop: spacing.md }} onPress={() => setPickerOpen(true)}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Add a person</Text>
        </TouchableOpacity>

        <PickerModal visible={pickerOpen} title="Share with" options={options} searchable onSelect={(id) => addMutation.mutate(Number(id))} onClose={() => setPickerOpen(false)} />
      </View>
    </View>
  );
}
