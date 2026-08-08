import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Alert, FlatList, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerList } from "../../components/Shimmer";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { LightingDevice } from "../../types/controls";

interface AutomationAction { id: number; deviceId: number; turnOn: boolean; brightness: number | null; device: { id: number; name: string } }
interface Automation {
  id: number; name: string; isEnabled: boolean; daysOfWeek: number[]; timeOfDay: string;
  actionType: "DEVICE" | "SCENE"; actions: AutomationAction[]; targetSceneId: number | null; targetScene: { id: number; name: string } | null; offTimeOfDay: string | null;
}
interface Scene { id: number; name: string }
interface AutomationRun { id: number; automationName: string; trigger: "ON" | "OFF"; status: "SUCCESS" | "PARTIAL" | "FAILED"; deviceCount: number; failedCount: number; message: string | null; ranAt: string }
interface DraftAction { turnOn: boolean; brightness: number | null }

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function daysSummary(days: number[]): string {
  if (days.length === 7) return "Every day";
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return "Weekdays";
  if (days.length === 2 && [0, 6].every((d) => days.includes(d))) return "Weekends";
  return [...days].sort().map((d) => DAY_LABELS[d]).join(", ");
}
function actionSummary(a: Automation): string {
  if (a.actionType === "SCENE") return `Activate "${a.targetScene?.name ?? "scene"}"`;
  if (a.actions.length === 0) return "No devices selected";
  if (a.actions.length === 1) return `Turn ${a.actions[0].turnOn ? "On" : "Off"} "${a.actions[0].device.name}"`;
  const names = a.actions.slice(0, 2).map((x) => x.device.name).join(", ");
  const rest = a.actions.length - 2;
  return `${names}${rest > 0 ? ` +${rest} more` : ""}`;
}
function emptyForm() {
  return { name: "", days: new Set<number>([1, 2, 3, 4, 5]), timeOfDay: "18:00", actionType: "DEVICE" as "DEVICE" | "SCENE", drafts: new Map<number, DraftAction>(), targetSceneId: null as number | null, offEnabled: false, offTimeOfDay: "23:00" };
}

