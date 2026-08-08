import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerList } from "../../components/Shimmer";
import { PickerModal, PickerOption } from "../../components/PickerModal";

interface DoorRight { doorId: number; planTemplateNo: string; door: { id: number; name: string; doorNumber: number } }
interface Credential {
  id: number;
  employeeNo: string;
  cardNumber: string | null;
  hasPin: boolean;
  status: "ACTIVE" | "DISABLED";
  validFrom: string | null;
  validTo: string | null;
  person: { id: number; personId: string; name: string };
  doorRights: DoorRight[];
}
interface DeviceDoor { id: number; name: string; doorNumber: number }
interface Device { id: number; name: string; ipAddress: string | null; doors: DeviceDoor[]; credentials: Credential[] }
interface DirectoryPerson { id: number; personId: string; name: string }

function emptyForm() {
  return { personId: null as number | null, cardNumber: "", hasPin: false, validFrom: "", validTo: "", doorTemplates: {} as Record<number, string> };
}

// Mirrors client/src/pages/accessControl/CredentialsTab.tsx — provisions a person directly on a
// controller over ISAPI, including per-door access and schedule template (RightPlan) assignment.
export function CredentialsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = hasPermission("access-control", "edit");
  const canCreate = hasPermission("access-control", "create");
  const canDelete = hasPermission("access-control", "delete");

  const [addingForDevice, setAddingForDevice] = useState<Device | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [personPickerOpen, setPersonPickerOpen] = useState(false);

  const { data: devices, isLoading } = useQuery({ queryKey: ["mobile-access-control-devices-credentials"], queryFn: async () => (await axiosClient.get("/access-control/devices")).data as Device[] });
  const { data: persons } = useQuery({ queryKey: ["mobile-access-control-persons", null, ""], queryFn: async () => (await axiosClient.get("/access-control/persons")).data as DirectoryPerson[] });

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["mobile-access-control-devices-credentials"] }); }

  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/access-control/credentials/${id}`), onSuccess: invalidate });
  const toggleStatusMutation = useMutation({ mutationFn: ({ id, status }: { id: number; status: "ACTIVE" | "DISABLED" }) => axiosClient.patch(`/access-control/credentials/${id}`, { status }), onSuccess: invalidate });

  const addMutation = useMutation({
    mutationFn: () =>
      axiosClient.post(`/access-control/devices/${addingForDevice!.id}/credentials`, {
        personId: form.personId,
        cardNumber: form.cardNumber || undefined,
        hasPin: form.hasPin,
        validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : undefined,
        validTo: form.validTo ? new Date(form.validTo).toISOString() : undefined,
        doorRights: Object.entries(form.doorTemplates).map(([doorId, planTemplateNo]) => ({ doorId: Number(doorId), planTemplateNo })),
      }),
    onSuccess: () => { invalidate(); setAddingForDevice(null); setForm(emptyForm()); },
  });

  function confirmDelete(c: Credential) {
    Alert.alert("Revoke Credential", `Remove ${c.person.name}'s access from this controller? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(c.id) },
    ]);
  }

  function toggleDoor(doorId: number) {
    setForm((f) => {
      const next = { ...f.doorTemplates };
      if (doorId in next) delete next[doorId]; else next[doorId] = "1";
      return { ...f, doorTemplates: next };
    });
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };
  const alreadyEnrolled = new Set((addingForDevice?.credentials ?? []).map((c) => c.person.id));
  const availablePersons = (persons ?? []).filter((p) => !alreadyEnrolled.has(p.id));
  const personOptions: PickerOption[] = availablePersons.map((p) => ({ id: p.id, label: p.name, sublabel: p.personId }));

  if (isLoading) return <ShimmerList />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        {(devices ?? []).length === 0 && <Text style={{ color: colors.textMuted, textAlign: "center" }}>Add an access control device first, then enroll credentials against it.</Text>}
        {(devices ?? []).map((device) => (
          <View key={device.id} style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{device.name}</Text>
              {canCreate && (
                <TouchableOpacity disabled={!device.ipAddress} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6, opacity: device.ipAddress ? 1 : 0.4 }} onPress={() => { setForm(emptyForm()); setAddingForDevice(device); }}>
                  <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>+ Add Credential</Text>
                </TouchableOpacity>
              )}
            </View>

            {device.credentials.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No credentials enrolled on this device yet.</Text>}
            {device.credentials.map((c) => (
              <View key={c.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 8, gap: 3 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", flex: 1 }}>{c.person.name} <Text style={{ color: colors.textMuted, fontSize: 11 }}>({c.person.personId})</Text></Text>
                  {canEdit ? (
                    <TouchableOpacity onPress={() => toggleStatusMutation.mutate({ id: c.id, status: c.status === "ACTIVE" ? "DISABLED" : "ACTIVE" })} style={{ backgroundColor: (c.status === "ACTIVE" ? colors.success : colors.textMuted) + "22", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ color: c.status === "ACTIVE" ? colors.success : colors.textMuted, fontSize: 10, fontWeight: "700" }}>{c.status}</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ backgroundColor: (c.status === "ACTIVE" ? colors.success : colors.textMuted) + "22", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ color: c.status === "ACTIVE" ? colors.success : colors.textMuted, fontSize: 10, fontWeight: "700" }}>{c.status}</Text>
                    </View>
                  )}
                  {canDelete && (
                    <TouchableOpacity onPress={() => confirmDelete(c)}><Ionicons name="trash-outline" size={16} color={colors.danger} /></TouchableOpacity>
                  )}
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {c.cardNumber ? `Card ${c.cardNumber}` : "No card"}{c.hasPin ? " · PIN set" : ""}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {c.doorRights.length === 0 ? "Controller default access" : c.doorRights.map((r) => `${r.door.name} (plan ${r.planTemplateNo})`).join(", ")}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {c.validFrom || c.validTo ? `${c.validFrom ? dayjs(c.validFrom).format("DD MMM YY") : "…"} – ${c.validTo ? dayjs(c.validTo).format("DD MMM YY") : "…"}` : "No expiry"}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      {addingForDevice && (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "88%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Add Credential — {addingForDevice.name}</Text>
              <TouchableOpacity onPress={() => setAddingForDevice(null)}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              <TouchableOpacity style={inputStyle} onPress={() => setPersonPickerOpen(true)}>
                <Text style={{ color: form.personId ? colors.text : colors.textMuted, fontSize: 14 }}>{personOptions.find((o) => o.id === form.personId)?.label ?? "Select a person..."}</Text>
              </TouchableOpacity>
              {(persons ?? []).length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No persons in the directory yet — add one under Persons first.</Text>}
              <TextInput style={inputStyle} placeholder="Card Number (optional)" placeholderTextColor={colors.textMuted} value={form.cardNumber} onChangeText={(v) => setForm((f) => ({ ...f, cardNumber: v }))} />
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8 }} onPress={() => setForm((f) => ({ ...f, hasPin: !f.hasPin }))}>
                <Ionicons name={form.hasPin ? "checkbox" : "square-outline"} size={20} color={form.hasPin ? colors.primary : colors.textMuted} />
                <Text style={{ color: colors.text, fontSize: 13 }}>Also has a PIN set directly on the controller keypad</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TextInput style={[inputStyle, { flex: 1 }]} placeholder="Valid From (YYYY-MM-DD)" placeholderTextColor={colors.textMuted} value={form.validFrom} onChangeText={(v) => setForm((f) => ({ ...f, validFrom: v }))} />
                <TextInput style={[inputStyle, { flex: 1 }]} placeholder="Valid To (YYYY-MM-DD)" placeholderTextColor={colors.textMuted} value={form.validTo} onChangeText={(v) => setForm((f) => ({ ...f, validTo: v }))} />
              </View>

              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>Door Access</Text>
              {addingForDevice.doors.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No doors added to this device yet — leave unchecked and the controller's own default access applies.</Text>}
              {addingForDevice.doors.map((door) => (
                <View key={door.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }} onPress={() => toggleDoor(door.id)}>
                    <Ionicons name={door.id in form.doorTemplates ? "checkbox" : "square-outline"} size={20} color={door.id in form.doorTemplates ? colors.primary : colors.textMuted} />
                    <Text style={{ color: colors.text, fontSize: 13 }}>{door.name} (Door {door.doorNumber})</Text>
                  </TouchableOpacity>
                  {door.id in form.doorTemplates && (
                    <TextInput
                      style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 6, width: 60, fontSize: 12, color: colors.text }}
                      value={form.doorTemplates[door.id]}
                      onChangeText={(v) => setForm((f) => ({ ...f, doorTemplates: { ...f.doorTemplates, [door.id]: v } }))}
                      placeholder="Plan #"
                      placeholderTextColor={colors.textMuted}
                    />
                  )}
                </View>
              ))}
              <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>Leave the validity dates blank for no expiry.</Text>
            </ScrollView>
            <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.md, opacity: form.personId ? 1 : 0.5 }} disabled={!form.personId || addMutation.isPending} onPress={() => addMutation.mutate()}>
              {addMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Add</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <PickerModal visible={personPickerOpen} title="Person" options={personOptions} selectedId={form.personId} searchable onSelect={(id) => setForm((f) => ({ ...f, personId: id as number | null }))} onClose={() => setPersonPickerOpen(false)} />
    </View>
  );
}
