import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerList } from "../../components/Shimmer";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { HomeStackParamList } from "../../navigation/types";
import { ACTIVE_DASHBOARD_QUERY_KEY } from "./activeDashboardKey";
import { HOME_WIDGET_OPTIONS, LayoutItem, layoutFromSelectedOptionIds, selectedOptionIndexesFromLayout } from "./dashboardWidgets";

const MODULE = "home";

interface DashboardRow {
  id: number;
  name: string;
  module: string;
  isDefault: boolean;
  isOwner: boolean;
  canEdit: boolean;
  ownerName?: string;
}
interface DirectoryUser { id: number; firstName: string; lastName: string; email: string }
interface Team { id: number; name: string }
interface ShareRow { id: number; canEdit: boolean; userName: string | null; userEmail: string | null; teamName: string | null }

export function DashboardManagerScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const canEdit = hasPermission("dashboard", "edit");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DashboardRow | null>(null);
  const [name, setName] = useState("");
  const [editingWidgetsFor, setEditingWidgetsFor] = useState<DashboardRow | null>(null);
  const [sharingFor, setSharingFor] = useState<DashboardRow | null>(null);

  const { data: mine, isLoading } = useQuery({ queryKey: ["mobile-dashboards-mine"], queryFn: async () => (await axiosClient.get("/dashboard/dashboards", { params: { module: MODULE } })).data as DashboardRow[] });
  const { data: shared } = useQuery({ queryKey: ["mobile-dashboards-shared"], queryFn: async () => (await axiosClient.get("/dashboard/dashboards/shared-with-me", { params: { module: MODULE } })).data as DashboardRow[] });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["mobile-dashboards-mine"] });
    queryClient.invalidateQueries({ queryKey: ["mobile-dashboards-shared"] });
    queryClient.invalidateQueries({ queryKey: ["mobile-dashboard-default-home"] });
  }

  function closeForm() { setShowForm(false); setEditing(null); setName(""); }
  function startRename(d: DashboardRow) { setEditing(d); setName(d.name); setShowForm(true); }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: { name: string; module?: string } = { name: name.trim() };
      if (editing) return axiosClient.patch(`/dashboard/dashboards/${editing.id}`, payload);
      payload.module = MODULE;
      return axiosClient.post("/dashboard/dashboards", payload);
    },
    onSuccess: () => { invalidate(); closeForm(); },
  });

  const setDefaultMutation = useMutation({ mutationFn: (id: number) => axiosClient.patch(`/dashboard/dashboards/${id}`, { isDefault: true }), onSuccess: invalidate });
  const duplicateMutation = useMutation({ mutationFn: (id: number) => axiosClient.post(`/dashboard/dashboards/${id}/duplicate`), onSuccess: invalidate });
  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/dashboard/dashboards/${id}`), onSuccess: invalidate });

  function confirmDelete(d: DashboardRow) {
    Alert.alert(`Delete "${d.name}"`, "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(d.id) },
    ]);
  }

  function useDashboard(d: DashboardRow) {
    queryClient.setQueryData(ACTIVE_DASHBOARD_QUERY_KEY, d.id);
    navigation.goBack();
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };

  function DashboardCard({ d, mine: isMine }: { d: DashboardRow; mine: boolean }) {
    return (
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{d.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{isMine ? "Created by you" : `Shared by ${d.ownerName}`}{d.isDefault ? " · Default" : ""}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => useDashboard(d)}>
            <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Use this dashboard</Text>
          </TouchableOpacity>
          {d.canEdit && (
            <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => setEditingWidgetsFor(d)}>
              <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Widgets</Text>
            </TouchableOpacity>
          )}
          {isMine && (
            <>
              {!d.isDefault && (
                <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={setDefaultMutation.isPending} onPress={() => setDefaultMutation.mutate(d.id)}>
                  <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Set Default</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startRename(d)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Rename</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => setSharingFor(d)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={duplicateMutation.isPending} onPress={() => duplicateMutation.mutate(d.id)}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Duplicate</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(d)}>
                <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
              </TouchableOpacity>
            </>
          )}
          {!isMine && (
            <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={duplicateMutation.isPending} onPress={() => duplicateMutation.mutate(d.id)}>
              <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Duplicate</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  if (isLoading) return <ShimmerList />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>
        Save named sets of which dashboard sections show, switch between them, and share one with a teammate. Drag-and-drop widget placement and custom query widgets stay web-only for now.
      </Text>

      {!showForm ? (
        canEdit && (
          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, marginBottom: spacing.md }} onPress={() => setShowForm(true)}>
            <Ionicons name="add" size={16} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>New Dashboard</Text>
          </TouchableOpacity>
        )
      ) : (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 10, marginBottom: spacing.md }}>
          <TextInput style={inputStyle} placeholder="Dashboard name" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: "center", paddingVertical: 10 }} onPress={closeForm}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12.5 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 10, opacity: name.trim() ? 1 : 0.5 }} disabled={!name.trim() || saveMutation.isPending} onPress={() => saveMutation.mutate()}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12.5 }}>{editing ? "Save" : "Create"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700", marginBottom: spacing.sm }}>My Dashboards</Text>
      {(mine ?? []).length === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>No dashboards yet.</Text>
      ) : (
        <FlatList data={mine} keyExtractor={(d) => String(d.id)} scrollEnabled={false} renderItem={({ item }) => <DashboardCard d={item} mine />} />
      )}

      <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700", marginTop: spacing.sm, marginBottom: spacing.sm }}>Shared With Me</Text>
      {(shared ?? []).length === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>No one has shared a dashboard with you yet.</Text>
      ) : (
        <FlatList data={shared} keyExtractor={(d) => String(d.id)} scrollEnabled={false} renderItem={({ item }) => <DashboardCard d={item} mine={false} />} />
      )}

      {editingWidgetsFor && <WidgetsSheet dashboard={editingWidgetsFor} onClose={() => setEditingWidgetsFor(null)} />}
      {sharingFor && <ShareDashboardSheet dashboard={sharingFor} onClose={() => setSharingFor(null)} />}
    </ScrollView>
  );
}

function WidgetsSheet({ dashboard, onClose }: { dashboard: DashboardRow; onClose: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();

  const { data: detail, isLoading } = useQuery({ queryKey: ["mobile-dashboard-layout-edit", dashboard.id], queryFn: async () => (await axiosClient.get(`/dashboard/dashboards/${dashboard.id}/layout`)).data as { layoutJson: LayoutItem[] } });
  const [selected, setSelected] = useState<Set<number> | null>(null);

  useEffect(() => {
    if (detail && selected === null) setSelected(selectedOptionIndexesFromLayout(detail.layoutJson));
  }, [detail, selected]);

  const saveMutation = useMutation({
    mutationFn: () => axiosClient.put(`/dashboard/dashboards/${dashboard.id}/layout`, { layout: layoutFromSelectedOptionIds(selected ?? new Set()) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["mobile-dashboard-default-home"] }); queryClient.invalidateQueries({ queryKey: ["mobile-dashboard-layout"] }); onClose(); },
  });

  function toggle(index: number) {
    setSelected((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "80%" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Widgets — {dashboard.name}</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
        </View>
        {isLoading || selected === null ? (
          <ShimmerList />
        ) : (
          <FlatList
            data={HOME_WIDGET_OPTIONS}
            keyExtractor={(_, i) => String(i)}
            style={{ maxHeight: 380 }}
            renderItem={({ item, index }) => (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }} onPress={() => toggle(index)}>
                <Ionicons name={selected!.has(index) ? "checkbox" : "square-outline"} size={20} color={selected!.has(index) ? colors.primary : colors.textMuted} />
                <Text style={{ color: colors.text, fontSize: 13.5 }}>{item.label}</Text>
              </TouchableOpacity>
            )}
          />
        )}
        <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.md, opacity: saveMutation.isPending ? 0.6 : 1 }} disabled={saveMutation.isPending} onPress={() => saveMutation.mutate()}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ShareDashboardSheet({ dashboard, onClose }: { dashboard: DashboardRow; onClose: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const queryClient = useQueryClient();
  const [targetType, setTargetType] = useState<"user" | "team">("user");
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: users } = useQuery({ queryKey: ["mobile-users-directory-dashboards"], queryFn: async () => (await axiosClient.get("/users/directory")).data as DirectoryUser[] });
  const { data: teams } = useQuery({ queryKey: ["mobile-teams-dashboards"], queryFn: async () => (await axiosClient.get("/teams")).data as Team[] });
  const { data: shares, refetch } = useQuery({ queryKey: ["mobile-dashboard-shares", dashboard.id], queryFn: async () => (await axiosClient.get(`/dashboard/dashboards/${dashboard.id}/shares`)).data as ShareRow[] });

  const addMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/dashboard/dashboards/${dashboard.id}/shares`, targetType === "user" ? { userId: id, canEdit: false } : { teamId: id, canEdit: false }),
    onSuccess: () => { refetch(); queryClient.invalidateQueries({ queryKey: ["mobile-dashboards-shared"] }); },
  });
  const removeMutation = useMutation({
    mutationFn: (shareId: number) => axiosClient.delete(`/dashboard/dashboards/${dashboard.id}/shares/${shareId}`),
    onSuccess: () => { refetch(); queryClient.invalidateQueries({ queryKey: ["mobile-dashboards-shared"] }); },
  });

  const userOptions: PickerOption[] = (users ?? []).filter((u) => !(shares ?? []).some((s) => s.userEmail === u.email)).map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}` }));
  const teamOptions: PickerOption[] = (teams ?? []).filter((t) => !(shares ?? []).some((s) => s.teamName === t.name)).map((t) => ({ id: t.id, label: t.name }));

  return (
    <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "80%" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Share "{dashboard.name}"</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
        </View>

        {(shares ?? []).length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: spacing.md }}>Not shared with anyone yet.</Text>}
        <FlatList
          data={shares ?? []}
          keyExtractor={(s) => String(s.id)}
          style={{ maxHeight: 200 }}
          renderItem={({ item: s }) => (
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: 13 }}>{s.userName ?? `Team: ${s.teamName}`}</Text>
              <TouchableOpacity disabled={removeMutation.isPending} onPress={() => removeMutation.mutate(s.id)}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              </TouchableOpacity>
            </View>
          )}
        />

        <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
          <TouchableOpacity style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: targetType === "user" ? colors.primary : colors.border, backgroundColor: targetType === "user" ? colors.primarySoft : "transparent" }} onPress={() => setTargetType("user")}>
            <Text style={{ color: targetType === "user" ? colors.primary : colors.text, fontSize: 12, fontWeight: "700" }}>Person</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: targetType === "team" ? colors.primary : colors.border, backgroundColor: targetType === "team" ? colors.primarySoft : "transparent" }} onPress={() => setTargetType("team")}>
            <Text style={{ color: targetType === "team" ? colors.primary : colors.text, fontSize: 12, fontWeight: "700" }}>Team</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, alignItems: "center", marginTop: spacing.sm }} onPress={() => setPickerOpen(true)}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>{targetType === "user" ? "Add a person" : "Add a team"}</Text>
        </TouchableOpacity>

        <PickerModal visible={pickerOpen} title={targetType === "user" ? "Share with" : "Share with team"} options={targetType === "user" ? userOptions : teamOptions} searchable onSelect={(id) => addMutation.mutate(Number(id))} onClose={() => setPickerOpen(false)} />
      </View>
    </View>
  );
}
