import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Alert, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { axiosClient } from "../../api/axiosClient";
import { useTheme } from "../../theme/ThemeContext";
import { useAuth } from "../../auth/AuthContext";
import { ShimmerList } from "../../components/Shimmer";

interface PersonRef { id: number; personId: string; name: string }
interface DoorRef { id: number; name: string; doorNumber: number; device: { id: number; name: string } }
interface AccessGroup {
  id: number;
  name: string;
  planTemplateNo: string;
  lastAppliedAt: string | null;
  members: { id: number; personId: number; person: PersonRef }[];
  doors: { id: number; doorId: number; door: DoorRef }[];
}

function emptyForm() { return { name: "", planTemplateNo: "1", personIds: new Set<number>(), doorIds: new Set<number>() }; }

// Mirrors client/src/pages/accessControl/AccessGroupTab.tsx — bundles persons + doors + a
// schedule template number into one group, then pushes it to each door's controller.
export function AccessGroupsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = hasPermission("access-control", "edit");
  const canCreate = hasPermission("access-control", "create");
  const canDelete = hasPermission("access-control", "delete");
  const canDuplicate = hasPermission("access-control", "duplicate");

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AccessGroup | null>(null);
  const [form, setForm] = useState(emptyForm());

  const { data: groups, isLoading } = useQuery({ queryKey: ["mobile-access-groups"], queryFn: async () => (await axiosClient.get("/access-control/groups")).data as AccessGroup[] });
  const { data: allPersons } = useQuery({ queryKey: ["mobile-access-control-persons", null, ""], queryFn: async () => (await axiosClient.get("/access-control/persons")).data as PersonRef[] });
  const { data: devices } = useQuery({ queryKey: ["mobile-access-control-devices"], queryFn: async () => (await axiosClient.get("/access-control/devices")).data as { id: number; name: string; doors: { id: number; name: string; doorNumber: number }[] }[] });
  const allDoors: DoorRef[] = (devices ?? []).flatMap((d) => d.doors.map((door) => ({ ...door, device: { id: d.id, name: d.name } })));

  function invalidate() { queryClient.invalidateQueries({ queryKey: ["mobile-access-groups"] }); }

  function closeForm() { setFormOpen(false); setEditing(null); setForm(emptyForm()); }
  function startEdit(g: AccessGroup) {
    setEditing(g);
    setForm({ name: g.name, planTemplateNo: g.planTemplateNo, personIds: new Set(g.members.map((m) => m.personId)), doorIds: new Set(g.doors.map((d) => d.doorId)) });
    setFormOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { name: form.name.trim(), planTemplateNo: form.planTemplateNo, personIds: [...form.personIds], doorIds: [...form.doorIds] };
      return editing ? axiosClient.patch(`/access-control/groups/${editing.id}`, body) : axiosClient.post("/access-control/groups", body);
    },
    onSuccess: () => { invalidate(); closeForm(); },
  });
  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/access-control/groups/${id}`), onSuccess: invalidate });
  const duplicateMutation = useMutation({ mutationFn: (id: number) => axiosClient.post(`/access-control/groups/${id}/duplicate`), onSuccess: invalidate });
  const applyMutation = useMutation({ mutationFn: (id: number) => axiosClient.post(`/access-control/groups/${id}/apply`), onSuccess: invalidate });

  function confirmDelete(g: AccessGroup) {
    Alert.alert("Delete Access Group", `Delete "${g.name}"? This removes the grouping only — it does not revoke access already provisioned on the controllers. This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(g.id) },
    ]);
  }

  function toggle(set: Set<number>, id: number) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };

  if (isLoading) return <ShimmerList />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={groups ?? []}
        keyExtractor={(g) => String(g.id)}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={
          canCreate ? (
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, marginBottom: spacing.md }} onPress={() => { setForm(emptyForm()); setFormOpen(true); }}>
              <Ionicons name="add" size={16} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Add Access Group</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center" }}>No access groups yet — bundle persons, doors, and a schedule into one grantable group.</Text>}
        renderItem={({ item: g }) => {
          const expanded = expandedId === g.id;
          return (
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
              <TouchableOpacity onPress={() => setExpandedId(expanded ? null : g.id)}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 }}>{g.name}</Text>
                  <View style={{ backgroundColor: (g.lastAppliedAt ? colors.success : colors.textMuted) + "22", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: g.lastAppliedAt ? colors.success : colors.textMuted, fontSize: 10, fontWeight: "700" }}>{g.lastAppliedAt ? "APPLIED" : "NOT APPLIED"}</Text>
                  </View>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 4 }}>
                  Template {g.planTemplateNo} · {g.members.length} person{g.members.length === 1 ? "" : "s"} · {g.doors.length} door{g.doors.length === 1 ? "" : "s"}
                  {g.lastAppliedAt ? ` · applied ${dayjs(g.lastAppliedAt).format("DD MMM, HH:mm")}` : ""}
                </Text>
              </TouchableOpacity>

              {expanded && (
                <View style={{ marginTop: 10, gap: 6 }}>
                  {g.members.map((m) => (
                    <Text key={m.id} style={{ color: colors.textMuted, fontSize: 12 }}>• {m.person.name} ({m.person.personId})</Text>
                  ))}
                  {g.doors.map((d) => (
                    <Text key={d.id} style={{ color: colors.textMuted, fontSize: 12 }}>◦ {d.door.device.name} — {d.door.name}</Text>
                  ))}
                  {g.members.length === 0 && g.doors.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No members or doors yet.</Text>}
                </View>
              )}

              <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {canEdit && (
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={applyMutation.isPending} onPress={() => applyMutation.mutate(g.id)}>
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>Apply to Device</Text>
                  </TouchableOpacity>
                )}
                {canEdit && (
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => startEdit(g)}>
                    <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Edit</Text>
                  </TouchableOpacity>
                )}
                {canDuplicate && (
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} disabled={duplicateMutation.isPending} onPress={() => duplicateMutation.mutate(g.id)}>
                    <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Duplicate</Text>
                  </TouchableOpacity>
                )}
                {canDelete && (
                  <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={() => confirmDelete(g)}>
                    <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>

              {applyMutation.data && applyMutation.variables === g.id && (
                <View style={{ backgroundColor: (applyMutation.data.data.ok ? colors.success : colors.danger) + "1a", borderRadius: radius.sm, padding: 8, marginTop: 8 }}>
                  <Text style={{ color: applyMutation.data.data.ok ? colors.success : colors.danger, fontSize: 11 }}>{applyMutation.data.data.message}</Text>
                </View>
              )}
            </View>
          );
        }}
      />

      {formOpen && (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "88%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{editing ? "Edit Access Group" : "Add Access Group"}</Text>
              <TouchableOpacity onPress={closeForm}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              <TextInput style={inputStyle} placeholder="Name *" placeholderTextColor={colors.textMuted} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
              <TextInput style={inputStyle} placeholder="Schedule Template  e.g. 1 = All-day" placeholderTextColor={colors.textMuted} value={form.planTemplateNo} onChangeText={(v) => setForm((f) => ({ ...f, planTemplateNo: v }))} />

              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>Persons ({form.personIds.size} selected)</Text>
              {(allPersons ?? []).length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No persons in the directory yet.</Text>}
              {(allPersons ?? []).map((p) => (
                <TouchableOpacity key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }} onPress={() => setForm((f) => ({ ...f, personIds: toggle(f.personIds, p.id) }))}>
                  <Ionicons name={form.personIds.has(p.id) ? "checkbox" : "square-outline"} size={20} color={form.personIds.has(p.id) ? colors.primary : colors.textMuted} />
                  <Text style={{ color: colors.text, fontSize: 13 }}>{p.name} <Text style={{ color: colors.textMuted }}>({p.personId})</Text></Text>
                </TouchableOpacity>
              ))}

              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginTop: 6 }}>Access Points ({form.doorIds.size} selected)</Text>
              {allDoors.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No doors added yet.</Text>}
              {allDoors.map((d) => (
                <TouchableOpacity key={d.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }} onPress={() => setForm((f) => ({ ...f, doorIds: toggle(f.doorIds, d.id) }))}>
                  <Ionicons name={form.doorIds.has(d.id) ? "checkbox" : "square-outline"} size={20} color={form.doorIds.has(d.id) ? colors.primary : colors.textMuted} />
                  <Text style={{ color: colors.text, fontSize: 13 }}>{d.device.name} — {d.name}</Text>
                </TouchableOpacity>
              ))}
              <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>Saving only updates this group locally. Use "Apply to Device" on the list to push it to each door's controller.</Text>
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
