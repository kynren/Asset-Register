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

interface Organization { id: number; name: string; parentId: number | null }
interface PersonCard { id: number; cardNumber: string; cardType: string }
interface Person {
  id: number;
  personId: string;
  name: string;
  gender: "MALE" | "FEMALE";
  email: string | null;
  phone: string | null;
  organizationId: number | null;
  organization: { id: number; name: string } | null;
  validFrom: string | null;
  validTo: string | null;
  longTermEffective: boolean;
  remark: string | null;
  cards: PersonCard[];
}

const CARD_TYPES = ["Normal Card", "Visitor Card", "Duress Card", "Patrol Card"];

function emptyForm() {
  return { personId: "", name: "", gender: "MALE" as "MALE" | "FEMALE", email: "", phone: "", organizationId: null as number | null, validFrom: "", validTo: "", longTermEffective: false, remark: "" };
}

// Mirrors client/src/pages/accessControl/PersonsTab.tsx. Organizations render as a flat chip
// filter instead of the web's nested drag-free tree (no mobile precedent for a tree browser —
// same simplification already applied elsewhere this session), and card enrollment drops the
// ISAPI "Read from device" capture + Local/Remote ReaderSettingsModal — manual card-number entry
// only, since that hardware-reader chrome has no equivalent already built on mobile.
export function PersonsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = hasPermission("access-control", "edit");
  const canCreate = hasPermission("access-control", "create");
  const canDelete = hasPermission("access-control", "delete");
  const canDuplicate = hasPermission("access-control", "duplicate");

  const [orgFilter, setOrgFilter] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [orgPickerOpen, setOrgPickerOpen] = useState(false);
  const [addingOrg, setAddingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [cardSheetPerson, setCardSheetPerson] = useState<Person | null>(null);
  const [addingCard, setAddingCard] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardType, setCardType] = useState(CARD_TYPES[0]);
  const [cardTypePickerOpen, setCardTypePickerOpen] = useState(false);

  const { data: organizations } = useQuery({ queryKey: ["mobile-access-control-organizations"], queryFn: async () => (await axiosClient.get("/access-control/organizations")).data as Organization[] });
  const { data: persons, isLoading } = useQuery({
    queryKey: ["mobile-access-control-persons", orgFilter, search],
    queryFn: async () => (await axiosClient.get("/access-control/persons", { params: { organizationId: orgFilter ?? undefined, search: search || undefined } })).data as Person[],
  });

  function invalidatePersons() { queryClient.invalidateQueries({ queryKey: ["mobile-access-control-persons"] }); }
  function invalidateOrgs() { queryClient.invalidateQueries({ queryKey: ["mobile-access-control-organizations"] }); }

  function closeForm() { setFormOpen(false); setEditing(null); setForm(emptyForm()); }
  function startEdit(p: Person) {
    setEditing(p);
    setForm({ personId: p.personId, name: p.name, gender: p.gender, email: p.email ?? "", phone: p.phone ?? "", organizationId: p.organizationId, validFrom: p.validFrom ? p.validFrom.slice(0, 10) : "", validTo: p.validTo ? p.validTo.slice(0, 10) : "", longTermEffective: p.longTermEffective, remark: p.remark ?? "" });
    setFormOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        personId: form.personId, name: form.name, gender: form.gender, email: form.email || undefined, phone: form.phone || undefined,
        organizationId: form.organizationId, validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : null, validTo: form.validTo ? new Date(form.validTo).toISOString() : null,
        longTermEffective: form.longTermEffective, remark: form.remark || undefined,
      };
      return editing ? axiosClient.patch(`/access-control/persons/${editing.id}`, body) : axiosClient.post("/access-control/persons", body);
    },
    onSuccess: () => { invalidatePersons(); closeForm(); },
  });
  const deleteMutation = useMutation({ mutationFn: (id: number) => axiosClient.delete(`/access-control/persons/${id}`), onSuccess: invalidatePersons });
  const duplicateMutation = useMutation({ mutationFn: (id: number) => axiosClient.post(`/access-control/persons/${id}/duplicate`), onSuccess: invalidatePersons });
  const addOrgMutation = useMutation({ mutationFn: () => axiosClient.post("/access-control/organizations", { name: newOrgName.trim(), parentId: null }), onSuccess: () => { invalidateOrgs(); setAddingOrg(false); setNewOrgName(""); } });

  const addCardMutation = useMutation({
    mutationFn: () => axiosClient.post(`/access-control/persons/${cardSheetPerson!.id}/cards`, { cardNumber, cardType }),
    onSuccess: () => { invalidatePersons(); setAddingCard(false); setCardNumber(""); setCardType(CARD_TYPES[0]); },
  });
  const deleteCardMutation = useMutation({
    mutationFn: (cardId: number) => axiosClient.delete(`/access-control/persons/${cardSheetPerson!.id}/cards/${cardId}`),
    onSuccess: invalidatePersons,
  });

  function confirmDelete(p: Person) {
    Alert.alert("Delete Person", `Remove "${p.name}" from the directory? This also removes any enrolled credentials. This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(p.id) },
    ]);
  }

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: colors.text, backgroundColor: colors.bg };
  const orgOptions: PickerOption[] = (organizations ?? []).map((o) => ({ id: o.id, label: o.name }));
  const liveCardPerson = cardSheetPerson ? (persons?.find((p) => p.id === cardSheetPerson.id) ?? cardSheetPerson) : null;

  if (isLoading && !persons) return <ShimmerList />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: spacing.lg, paddingBottom: 0, gap: spacing.sm }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput style={[inputStyle, { flex: 1 }]} placeholder="Search name or Person ID..." placeholderTextColor={colors.textMuted} value={search} onChangeText={setSearch} />
          {canCreate && (
            <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, justifyContent: "center" }} onPress={() => { setForm(emptyForm()); setFormOpen(true); }}>
              <Ionicons name="add" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <TouchableOpacity onPress={() => setOrgFilter(null)} style={{ borderWidth: 1, borderColor: orgFilter === null ? colors.primary : colors.border, backgroundColor: orgFilter === null ? colors.primary + "22" : colors.bg, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: orgFilter === null ? colors.primary : colors.text, fontSize: 12, fontWeight: "600" }}>All</Text>
          </TouchableOpacity>
          {(organizations ?? []).map((o) => (
            <TouchableOpacity key={o.id} onPress={() => setOrgFilter(o.id)} style={{ borderWidth: 1, borderColor: orgFilter === o.id ? colors.primary : colors.border, backgroundColor: orgFilter === o.id ? colors.primary + "22" : colors.bg, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: orgFilter === o.id ? colors.primary : colors.text, fontSize: 12, fontWeight: "600" }}>{o.name}</Text>
            </TouchableOpacity>
          ))}
          {canCreate && (
            <TouchableOpacity onPress={() => setAddingOrg(true)} style={{ borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>+ Organization</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      <FlatList
        data={persons ?? []}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListEmptyComponent={<Text style={{ color: colors.textMuted, textAlign: "center" }}>No persons enrolled yet.</Text>}
        renderItem={({ item: p }) => (
          <TouchableOpacity style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md }} onPress={() => startEdit(p)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 }}>{p.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{p.personId}</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 4 }}>
              {p.organization?.name ?? "Unassigned"} · {p.cards.length} card{p.cards.length === 1 ? "" : "s"}
              {p.longTermEffective ? " · Long-term" : p.validFrom || p.validTo ? ` · ${p.validFrom ? dayjs(p.validFrom).format("DD MMM YY") : "…"}–${p.validTo ? dayjs(p.validTo).format("DD MMM YY") : "…"}` : ""}
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={(e) => { e.stopPropagation(); setCardSheetPerson(p); }}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Cards</Text>
              </TouchableOpacity>
              {canDuplicate && (
                <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={(e) => { e.stopPropagation(); duplicateMutation.mutate(p.id); }}>
                  <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>Duplicate</Text>
                </TouchableOpacity>
              )}
              {canDelete && (
                <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 6 }} onPress={(e) => { e.stopPropagation(); confirmDelete(p); }}>
                  <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        )}
      />

      {formOpen && (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "88%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{editing ? "Edit Person" : "Add Person"}</Text>
              <TouchableOpacity onPress={closeForm}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              <TextInput style={inputStyle} placeholder="Person ID *  e.g. 00000005" placeholderTextColor={colors.textMuted} value={form.personId} onChangeText={(v) => setForm((f) => ({ ...f, personId: v }))} />
              <TextInput style={inputStyle} placeholder="Name *" placeholderTextColor={colors.textMuted} value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
              <View style={{ flexDirection: "row", gap: 16 }}>
                {(["MALE", "FEMALE"] as const).map((g) => (
                  <TouchableOpacity key={g} style={{ flexDirection: "row", alignItems: "center", gap: 6 }} onPress={() => setForm((f) => ({ ...f, gender: g }))}>
                    <Ionicons name={form.gender === g ? "radio-button-on" : "radio-button-off"} size={18} color={form.gender === g ? colors.primary : colors.textMuted} />
                    <Text style={{ color: colors.text, fontSize: 13 }}>{g === "MALE" ? "Male" : "Female"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={inputStyle} onPress={() => setOrgPickerOpen(true)}>
                <Text style={{ color: form.organizationId ? colors.text : colors.textMuted, fontSize: 14 }}>{orgOptions.find((o) => o.id === form.organizationId)?.label ?? "Organization — Unassigned"}</Text>
              </TouchableOpacity>
              <TextInput style={inputStyle} placeholder="Email" placeholderTextColor={colors.textMuted} value={form.email} onChangeText={(v) => setForm((f) => ({ ...f, email: v }))} keyboardType="email-address" autoCapitalize="none" />
              <TextInput style={inputStyle} placeholder="Tel." placeholderTextColor={colors.textMuted} value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} keyboardType="phone-pad" />
              <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8 }} onPress={() => setForm((f) => ({ ...f, longTermEffective: !f.longTermEffective }))}>
                <Ionicons name={form.longTermEffective ? "checkbox" : "square-outline"} size={20} color={form.longTermEffective ? colors.primary : colors.textMuted} />
                <Text style={{ color: colors.text, fontSize: 13 }}>Long-Term Effective</Text>
              </TouchableOpacity>
              {!form.longTermEffective && (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TextInput style={[inputStyle, { flex: 1 }]} placeholder="Valid From (YYYY-MM-DD)" placeholderTextColor={colors.textMuted} value={form.validFrom} onChangeText={(v) => setForm((f) => ({ ...f, validFrom: v }))} />
                  <TextInput style={[inputStyle, { flex: 1 }]} placeholder="Valid To (YYYY-MM-DD)" placeholderTextColor={colors.textMuted} value={form.validTo} onChangeText={(v) => setForm((f) => ({ ...f, validTo: v }))} />
                </View>
              )}
              <TextInput style={[inputStyle, { minHeight: 60, textAlignVertical: "top" }]} placeholder="Remark" placeholderTextColor={colors.textMuted} value={form.remark} onChangeText={(v) => setForm((f) => ({ ...f, remark: v }))} multiline />
              {editing && (
                <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>Door access for this person is managed under Access Groups — add them to a group there to grant access to specific doors on a schedule.</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.md, opacity: form.personId.trim() && form.name.trim() ? 1 : 0.5 }} disabled={!form.personId.trim() || !form.name.trim() || saveMutation.isPending} onPress={() => saveMutation.mutate()}>
              {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{editing ? "Save" : "Create"}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {addingOrg && (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Add Organization</Text>
              <TouchableOpacity onPress={() => setAddingOrg(false)}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <TextInput style={inputStyle} placeholder="Name *" placeholderTextColor={colors.textMuted} value={newOrgName} onChangeText={setNewOrgName} autoFocus />
            <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, marginTop: spacing.md, opacity: newOrgName.trim() ? 1 : 0.5 }} disabled={!newOrgName.trim() || addOrgMutation.isPending} onPress={() => addOrgMutation.mutate()}>
              {addOrgMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Create</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {cardSheetPerson && (
        <View style={{ position: "absolute", inset: 0, backgroundColor: "#0008", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "85%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>Cards — {cardSheetPerson.name}</Text>
              <TouchableOpacity onPress={() => { setCardSheetPerson(null); setAddingCard(false); }}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ gap: 8 }}>
              {(liveCardPerson?.cards ?? []).map((c) => (
                <View key={c.id} style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm }}>
                  <Ionicons name="key" size={18} color={colors.primary} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700", fontFamily: "monospace" }}>{c.cardNumber}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{c.cardType}</Text>
                  </View>
                  {canEdit && (
                    <TouchableOpacity onPress={() => deleteCardMutation.mutate(c.id)}><Ionicons name="close-circle-outline" size={18} color={colors.danger} /></TouchableOpacity>
                  )}
                </View>
              ))}
              {(liveCardPerson?.cards ?? []).length === 0 && <Text style={{ color: colors.textMuted, fontSize: 12 }}>No cards enrolled.</Text>}

              {canEdit && !addingCard && (
                <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, marginTop: 4 }} onPress={() => setAddingCard(true)}>
                  <Ionicons name="add" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12.5 }}>Add Card</Text>
                </TouchableOpacity>
              )}
              {addingCard && (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <TextInput style={inputStyle} placeholder="Card No." placeholderTextColor={colors.textMuted} value={cardNumber} onChangeText={setCardNumber} autoFocus />
                  <TouchableOpacity style={inputStyle} onPress={() => setCardTypePickerOpen(true)}>
                    <Text style={{ color: colors.text, fontSize: 14 }}>{cardType}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", paddingVertical: 12, opacity: cardNumber.trim() ? 1 : 0.5 }} disabled={!cardNumber.trim() || addCardMutation.isPending} onPress={() => addCardMutation.mutate()}>
                    {addCardMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Add</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      <PickerModal visible={orgPickerOpen} title="Organization" options={orgOptions} selectedId={form.organizationId} allowClear onSelect={(id) => setForm((f) => ({ ...f, organizationId: id as number | null }))} onClose={() => setOrgPickerOpen(false)} />
      <PickerModal visible={cardTypePickerOpen} title="Card Type" options={CARD_TYPES.map((t) => ({ id: t, label: t }))} selectedId={cardType} onSelect={(id) => setCardType(id as string)} onClose={() => setCardTypePickerOpen(false)} />
    </View>
  );
}