// Mirrors client/src/pages/lighting/AutomationsTab.tsx's List and Log views (the Calendar view is
// redundant with List on a phone-sized screen and stays web-only).
export function LightingAutomationsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"list" | "log">("list");
  const [logPage, setLogPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [scenePickerOpen, setScenePickerOpen] = useState(false);

  const { data: automations, isLoading } = useQuery({ queryKey: ["mobile-lighting-automations"], queryFn: async () => (await axiosClient.get("/lighting/automations")).data as Automation[] });
  const { data: devices } = useQuery({ queryKey: ["mobile-lighting-devices-picker-auto"], queryFn: async () => (await axiosClient.get("/lighting/devices")).data as LightingDevice[] });
  const { data: scenes } = useQuery({ queryKey: ["mobile-lighting-scenes-picker"], queryFn: async () => (await axiosClient.get("/lighting/scenes")).data as Scene[] });
  const { data: runsPage, isLoading: runsLoading } = useQuery({
    queryKey: ["mobile-lighting-automation-runs", logPage],
    queryFn: async () => (await axiosClient.get(`/lighting/automations/runs`, { params: { page: logPage, pageSize: 25 } })).data as { runs: AutomationRun[]; total: number; page: number; pageSize: number },
    enabled: view === "log",
  });

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["mobile-lighting-automations"] }); }
  function closeForm() { setFormOpen(false); setEditing(null); setForm(emptyForm()); }
  function startEdit(a: Automation) {
    setEditing(a);
    setForm({
      name: a.name, days: new Set(a.daysOfWeek), timeOfDay: a.timeOfDay, actionType: a.actionType,
      drafts: new Map(a.actions.map((x) => [x.deviceId, { turnOn: x.turnOn, brightness: x.brightness }])),
      targetSceneId: a.targetSceneId, offEnabled: a.offTimeOfDay != null, offTimeOfDay: a.offTimeOfDay ?? "23:00",
    });
    setFormOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        daysOfWeek: [...form.days],
        timeOfDay: form.timeOfDay,
        actionType: form.actionType,
        actions: form.actionType === "DEVICE" ? [...form.drafts.entries()].map(([deviceId, a]) => ({ deviceId, turnOn: a.turnOn, brightness: a.brightness })) : undefined,
        targetSceneId: form.actionType === "SCENE" ? form.targetSceneId : null,
        offTimeOfDay: form.actionType === "DEVICE" && form.offEnabled ? form.offTimeOfDay : null,
      };
      return editing ? axiosClient.patch(`/lighting/automations/${editing.id}`, body) : axiosClient.post("/lighting/automations", body);
    },
    onSuccess: () => { invalidate(); closeForm(); },
  });
  const toggleMutation = useMutation({ mutationFn: ({ id, isEnabled }: { id: number; isEnabled: boolean }) => axiosClient.patch(`/lighting/automations/${id}`, { isEnabled }), onSuccess: invalidate });
  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/lighting/automations/${id}`), onSuccess: invalidate });
  const duplicateMutation = useMutation({ mutationFn: (id: number) => axiosClient.post(`/lighting/automations/${id}/duplicate`), onSuccess: invalidate });

  function confirmDelete(a: Automation) {
    Alert.alert("Delete Automation", `Delete "${a.name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(a.id) },
    ]);
  }
  function toggleDay(d: number) {
    setForm((f) => {
      const next = new Set(f.days);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return { ...f, days: next };
    });
  }
  function toggleDevice(deviceId: number, on: boolean, kind: LightingDevice["kind"]) {
    const next = new Map(form.drafts);
    if (on) next.set(deviceId, { turnOn: true, brightness: kind === "LIGHT" ? 100 : null });
    else next.delete(deviceId);
    setForm((f) => ({ ...f, drafts: next }));
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };
  const sceneOptions: PickerOption[] = (scenes ?? []).map((s) => ({ id: s.id, label: s.name }));
  const canSave = form.name.trim() && form.days.size > 0 && (form.actionType === "DEVICE" ? form.drafts.size > 0 : form.targetSceneId != null) && (form.actionType !== "DEVICE" || !form.offEnabled || form.offTimeOfDay !== form.timeOfDay);

  if (isLoading) return <ShimmerList />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
        {(["list", "log"] as const).map((v) => (
          <TouchableOpacity key={v} style={{ flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: view === v ? colors.primary : "transparent" }} onPress={() => setView(v)}>
            <Text style={{ color: view === v ? colors.primary : colors.textMuted, fontSize: 12.5, fontWeight: "700" }}>{v === "list" ? "List" : "Run Log"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {view === "list" ? (
        <FlatList
          data={automations ?? []}
          keyExtractor={(a) => String(a.id)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          ListHeaderComponent={
            hasPermission("lighting", "create") ? (
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, marginBottom: spacing.md }} onPress={() => setFormOpen(true)}>
                <Ionicons name="add" size={16} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Add Automation</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center" }}>No automations yet — schedule when a light or scene turns on or off.</Text>}
          renderItem={({ item: a }) => (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "700" }}>{a.name}</Text>
                  {!a.isEnabled && <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700" }}>(Disabled)</Text>}
                </View>
                {hasPermission("lighting", "edit") && (
                  <Switch value={a.isEnabled} onValueChange={(v) => toggleMutation.mutate({ id: a.id, isEnabled: v })} trackColor={{ true: colors.primary, false: colors.border }} />
                )}
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 4 }}>
                {daysSummary(a.daysOfWeek)} · On {a.timeOfDay}{a.offTimeOfDay ? ` → Off ${a.offTimeOfDay}` : ""} · {actionSummary(a)}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {hasPermission("lighting", "edit") && (
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startEdit(a)}>
                    <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Edit</Text>
                  </TouchableOpacity>
                )}
                {hasPermission("lighting", "duplicate") && (
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => duplicateMutation.mutate(a.id)}>
                    <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Duplicate</Text>
                  </TouchableOpacity>
                )}
                {hasPermission("lighting", "delete") && (
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(a)}>
                    <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={runsPage?.runs ?? []}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          ListEmptyComponent={!runsLoading ? <Text style={{ color: colors.textMuted, textAlign: "center" }}>No automations have fired yet.</Text> : null}
          renderItem={({ item: r }) => (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{r.automationName}</Text>
                <Text style={{ color: r.status === "SUCCESS" ? colors.success : r.status === "PARTIAL" ? colors.warning : colors.danger, fontSize: 10.5, fontWeight: "700" }}>{r.status}</Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>{dayjs(r.ranAt).format("DD MMM, HH:mm:ss")} · {r.trigger} · {r.deviceCount - r.failedCount}/{r.deviceCount} succeeded</Text>
              {r.message && <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 2 }}>{r.message}</Text>}
            </View>
          )}
          ListFooterComponent={
            runsPage && runsPage.total > runsPage.pageSize ? (
              <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 12, marginTop: spacing.sm }}>
                <TouchableOpacity disabled={logPage <= 1} onPress={() => setLogPage((p) => p - 1)}>
                  <Text style={{ color: logPage <= 1 ? colors.textMuted : colors.primary, fontSize: 12, fontWeight: "700" }}>‹ Prev</Text>
                </TouchableOpacity>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>Page {runsPage.page} of {Math.max(1, Math.ceil(runsPage.total / runsPage.pageSize))}</Text>
                <TouchableOpacity disabled={logPage * runsPage.pageSize >= runsPage.total} onPress={() => setLogPage((p) => p + 1)}>
                  <Text style={{ color: logPage * runsPage.pageSize >= runsPage.total ? colors.textMuted : colors.primary, fontSize: 12, fontWeight: "700" }}>Next ›</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}

      {formOpen && (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "85%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{editing ? "Edit Automation" : "Add Automation"}</Text>
              <TouchableOpacity onPress={closeForm}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              <TextInput style={inputStyle} placeholder="e.g. Evening porch light" placeholderTextColor={colors.textMuted} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />

              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>Days</Text>
              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                {DAY_LABELS.map((label, i) => (
                  <TouchableOpacity key={label} onPress={() => toggleDay(i)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: form.days.has(i) ? colors.primary : colors.border, backgroundColor: form.days.has(i) ? colors.primarySoft : "transparent" }}>
                    <Text style={{ color: form.days.has(i) ? colors.primary : colors.text, fontSize: 12, fontWeight: "700" }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", marginBottom: 4 }}>Time (HH:mm)</Text>
                  <TextInput style={inputStyle} placeholder="18:00" placeholderTextColor={colors.textMuted} value={form.timeOfDay} onChangeText={(v) => setForm((f) => ({ ...f, timeOfDay: v }))} />
                </View>
              </View>

              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>Action</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: form.actionType === "DEVICE" ? colors.primary : colors.border, backgroundColor: form.actionType === "DEVICE" ? colors.primarySoft : "transparent" }} onPress={() => setForm((f) => ({ ...f, actionType: "DEVICE" }))}>
                  <Text style={{ color: form.actionType === "DEVICE" ? colors.primary : colors.text, fontSize: 12, fontWeight: "700" }}>Turn devices on/off</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: form.actionType === "SCENE" ? colors.primary : colors.border, backgroundColor: form.actionType === "SCENE" ? colors.primarySoft : "transparent" }} onPress={() => setForm((f) => ({ ...f, actionType: "SCENE" }))}>
                  <Text style={{ color: form.actionType === "SCENE" ? colors.primary : colors.text, fontSize: 12, fontWeight: "700" }}>Activate a scene</Text>
                </TouchableOpacity>
              </View>

              {form.actionType === "DEVICE" ? (
                <>
                  <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8 }} onPress={() => setForm((f) => ({ ...f, offEnabled: !f.offEnabled }))}>
                    <Ionicons name={form.offEnabled ? "checkbox" : "square-outline"} size={18} color={form.offEnabled ? colors.primary : colors.textMuted} />
                    <Text style={{ color: colors.text, fontSize: 12.5 }}>Also turn these devices off at a time</Text>
                  </TouchableOpacity>
                  {form.offEnabled && (
                    <TextInput style={inputStyle} placeholder="23:00" placeholderTextColor={colors.textMuted} value={form.offTimeOfDay} onChangeText={(v) => setForm((f) => ({ ...f, offTimeOfDay: v }))} />
                  )}
                  {form.offEnabled && form.offTimeOfDay === form.timeOfDay && <Text style={{ color: colors.danger, fontSize: 11 }}>Off time must be different from the on time.</Text>}

                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>Devices ({form.drafts.size} included)</Text>
                  {(devices ?? []).map((d) => {
                    const included = form.drafts.has(d.id);
                    return (
                      <TouchableOpacity key={d.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }} onPress={() => toggleDevice(d.id, !included, d.kind)}>
                        <Ionicons name={included ? "checkbox" : "square-outline"} size={20} color={included ? colors.primary : colors.textMuted} />
                        <Text style={{ color: colors.text, fontSize: 13 }}>{d.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              ) : (
                <TouchableOpacity style={[inputStyle, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]} onPress={() => setScenePickerOpen(true)}>
                  <Text style={{ color: form.targetSceneId ? colors.text : colors.textMuted, fontSize: 13.5 }}>{scenes?.find((s) => s.id === form.targetSceneId)?.name ?? "Select scene…"}</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </ScrollView>
            <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.md, opacity: canSave ? 1 : 0.5 }} disabled={!canSave || saveMutation.isPending} onPress={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{editing ? "Save" : "Create"}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
      <PickerModal visible={scenePickerOpen} title="Scene" options={sceneOptions} selectedId={form.targetSceneId} onSelect={(id) => setForm((f) => ({ ...f, targetSceneId: id as number | null }))} onClose={() => setScenePickerOpen(false)} />
    </View>
  );
}
