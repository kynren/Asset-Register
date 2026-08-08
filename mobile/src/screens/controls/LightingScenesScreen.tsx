import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Alert, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerList } from "../../components/Shimmer";
import { LightingDevice } from "../../types/controls";

interface SceneAction { id: number; deviceId: number; turnOn: boolean; brightness: number | null; device: { id: number; name: string } }
interface Scene { id: number; name: string; icon: string | null; actions: SceneAction[] }
interface DraftAction { turnOn: boolean; brightness: number | null }

const ICON_CHOICES: { name: keyof typeof Ionicons.glyphMap; key: string }[] = [
  { key: "star", name: "star-outline" },
  { key: "moon", name: "moon-outline" },
  { key: "sun", name: "sunny-outline" },
  { key: "bulb", name: "bulb-outline" },
  { key: "diamond", name: "diamond-outline" },
  { key: "layers", name: "layers-outline" },
  { key: "home", name: "home-outline" },
  { key: "gauge", name: "speedometer-outline" },
];

function emptyForm() {
  return { name: "", icon: "star", drafts: new Map<number, DraftAction>() };
}

// Mirrors client/src/pages/lighting/ScenesTab.tsx + DeviceActionPicker.tsx.
export function LightingScenesScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Scene | null>(null);
  const [form, setForm] = useState(emptyForm());

  const { data: scenes, isLoading } = useQuery({ queryKey: ["mobile-lighting-scenes-full"], queryFn: async () => (await axiosClient.get("/lighting/scenes")).data as Scene[] });
  const { data: devices } = useQuery({ queryKey: ["mobile-lighting-devices-picker"], queryFn: async () => (await axiosClient.get("/lighting/devices")).data as LightingDevice[] });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["mobile-lighting-scenes-full"] });
    queryClient.invalidateQueries({ queryKey: ["mobile-lighting-scenes"] });
  }

  function closeForm() { setFormOpen(false); setEditing(null); setForm(emptyForm()); }
  function startEdit(scene: Scene) {
    setEditing(scene);
    setForm({ name: scene.name, icon: scene.icon ?? "star", drafts: new Map(scene.actions.map((a) => [a.deviceId, { turnOn: a.turnOn, brightness: a.brightness }])) });
    setFormOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { name: form.name.trim(), icon: form.icon, actions: [...form.drafts.entries()].map(([deviceId, a]) => ({ deviceId, turnOn: a.turnOn, brightness: a.brightness })) };
      return editing ? axiosClient.patch(`/lighting/scenes/${editing.id}`, body) : axiosClient.post("/lighting/scenes", body);
    },
    onSuccess: () => { invalidate(); closeForm(); },
  });
  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/lighting/scenes/${id}`), onSuccess: invalidate });
  const duplicateMutation = useMutation({ mutationFn: (id: number) => axiosClient.post(`/lighting/scenes/${id}/duplicate`), onSuccess: invalidate });
  const activateMutation = useMutation({ mutationFn: (id: number) => axiosClient.post(`/lighting/scenes/${id}/activate`) });

  function confirmDelete(scene: Scene) {
    Alert.alert("Delete Scene", `Delete "${scene.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(scene.id) },
    ]);
  }

  function toggleDevice(deviceId: number, on: boolean, kind: LightingDevice["kind"]) {
    const next = new Map(form.drafts);
    if (on) next.set(deviceId, { turnOn: true, brightness: kind === "LIGHT" ? 100 : null });
    else next.delete(deviceId);
    setForm((f) => ({ ...f, drafts: next }));
  }
  function updateAction(deviceId: number, patch: Partial<DraftAction>) {
    const next = new Map(form.drafts);
    const existing = next.get(deviceId);
    if (existing) next.set(deviceId, { ...existing, ...patch });
    setForm((f) => ({ ...f, drafts: next }));
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };

  if (isLoading) return <ShimmerList />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={scenes ?? []}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={
          hasPermission("lighting", "create") ? (
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, marginBottom: spacing.md }} onPress={() => setFormOpen(true)}>
              <Ionicons name="add" size={16} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Add Scene</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center" }}>No scenes yet — bundle a few devices' on/off states into one click.</Text>}
        renderItem={({ item: scene }) => (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name={(ICON_CHOICES.find((i) => i.key === scene.icon)?.name ?? "star-outline")} size={18} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 }}>{scene.name}</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 4 }}>{scene.actions.length} device{scene.actions.length === 1 ? "" : "s"}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {hasPermission("lighting", "edit") && (
                <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={activateMutation.isPending} onPress={() => activateMutation.mutate(scene.id)}>
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>Activate</Text>
                </TouchableOpacity>
              )}
              {hasPermission("lighting", "edit") && (
                <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startEdit(scene)}>
                  <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Edit</Text>
                </TouchableOpacity>
              )}
              {hasPermission("lighting", "duplicate") && (
                <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={duplicateMutation.isPending} onPress={() => duplicateMutation.mutate(scene.id)}>
                  <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Duplicate</Text>
                </TouchableOpacity>
              )}
              {hasPermission("lighting", "delete") && (
                <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(scene)}>
                  <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      />

      {formOpen && (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "85%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{editing ? "Edit Scene" : "Add Scene"}</Text>
              <TouchableOpacity onPress={closeForm}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              <TextInput style={inputStyle} placeholder="e.g. Movie Night" placeholderTextColor={colors.textMuted} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {ICON_CHOICES.map((i) => (
                  <TouchableOpacity key={i.key} onPress={() => setForm((f) => ({ ...f, icon: i.key }))} style={{ width: 36, height: 36, borderRadius: radius.sm, borderWidth: form.icon === i.key ? 2 : 1, borderColor: form.icon === i.key ? colors.primary : colors.border, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={i.name} size={16} color={form.icon === i.key ? colors.primary : colors.text} />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>Devices ({form.drafts.size} included)</Text>
              {(devices ?? []).map((d) => {
                const draft = form.drafts.get(d.id);
                const included = draft !== undefined;
                return (
                  <View key={d.id} style={{ gap: 6 }}>
                    <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8 }} onPress={() => toggleDevice(d.id, !included, d.kind)}>
                      <Ionicons name={included ? "checkbox" : "square-outline"} size={20} color={included ? colors.primary : colors.textMuted} />
                      <Text style={{ color: colors.text, fontSize: 13 }}>{d.name}</Text>
                    </TouchableOpacity>
                    {included && (
                      <View style={{ marginLeft: 28, flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 5 }} onPress={() => updateAction(d.id, { turnOn: !draft!.turnOn })}>
                          <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>{draft!.turnOn ? "Turn On" : "Turn Off"}</Text>
                        </TouchableOpacity>
                        {d.kind === "LIGHT" && draft!.turnOn && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                            <TouchableOpacity onPress={() => updateAction(d.id, { brightness: Math.max(0, (draft!.brightness ?? 100) - 10) })}><Ionicons name="remove" size={16} color={colors.text} /></TouchableOpacity>
                            <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" }}>
                              <View style={{ width: `${draft!.brightness ?? 100}%`, height: "100%", backgroundColor: colors.primary }} />
                            </View>
                            <TouchableOpacity onPress={() => updateAction(d.id, { brightness: Math.min(100, (draft!.brightness ?? 100) + 10) })}><Ionicons name="add" size={16} color={colors.text} /></TouchableOpacity>
                            <Text style={{ color: colors.textMuted, fontSize: 10.5, width: 30 }}>{draft!.brightness ?? 100}%</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.md, opacity: form.name.trim() ? 1 : 0.5 }} disabled={!form.name.trim() || saveMutation.isPending} onPress={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{editing ? "Save" : "Create"}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
