import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Alert, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerList } from "../../components/Shimmer";
import { PickerModal, PickerOption } from "../../components/PickerModal";
import { AccessControlDevice } from "../../types/controls";

interface FullDevice extends AccessControlDevice {
  model: string | null;
  notes: string | null;
  port: number | null;
  username: string | null;
  lastCheckedAt: string | null;
  lastEventSyncAt: string | null;
}

interface FormState {
  name: string;
  ipAddress: string;
  port: string;
  username: string;
  password: string;
  locationId: number | null;
  model: string;
  notes: string;
}

function emptyForm(): FormState {
  return { name: "", ipAddress: "", port: "80", username: "", password: "", locationId: null, model: "", notes: "" };
}

const STATUS_TONE: Record<string, "success" | "danger" | "muted"> = { ONLINE: "success", OFFLINE: "danger", UNKNOWN: "muted" };

// Mirrors client/src/pages/accessControl/DevicesDoorsTab.tsx's device-level CRUD (door-level
// live control already lives on mobile's DoorListScreen). Skips IsapiTestConnectionButton's
// inline pre-save connection test — "Check Status" on the saved device card covers the same
// need, same simplification already applied to other web-only test-connection widgets.
export function AccessDevicesScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = hasPermission("access-control", "edit");
  const canCreate = hasPermission("access-control", "create");
  const canDelete = hasPermission("access-control", "delete");
  const canDuplicate = hasPermission("access-control", "duplicate");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FullDevice | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [discoveryMessage, setDiscoveryMessage] = useState<Record<number, { ok: boolean; message: string }>>({});

  const { data: devices, isLoading } = useQuery({ queryKey: ["mobile-access-control-devices-full"], queryFn: async () => (await axiosClient.get("/access-control/devices")).data as FullDevice[] });
  const { data: locations } = useQuery({ queryKey: ["mobile-locations"], queryFn: async () => (await axiosClient.get("/locations")).data as { id: number; name: string }[] });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["mobile-access-control-devices-full"] });
    queryClient.invalidateQueries({ queryKey: ["mobile-access-control-devices"] });
  }

  function closeForm() { setFormOpen(false); setEditing(null); setForm(emptyForm()); }
  function startEdit(d: FullDevice) {
    setEditing(d);
    setForm({ name: d.name, ipAddress: d.ipAddress ?? "", port: d.port != null ? String(d.port) : "80", username: d.username ?? "", password: "", locationId: d.location?.id ?? null, model: d.model ?? "", notes: d.notes ?? "" });
    setFormOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: any = { name: form.name.trim(), ipAddress: form.ipAddress || undefined, port: form.port ? Number(form.port) : null, username: form.username || undefined, locationId: form.locationId, model: form.model || undefined, notes: form.notes || undefined };
      if (form.password) body.password = form.password;
      return editing ? axiosClient.patch(`/access-control/devices/${editing.id}`, body) : axiosClient.post("/access-control/devices", body);
    },
    onSuccess: (res) => {
      const data = res.data as { id: number; doorDiscovery: { ok: boolean; message: string } | null };
      if (data.doorDiscovery) setDiscoveryMessage((m) => ({ ...m, [data.id]: data.doorDiscovery! }));
      invalidate();
      closeForm();
    },
  });
  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/access-control/devices/${id}`), onSuccess: invalidate });
  const duplicateMutation = useMutation({ mutationFn: (id: number) => axiosClient.post(`/access-control/devices/${id}/duplicate`), onSuccess: invalidate });
  const checkStatusMutation = useMutation({ mutationFn: (id: number) => axiosClient.post(`/access-control/devices/${id}/check-status`), onSuccess: invalidate });
  const refreshDoorsMutation = useMutation({
    mutationFn: (id: number) => axiosClient.post(`/access-control/devices/${id}/refresh-doors`),
    onSuccess: (res, id) => { setDiscoveryMessage((m) => ({ ...m, [id]: res.data as { ok: boolean; message: string } })); invalidate(); },
  });

  function confirmDelete(d: FullDevice) {
    Alert.alert("Delete Device", `Delete "${d.name}" and all its doors/credentials? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(d.id) },
    ]);
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };
  const locationOptions: PickerOption[] = (locations ?? []).map((l) => ({ id: l.id, label: l.name }));
  const toneColor = (t: "success" | "danger" | "muted") => (t === "success" ? colors.success : t === "danger" ? colors.danger : colors.textMuted);

  if (isLoading) return <ShimmerList />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={devices ?? []}
        keyExtractor={(d) => String(d.id)}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={
          canCreate ? (
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, marginBottom: spacing.md }} onPress={() => { setForm(emptyForm()); setFormOpen(true); }}>
              <Ionicons name="add" size={16} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Add Device</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center" }}>No access control devices registered yet.</Text>}
        renderItem={({ item: d }) => {
          const tone = STATUS_TONE[d.status] ?? "muted";
          return (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 }}>{d.name}</Text>
                <View style={{ backgroundColor: toneColor(tone) + "22", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: toneColor(tone), fontSize: 10, fontWeight: "700" }}>{d.status}</Text>
                </View>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 4 }}>
                {d.ipAddress ?? "No IP set"}{d.port ? `:${d.port}` : ""} · {d.location?.name ?? "No location"} · {d.doors.length} door{d.doors.length === 1 ? "" : "s"}
              </Text>
              {d.lastCheckedAt && <Text style={{ color: colors.textMuted, fontSize: 10.5, marginTop: 2 }}>Checked {dayjs(d.lastCheckedAt).format("DD MMM, HH:mm:ss")}</Text>}
              {discoveryMessage[d.id] && (
                <View style={{ backgroundColor: (discoveryMessage[d.id].ok ? colors.success : colors.danger) + "1a", borderRadius: radius.sm, padding: 8, marginTop: 8 }}>
                  <Text style={{ color: discoveryMessage[d.id].ok ? colors.success : colors.danger, fontSize: 11 }}>{discoveryMessage[d.id].message}</Text>
                </View>
              )}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {canEdit && (
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={checkStatusMutation.isPending} onPress={() => checkStatusMutation.mutate(d.id)}>
                    <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Check Status</Text>
                  </TouchableOpacity>
                )}
                {canEdit && (
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={refreshDoorsMutation.isPending} onPress={() => refreshDoorsMutation.mutate(d.id)}>
                    <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Refresh Doors</Text>
                  </TouchableOpacity>
                )}
                {canEdit && (
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startEdit(d)}>
                    <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Edit</Text>
                  </TouchableOpacity>
                )}
                {canDuplicate && (
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={duplicateMutation.isPending} onPress={() => duplicateMutation.mutate(d.id)}>
                    <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Duplicate</Text>
                  </TouchableOpacity>
                )}
                {canDelete && (
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(d)}>
                    <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />

      {formOpen && (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "85%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{editing ? "Edit Device" : "Add Device"}</Text>
              <TouchableOpacity onPress={closeForm}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              <TextInput style={inputStyle} placeholder="Name *" placeholderTextColor={colors.textMuted} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
              <TextInput style={inputStyle} placeholder="Model" placeholderTextColor={colors.textMuted} value={form.model} onChangeText={(v) => setForm((f) => ({ ...f, model: v }))} />
              <TouchableOpacity style={inputStyle} onPress={() => setLocationPickerOpen(true)}>
                <Text style={{ color: form.locationId ? colors.text : colors.textMuted, fontSize: 14 }}>{locationOptions.find((o) => o.id === form.locationId)?.label ?? "Location"}</Text>
              </TouchableOpacity>
              <TextInput style={inputStyle} placeholder="IP Address" placeholderTextColor={colors.textMuted} value={form.ipAddress} onChangeText={(v) => setForm((f) => ({ ...f, ipAddress: v }))} autoCapitalize="none" />
              <TextInput style={inputStyle} placeholder="Port" placeholderTextColor={colors.textMuted} value={form.port} onChangeText={(v) => setForm((f) => ({ ...f, port: v }))} keyboardType="numeric" />
              <TextInput style={inputStyle} placeholder="Username" placeholderTextColor={colors.textMuted} value={form.username} onChangeText={(v) => setForm((f) => ({ ...f, username: v }))} autoCapitalize="none" />
              <TextInput style={inputStyle} placeholder={editing ? "Password (leave blank to keep current)" : "Password"} placeholderTextColor={colors.textMuted} value={form.password} onChangeText={(v) => setForm((f) => ({ ...f, password: v }))} secureTextEntry />
              <TextInput style={[inputStyle, { minHeight: 60, textAlignVertical: "top" }]} placeholder="Notes" placeholderTextColor={colors.textMuted} value={form.notes} onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} multiline />
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>Credentials are encrypted at rest and never shown again after saving.</Text>
            </ScrollView>
            <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.md, opacity: form.name.trim() ? 1 : 0.5 }} disabled={!form.name.trim() || saveMutation.isPending} onPress={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{editing ? "Save" : "Create"}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <PickerModal visible={locationPickerOpen} title="Location" options={locationOptions} selectedId={form.locationId} allowClear onSelect={(id) => setForm((f) => ({ ...f, locationId: id as number | null }))} onClose={() => setLocationPickerOpen(false)} />
    </View>
  );
}
